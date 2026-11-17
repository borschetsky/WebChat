# План: переход WebChat на Microsoft Entra ID (Azure identity)

Дата: 2026-11-17 · Статус: фазы 0–2 сделаны · Ветка: `feature/entra-id-backend`

## Цель

Убрать самописную аутентификацию (пароли, HS256 JWT, подтверждение email, сброс пароля)
и отдать вход Microsoft Entra. Всё, что авторизация решает *внутри* приложения — роли
workspace, статусы аккаунтов, членство и роли в группах — остаётся в нашей БД.

## Значения тенанта (не секреты)

| Что | Значение |
|---|---|
| Тенант | `WebChat Dev` (External) |
| Tenant ID | `1951c62d-3d08-436c-9a60-dbe81791e5a0` |
| Authority | `https://webchatdev.ciamlogin.com/` |
| `webchat-api` Client ID | `ef4b68e3-a337-45a9-9b17-a067436fa36c` |
| `webchat-api` Audience / App ID URI | `api://ef4b68e3-a337-45a9-9b17-a067436fa36c` |
| Scope | `api://ef4b68e3-a337-45a9-9b17-a067436fa36c/chat.access` |
| `webchat-spa` Client ID | `a2d22260-a4b1-40f5-ba5e-c7828f68d114` |

## Ключевые решения

| Вопрос | Решение | Почему |
|---|---|---|
| Какой тенант | **Entra External ID** (external tenant, `*.ciamlogin.com`) | WebChat — публичное приложение с самостоятельной регистрацией. Workforce-тенант рассчитан на сотрудников организации; B2C закрыт для новых клиентов. External ID бесплатен в пределах лимита MAU (проверить актуальный лимит перед стартом). |
| Где роли | **Остаются в БД** (`User.Role`, `User.Status`) | Сейчас роль и статус читаются на каждом запросе, поэтому разжалование/блокировка действуют мгновенно. App Roles в Entra попадают в токен и действуют только после его обновления (~1 ч). |
| Как связать внешнего пользователя с локальным | Таблица `UserLogin (Provider, Subject) → UserId`; для Entra subject = `oid` | `oid` неизменен, email и username — нет. Таблица позволяет несколько провайдеров на аккаунт без миграций. |
| `User.Identity.Name` | Продолжает возвращать **локальный** id | 24 места в коде читают его как id. Подставляем локальный id в `OnTokenValidated` и указываем его как `NameClaimType` — контроллеры и `NameUserIdProvider` (SignalR) не меняются. |
| Отзыв сессий | Вместо `SecurityStamp`: проверка `Status` на каждом запросе (уже есть) + короткий срок access token + Graph `revokeSignInSessions` | Чужой токен не может нести наш `sstamp`. |
| Переход | Две схемы параллельно (старый JWT + Entra) на время миграции, затем удалить старую | Можно делать маленькими PR, не ломая прод. |

## Фаза 0. Azure: подготовка подписки (≈1 ч)

1. Активировать пробную подписку ($200 / 30 дней).
2. **Сразу** создать Budget в Cost Management (например, $20 с оповещениями на 50/80/100%) —
   защита от случайно оставленных ресурсов.
3. Создать Resource Group `rg-webchat-dev` в одном регионе (например, West Europe).
4. Запомнить: после окончания trial ресурсы останавливаются; External ID тенант привязан
   к подписке для биллинга.

## Фаза 1. Azure: настройка Entra External ID (≈2–3 ч, без кода)

1. Microsoft Entra admin center → **Create external tenant** (например, `webchatdev`).
   Authority будет `https://webchatdev.ciamlogin.com/`.
2. **App registration №1 — API** (`webchat-api`):
   - Expose an API → Application ID URI `api://<api-client-id>`
   - Scope `chat.access` (Admins and users can consent).
3. **App registration №2 — SPA** (`webchat-spa`):
   - Platform **Single-page application**, redirect URI: `http://localhost:<порт Vite>/`
     (порт из `ClientApp/vite.config.*`) и прод-домен.
   - API permissions → `webchat-api / chat.access` → Grant admin consent.
   - Никаких client secret: SPA — публичный клиент, PKCE.
4. **User flow** «Sign up and sign in»: email + пароль (или email OTP), атрибуты Display Name;
   привязать к нему приложение `webchat-spa`.
