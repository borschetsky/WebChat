# Orientation

A map of this repository for someone — human or agent — starting cold. It answers *where
does X live*, *what owns Y*, and *what will bite me*, and points at the dated notes for the
reasoning behind each decision.

Read this first, then the note for whatever you are about to touch (index at the bottom).
`CLAUDE.md` at the repo root is the short version; this is the long one.

---

## 1. The 60-second model

A real-time chat app. ASP.NET Core (.NET 10) REST API + a SignalR hub, with a React SPA.
Two users open threads, exchange messages, see each other's presence and typing state.

A message send is a **REST POST**, not a hub invocation. The hub is used only to *push*:
the sender's POST returns the persisted message, and the server separately pushes
`ReciveMessage` to the recipient. The client's optimistic update and the hub echo therefore
both exist, and the client de-duplicates.

```
Browser ──POST /api/hey/send──▶ HeyController ─▶ MessageService ─▶ EF Core ─▶ PostgreSQL
   ▲                                  │
   └────── ReciveMessage ── ChatHub ◀─┘   (push to the *other* participant)
```

Everything the SPA needs is behind one seam — `services/chat-service.ts` — so seven
unimplemented features can be mocked without any component knowing.

---

## 2. Repo map

The solution lives one level down at `WebChat/WebChat.sln`. **Three project folders do not
match their assembly names** — this trips up every search:

| Folder | Project / assembly | Role |
|---|---|---|
| `WebChat/WebChat` | `WebChat` | Host, controllers, SPA hosting, DI, config |
| `WebChat/WebChat.Data` | **`WebChat.Models`** | Entities and view models |
| `WebChat/WebChat.Hub` | **`WebChat.Hubs`** | `ChatHub`, connection tracking |
| `WebChat/WebChat.Connection` | `WebChat.Connection` | EF Core `DbContext`, migrations |
| `WebChat/WebChat.Services` | `WebChat.Services` | Business logic, JWT issuing, mapping |
| `WebChat/WebChat.AvatarWriter` | `WebChat.AvatarWriter` | Avatar validation, processing, storage |

The React client is at `WebChat/WebChat/ClientApp`. Context notes are in `docs/ctx`.

---

## 3. Backend

### Routes

Every controller is `[Route("api/[controller]")]`. Controller-level `[Authorize]` unless noted.

| Controller | Auth | Endpoints |
|---|---|---|
| `AuthController` | anonymous | `POST login`, `POST register` |
| `HeyController` | authorize | `POST send`, `GET getusers`, `GET getthreads`, `POST createthread` |
| `ThreadController` | authorize | `GET getmessages/{id}`, `GET search` |
| `UsersController` | authorize | `GET search`, `GET getprofile`, `POST update` |
| `AvatarsController` | authorize | `POST upload`, **`GET /images/{fileName}`** (`[AllowAnonymous]`) |
| `SeedController` | **anonymous** | `GET /api/seed` |

Two things to notice:

- **`HeyController` is the main messaging controller.** The name is historical; sending a
  message, listing threads and creating a thread all live there, not in `ThreadController`.
- **`ThreadController` has no parameterless `GET`.** `GET /api/Thread` matches no action and
  falls through to the SPA middleware, which returns a confusing 500/502 when the Vite dev
  server is down. Not an auth failure — a routing miss.
- `GET /api/seed` is anonymous and unauthenticated. Flagged in the .NET 10 note; still open.

### Auth

Hand-rolled JWT (HS256), **not** ASP.NET Identity.

> **`User.Identity.Name` carries the user *id*, not the username.** Every controller
> identifies the caller this way. Read it as an id everywhere.

The hub cannot use an `Authorization` header, so `Startup.cs:94` reads the token from the
`access_token` query string for `/chat` requests. Passwords use CryptoHelper Identity V3
PBKDF2; the iteration count is embedded in each hash, so old 10k hashes still verify
alongside new 600k ones.