5. (Необязательно) Identity provider Google — вход «через Google» без кода в приложении.
6. (Необязательно) Company branding — логотип и цвета на странице входа.
7. Проверка: «Run user flow» в портале, зарегистрировать тестового пользователя, посмотреть
   токен на jwt.ms — убедиться, что есть `oid`, `tid`, `aud`, `scp=chat.access`, email.

## Фаза 2. Backend: принимать внешние токены (PR 1) — ✅ сделано, ветка `feature/entra-id-backend`

По просьбе в ходе работы фаза сделана **провайдер-независимой**: Entra — лишь одна запись
в конфиге, и переключение между Azure и собственной реализацией — это правка конфига.

- **Конфиг `Auth`** (`WebChat/Auth/AuthOptions.cs`): `Auth:Local:Enabled` (наши пароли и
  HS256, по умолчанию включено) и `Auth:Oidc` — список провайдеров (`Name`, `Authority`,
  `Issuer`, `Audiences`, `RequiredScope`, `SubjectClaim`, `EmailIsVerified`). Ошибки в
  конфиге останавливают приложение при старте в любом окружении.
- **Маршрутизация** (`WebChat/Auth/AuthenticationSetup.cs`): схема по умолчанию `WebChat`
  смотрит на `iss` токена: нет `iss` → локальная схема, `iss` провайдера → `oidc:<name>`.
  Используется обычный `JwtBearer`, без `Microsoft.Identity.Web`: новый пакет не нужен,
  и имена claims не переименовываются (`MapInboundClaims = false`).
- **Таблица `UserLogin (Provider, Subject) → UserId`** вместо колонки `ExternalObjectId`:
  у одного аккаунта может быть несколько провайдеров, новый провайдер не требует миграции.
- **`ExternalLoginService`**: существующая связь → тот же аккаунт; иначе привязка по email
  (только если провайдер ручается за email; неподтверждённая локальная регистрация при этом
  теряет пароль); иначе создаётся новый участник.
- `User.Identity.Name` = локальный id для обоих видов токенов (`webchat_uid`), закреплено тестом.
- `Auth:Local:Enabled = false` → `api/auth/*` отвечает 404, локальные токены не принимаются.
- 20 новых интеграционных тестов; заодно исправлены две старые ловушки тестовой фабрики
  (гонка на общем SQLite-соединении и `UseSetting`, проигрывающий `appsettings.json`).

**Осталось в портале перед фазой 3:** в `webchat-api` → **Token configuration → Add
optional claim → Access → `email`**. Без него в access token нет email, и первый вход
падает с `external_login_no_email`.

**Не сделано в фазе 2:** приглашённые (`pending`) пользователи через Entra пока отклоняются
(фаза 4); bootstrap-владелец по-прежнему назначается только при старте приложения.

## Фаза 3. Frontend: MSAL (PR 2)

Файлы: `ClientApp/src/config.ts`, `services/auth-header.ts`, `features/auth/*`,
`features/realtime/signalrMiddleware.ts`, `app/api/chatApi.ts`, `app/api/adminApi.ts`,
`index.jsx`.

0. **Абстракция провайдера, как на backend:** интерфейс `AuthClient` (`signIn()`,
   `signOut()`, `getAccessToken()`), реализации `localAuth` (текущие формы) и `msalAuth`,
   выбор через `VITE_AUTH_PROVIDER`. RTK Query и SignalR берут токен только через
   `authClient.getAccessToken()`; экраны регистрации и сброса пароля показываются только
   для `local`.
1. Пакеты `@azure/msal-browser`, `@azure/msal-react`.
2. `config.ts`: `clientId` (SPA), `authority` (`https://webchatdev.ciamlogin.com/`),
   `scopes: ['api://<api-client-id>/chat.access']` — через `VITE_*` переменные.
3. `PublicClientApplication` + `<MsalProvider>` в `index.jsx`; кэш `sessionStorage`
   (или `localStorage`, если нужен вход между вкладками).
4. `auth-header.ts` / `prepareHeaders` в RTK Query: `acquireTokenSilent` перед каждым
   запросом, при `InteractionRequiredAuthError` → `acquireTokenRedirect`.
5. **SignalR**: сейчас `accessTokenFactory: () => token` захватывает токен один раз.
   Токены Entra живут ~1 ч → заменить на `accessTokenFactory: () => acquireTokenSilent(...)`,
   иначе переподключение через час упадёт с 401.
6. `authSlice`: больше не хранит токен в `localStorage['user-data']`; хранит только профиль
   из `GET /api/users/getprofile`. Источник истины о входе — MSAL.
7. Экраны логина/регистрации/забыли пароль → кнопка «Войти» (`loginRedirect`).
   Выход → `logoutRedirect`.
8. Тесты Vitest: замокать MSAL-инстанс; обновить `store.test.ts` и `adapters.test.ts`,
   которые проверяют `user-data` в `localStorage`.

## Фаза 4. Приглашения и админка (PR 3)

1. `InvitationsController` redeem: вместо создания пользователя с паролем — требовать вход
   через Entra, затем сопоставить приглашение по email из токена и выставить роль.
2. Блокировка в админке (`MemberAdminService`): кроме смены `Status` и разрыва SignalR-
   соединений — опционально вызвать Graph `revokeSignInSessions` (нужен app permission
   `User.RevokeSessions.All` и Managed Identity/секрет у API).
3. Политики, связанные с паролем (`WorkspacePolicy.cs`, упоминание ротации stamp) —
   пометить как неприменимые / убрать из каталога.

## Фаза 5. Удаление старой аутентификации (PR 4, после проверки в проде)

1. Убрать схему HS256 и `Smart`-селектор; `JWTSecretKey`, `JWTLifespan` из конфига.
2. Удалить `AuthController` login/register/confirm/resend-confirmation/forgot/reset,
   `AuthService.GetToken`, `HashPassword`, зависимость CryptoHelper, rate-limit
   `EmailSendPolicy` (если больше не используется приглашениями).
3. Миграция: удалить `PasswordHash`, `SecurityStamp`, `EmailConfirmed`,
   `EmailConfirmationTokenHash/SentAt`, `PasswordResetTokenHash/...`.
4. Переписать тесты `Auth/RegistrationStatusTests`, `Auth/UserNameLookupTests` и
   `Admin/AdminApiFactory` (выдаёт токены через `AuthService`).
5. Обновить `CLAUDE.md`, `docs/ctx/ORIENTATION.md` (раздел Auth) и написать ctx-заметку.

## Фаза 6 (бонус для практики). Azure-хостинг на Managed Identity

Это вторая половина «Azure identity» — приложение ходит в Azure-ресурсы без секретов.

1. App Service (Linux, B1) с **system-assigned Managed Identity**.
2. Azure Database for PostgreSQL Flexible Server (Burstable B1ms) с Entra-аутентификацией:
   Managed Identity как пользователь БД, токен через `Azure.Identity`
   (`DefaultAzureCredential`) вместо пароля в connection string.
3. Key Vault для остальных секретов (Brevo, R2) + Key Vault references в App Settings.
4. Azure SignalR Service Free tier — по желанию.
5. Локально `DefaultAzureCredential` берёт учётку из `az login` / Visual Studio.

## Оценка стоимости на trial

| Ресурс | Примерно в месяц |
|---|---|
| Entra External ID | $0 в пределах бесплатных MAU |
| App Service B1 | ~$13 |
| PostgreSQL Flexible B1ms + 32 GB | ~$15–20 |
| Key Vault | < $1 |
| SignalR Free | $0 |

Итого с запасом укладывается в $200. Цифры ориентировочные — сверить с калькулятором
Azure перед созданием ресурсов.

## Риски и ловушки

- **`NameClaimType`**: Microsoft.Identity.Web по умолчанию ставит `name` — тогда
  `User.Identity.Name` вернёт отображаемое имя, и все 24 места, читающие его как id,
  сломаются тихо (ср. #99 — account takeover из-за неверного идентификатора).
- Дубли пользователей при гонке двух первых запросов — уникальный индекс на
  `ExternalObjectId` + повторное чтение при конфликте.
- Связывание по email только при подтверждённом email, иначе захват аккаунта.
- Токен в query string для `/chat` — как и сейчас, не логировать URL с `access_token`.
- CI собирает с `-warnaserror` — проверить, что новые пакеты не тянут NuGet advisories.
- Redirect URI должен совпадать посимвольно (слэш в конце, http vs https, порт).

## Порядок работы

Фаза 0 → 1 (только портал, можно сегодня) → 2 → 3 → проверка локально end-to-end →
(6, если хочется в Azure) → 4 → 5. Каждая фаза — отдельный PR; перед коммитом —
skill `checkpoint`, как требует `CLAUDE.md`.