### Middleware order (`Startup.Configure`)

Order is load-bearing in two places:

```
UseHttpsRedirection → UseStaticFiles → UseSpaStaticFiles → Swagger
   → UseRouting → UseCors → UseAuthentication → UseAuthorization
   → UseEndpoints → UseSpa
```

1. **`UseStaticFiles` runs before routing.** An avatar still physically present in
   `wwwroot/images` is served from disk and never reaches `AvatarsController.GetImage` —
   which is what gives legacy local avatars a free fallback after the R2 move.
2. **`UseSpa` is last and swallows everything unmatched.** Any request that misses MVC gets
   proxied to the Vite dev server, so a routing typo presents as a proxy error rather than a
   404. When the dev server is down this produces 500/502 plus, historically, a socket-
   exhausting retry storm.

### SignalR surface

Client → server (only two): `OnTyping`, `OnStopTyping`.

Server → client (eight): `ReciveMessage`, `ReciveAvatar`, `ReciveConnectedStatus`,
`ReciveDisconnectedStatus`, `ReciveTypingStatus`, `ReciveStopTypingStatus`, `ReviceThread`,
`ReviceUpdatedOpponentProfile`.

The misspellings (`Recive`, `Revice`) are in the wire protocol. **Do not "fix" them** without
changing both sides together.

**Nothing goes to `Clients.All`.** Typing is addressed to the thread's own participants minus
the typist, and refused outright when the caller is not one of them — `threadId` arrives from
the client, so that check is authorization, not tidiness. Presence goes to peers, meaning
people who share at least one thread. The hub cannot look either up itself: `WebChat.Services`
references `WebChat.Hubs`, so the dependency is inverted through `IHubDirectory`, declared in
the hub project and implemented in Services, exactly as `IConnectionMapping` is.

`ReciveTypingStatus` carries `Username` as well as `UserId` and `ThreadId`, because a group
has to name who is typing and the client has no lookup for an arbitrary user id.

### Serialization

**Newtonsoft.Json is deliberate.** Some endpoints return `Dictionary<DateTime, …>`; the
client parses those keys with `new Date(key)`. System.Text.Json formats non-string dictionary
keys differently and breaks the UI. Do not migrate it casually.

### Database

PostgreSQL via Npgsql. Code-first, and it bootstraps itself: `PrepDB.MigrateDatabaseAsync`
runs in `Program.Main` before the host starts, creating the database if missing and applying
pending migrations, retrying while the server comes up. Disable with
`Database:AutoMigrate = false`.

Every stored `DateTime` must be UTC. Columns are `timestamp with time zone`, and Npgsql
*throws* on a `Kind` of `Local` or `Unspecified` rather than guessing — so `DateTime.Now`
fails at insert time instead of merely being wrong.

### Configuration precedence

```
appsettings.json → appsettings.{Environment}.json → appsettings.Secrets.json → env vars → CLI
```

`appsettings.Secrets.json` is **gitignored** and holds real credentials;
`appsettings.Secrets.example.json` is the committed template. `Program.cs` explicitly inserts
it *ahead of* the environment-variable provider so a deployed instance always wins, and it is
excluded from both `dotnet publish` and Docker images. With credentials absent, avatars fall
back to local disk rather than failing.

---

## 4. Client

React 19 + MUI v9, built with Vite. **JSX must live in `.jsx`/`.tsx`** — Vite does not
transform JSX in `.js`.

```
src/
  app/          App, AppShell, ChatApp, store.ts, hooks.ts, api/chatApi.ts
  components/   Shared presentational primitives (PresenceAvatar, EmptyState, …)
  features/     auth composer messages notifications realtime settings threads ui
  lib/          Pure helpers (date-time-format)
  services/     The data seam: chat-service, api-service, adapters, mocks
  theme/        tokens.js (design handoff), theme.d.ts, ThemeModeProvider
  types/        dto.ts (wire shapes) / models.ts (view models)
```

### Who owns which state

This is the single most useful thing to know before editing the client:

| State | Owner | Note |
|---|---|---|
| Server data (threads, messages, profile) | **RTK Query** (`app/api/chatApi.ts`) | Cache is the source of truth |
| Session / token | `features/auth/authSlice` | Hydrated in `makeStore` preloadedState, **not** at module scope |
| Active thread, filters, overlays, snackbar | `features/ui/uiSlice` | |
| Draft text, reply target, attachment | `features/composer/composerSlice` | |
| Hub-derived overlays (presence, typing, unread) | `features/realtime/realtimeSlice` | Patches layered *over* the RTK Query cache |

Two invariants worth protecting, both with tests:

- **Typing must touch only `composerSlice`.** If a keystroke changes any other slice
  reference, subscribed components re-render and the memoized message list is defeated.
  `app/store.test.ts` asserts the other three slice references stay identical.
- **`File` objects must not enter the store** (not serializable). `composerSlice` holds
  `{key,name,size}`; the `File` lives in a module-level `Map`.

### RTK Query endpoints

`getProfile`, `getThreads`, `getMessages`, `searchThread`, `searchDirectory` (queries);
`sendMessage`, `saveProfile` (mutations).

It uses `fakeBaseQuery()` with a per-endpoint `queryFn` that delegates to `chat-service` —
**deliberately**, so the mock seam survives. Do not replace it with `fetchBaseQuery`.

### SignalR on the client

The connection is owned by `features/realtime/signalrMiddleware.ts`, a listener middleware —
not a component hook. Handlers read `getState()` at call time rather than closing over state.
It is prepended *before* the API middleware so a hub event patching the cache cannot race an
in-flight query.

### The mock seam

Six features have no backend. Every one is served from `services/mocks.ts` behind the same
call signature the real thing would have, each with a `MOCK BECAUSE:` note naming the missing
endpoint. Mocked: reactions, reply/quote, attachments, unread counts, read receipts,
notifications. **Groups are no longer mocked** — issue #37 made them real.

> **Components must talk to `services/chat-service`, never to `api-service` or `mocks`
> directly.** That seam is the whole reason mocked features are indistinguishable from real
> ones. To make one real: implement the endpoint, replace the single call site, delete the
> mock. No component should change.

Mock state is in-memory and resets on reload — never mistake it for persistence.

### Design tokens

`src/theme/tokens.js` is ported verbatim from the design handoff and is **final**. Prefer an
existing token over a new value. `theme.d.ts` augments MUI's types with the handoff's extra
background slots and the `custom` bag.

---

## 5. Traps

Ordered by how much time each has actually cost.

1. **MUI v9 drops system props on `Stack`.** `gap`, `alignItems`, `justifyContent`,
   `textAlign`, `flexWrap`, `flex` written as props are silently ignored — use `sx`. React
   forwards *both* camelCase and lowercase unknown props to the DOM as junk attributes; it
   only warns about the camelCase ones, which is why `gap` hid for days while `alignItems`
   announced itself. Guarded by `src/test/mui-drift.test.tsx`. Also affected:
   `slotProps` replaced `PaperProps` / `imgProps` / `*TypographyProps`.
2. **Vite serves a stale pre-bundle after a major dependency upgrade.** Symptom: *"does not
   provide an export named 'Navigate'"* while the installed package is correct and the
   production build is fine. Clear `node_modules/.vite` and restart with `--force`.
3. **The Vite dev server only proxies `/api`, `/chat` and `/images`.** Anything else relative
   hits the SPA fallback and returns `index.html` with **HTTP 200** — a broken resource with
   no error anywhere. This exact bug made avatars appear broken while R2 was working fine.
4. **`dotnet build` fails while the app is running.** The host locks its output DLLs; stop it
   first. The error names the PID.
5. **`launchSettings.json` is strict JSON** — no `//` comments, unlike `appsettings.json`,
   which tolerates them.
6. **ImageSharp is pinned to 3.1.x on purpose.** 4.0 fails the build outright without a paid
   Six Labors licence key. Do not "just upgrade" it.
7. **Vite is pinned to 6.x if the host runs Node 18** (Vite 8 needs Node ≥ 20.19). The
   development machine is on Node 24, so this only affects other environments.
8. **Docker has never worked here** — WSL has no distros installed. Images have never built.

---

## 6. Running and verifying

Start the dev server **first**, or the SPA proxy floods the API with failing requests:

```bash
cd WebChat/WebChat/ClientApp && npm run dev            # http://localhost:3000
cd WebChat/WebChat && dotnet run --launch-profile "WebChat (client already running on :3000)"
```

The other profile, `WebChat (starts the client automatically)`, launches the dev server
itself via `Microsoft.AspNetCore.SpaProxy` — so use that one and skip the first command.

Browse `http://localhost:3000` (Vite proxies `/api`, `/chat`, `/images`; gives HMR) or
`https://localhost:7199` (also serves Swagger). The database migrates itself on startup;
both profiles point at a Postgres on `localhost:5432`.

```bash
cd WebChat/WebChat/ClientApp
npm run verify    # lint, format:check, typecheck, test — the whole gate, in that order
npm test          # vitest — 89 tests, 11 files
npm run typecheck # tsc --noEmit
npm run lint      # oxlint --deny-warnings (warnings fail, matching the .NET 0-warning bar)
npm run format    # prettier --write .
npm run build
```

The linter is **oxlint, not ESLint**, and that is not a preference: `typescript-eslint`
refuses TypeScript 7, which the client runs, so ESLint cannot parse two thirds of `src`.
oxlint brings its own parser and hosts `eslint-plugin-react-hooks` through its `jsPlugins`
bridge, which is where the React Compiler rules come from.

> **There is no .NET test project.** All six projects are production code. Backend changes in
> this repo have been verified by curl, SQL queries and throwaway console tools — none of
> that is committed or repeatable. Treat any backend claim in a note as only as strong as the
> verification section of that note.

---

## 7. Where to look next

By task:

| About to… | Read |
|---|---|
| Touch client state, slices, RTK Query, SignalR middleware, or tests | [Redux Toolkit + RTK Query refactor](2026-08-03-redux-toolkit-refactor.md) |
| Touch components, theme, or a mocked feature | [MUI redesign](2026-08-03-mui-redesign.md) |
| Touch avatars, uploads, image handling, or R2 | [R2 avatar storage](2026-08-03-r2-avatar-storage.md) |
| Touch migrations, seeding, or startup | [Code-first DB bootstrap](2026-08-02-code-first-db-bootstrap.md) |
| Upgrade a client dependency | [ClientApp modernization](2026-08-02-clientapp-dependency-update.md) |
| Change lint rules, formatting, or a suppression | [Client lint and format](2026-08-06-client-lint-and-format.md) |
| Upgrade a NuGet package or the framework | [.NET 10 upgrade](2026-08-02-dotnet-10-upgrade.md) |

The .NET 10 note also catalogues pre-existing bugs that were deliberately left in place —
check it before "fixing" something that looks accidental.

---

## 8. Standing constraints

- **Secrets are already committed** in `appsettings.json` and `docker-compose.yml`. Do not
  add more; use `appsettings.Secrets.json` or environment variables.
- **The user is the sole author on commits** — no AI co-author trailer
  (`.claude/skills/commit-authorship/SKILL.md`).
- Branches follow `<type>/<kebab-description>`; commits follow Conventional Commits
  (`.claude/skills/git-convention/SKILL.md`). The repo's own `dev/docker` branch predates
  this and is not a model to copy.
- After any non-trivial change, record it with the `ctx` skill
  (`.claude/skills/ctx/SKILL.md`), which delegates to the `ctx-writer` agent.
