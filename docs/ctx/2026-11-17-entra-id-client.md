# Entra External ID client: "Continue with Microsoft" in the React app (phase 3)

- **Date:** 2026-11-17
- **Type:** change
- **Scope:** `WebChat/WebChat/ClientApp/` - `src/config.ts`, `.env.example` (new), `src/features/auth/{externalAuth.ts,useExternalSession.ts}` (new), `authSlice.ts`, `AuthScreen.jsx`, `src/features/realtime/signalrMiddleware.ts`, `src/app/App.jsx`, `src/index.jsx`, `vite.config.ts`, `src/test/external-auth.test.tsx` (new), `package.json`; also `CLAUDE.md` and `docs/ctx/ORIENTATION.md`
- **Status:** done; merged in #112 (`dd51ff4`) and live in production, where the owner signed in through Microsoft. Reload, hourly renewal and sign-out are still not confirmed against real Entra.

## Context
Phase 3 of `docs/plans/2026-11-17-entra-id-migration.md`: the browser half of sign-in with Microsoft Entra External ID, on top of the provider-agnostic backend in [2026-11-17-entra-id-backend.md](2026-11-17-entra-id-backend.md) (phase 2). The client mirrors the server's abstraction so the app can later swap Azure for its own implementation.

## What I found
- **MSAL v5 removed the static `PublicClientApplication.createPublicClientApplication`** (v3/v4). Typecheck caught it; the replacement is the exported `createStandardPublicClientApplication` (`externalAuth.ts:78`).
- **Without the `email` scope the Entra access token has no `email` claim**, even with the optional claim configured, and the server cannot create an account. `signIn` therefore requests `[apiScope, 'email']` (`externalAuth.ts:67`).
- **`knownAuthorities` is mandatory for `ciamlogin.com`**: MSAL refuses an unknown authority host (`externalAuth.ts:84`, set to the authority's host).
- **`handleRedirectPromise` must finish before the router renders.** The first `<Navigate>` rewrites the URL and drops the redirect response, so `index.jsx:29` waits on `completeRedirect()` (failure swallowed so the app still renders).
- **A captured SignalR token goes stale.** With tokens renewed hourly, an `accessTokenFactory` that presents the connect-time token would fail on reconnect; it now reads `getState().auth.user?.token` at call time (`signalrMiddleware.ts:77`). `CLAUDE.md` carries a constraint line about this.
- **Portal steps that are easy to miss** (all required; external tenants show no consent prompt, so a missing permission just fails):
  1. `webchat-api` > Token configuration: optional claim `email` on Access tokens, accepting "Turn on the Microsoft Graph email permission".
  2. Graph delegated `email` permission on `webchat-spa` too, with admin consent, because the SPA is what requests the token.
  3. `openid` and `offline_access` delegated permissions with admin consent.

## What changed
- **Config** (`config.ts:33-60`): `Config.auth = { local: VITE_AUTH_LOCAL !== 'false', external }`. `external` is non-null only when `VITE_ENTRA_CLIENT_ID` is set (also `VITE_ENTRA_AUTHORITY`, `VITE_ENTRA_API_SCOPE`, `VITE_ENTRA_LABEL` defaulting to "Microsoft"). The provider name `entra` must equal the server's `Auth:Oidc` `Name`. `.env.example` documents the variables; real dev values live in git-ignored `.env.development.local`.
- **Provider abstraction** (`externalAuth.ts`): `ExternalAuthClient` (`name, label, completeRedirect, resume, signIn, refresh, signOut`) and `createMsalClient`. MSAL is dynamically imported (the `loadMsal` parameter lets tests pass a fake) and initialised once via a memoised promise, so password-only builds never download it. Redirect URIs are the app root; cache is `localStorage`. On silent token failure, `InteractionRequiredAuthError` returns null (no surprise redirect mid-conversation) and anything else rethrows (`externalAuth.ts:114`).
- **Session** (`useExternalSession.ts`): on mount, only when the store has no user, `resume()` silently, then `GET api/users/getprofile` with the token, then `signedIn({token, tokenExpirationTime, id: <local id from the API>, provider: 'entra'})`. That request is also what creates the account server-side, so its 401 becomes an explanatory error on the sign-in card. While signed in externally a timer renews 5 minutes before expiry (`RENEW_BEFORE_MS`, minimum 15 s `MIN_DELAY_MS`) and dispatches `tokenRefreshed`; a null or failed refresh dispatches `signedOut`.
- **Redux** (`authSlice.ts`): `SessionUser.provider` (absent means local, for sessions stored earlier); `isLocalSession()` (line 8); only local sessions are written to or read from `localStorage` `user-data` (lines 22, 30) because external tokens expire hourly and MSAL's cache restores them. New `tokenRefreshed` reducer (line 74).
- **App** (`App.jsx`): `useExternalSession` wired (line 86). Signing out of an external session also calls `externalAuth.signOut()` (`logoutRedirect`, lines 179-182) so the next click does not silently sign the same person back in. `/register`, `/confirm`, `/forgot-password`, `/reset-password` are wrapped in `localOnly()` (line 189), redirecting to `/login` when `Config.auth.local` is false.
- **AuthScreen**: the design handoff's previously omitted SSO button is now the `external` prop ("Continue with {label}"), outlined beside the form, or contained and alone when `localEnabled` is false; it shows `external.error`. Props are typed with JSDoc because TS inferred `external` as `null` from its default.
- **Bundle** (`vite.config.ts:152`): `vendor-msal` code-splitting group, deliberately without the `$initial` tag. Reported verified absent from `index.html` preloads and from the entry chunk's static imports; the chunk is 298 kB / 77 kB gzip, loaded lazily.
- **Dependency**: `@azure/msal-browser` pinned exactly at 5.27.0 (`package.json:7`); 5.29.1 was only 5 days old, 5.27.0 about 3 weeks. `@azure/msal-react` is not used.

## Decisions and trade-offs
- **Local password sign-in is not an `ExternalAuthClient` implementation.** Its forms and confirm/reset flows have no external equivalent; one interface over both would need fake methods. The seam is "external provider", mirroring the server's `Auth:Oidc`.
- **`tokenRefreshed` is deliberately not `signedIn`**, because `signedIn` reconnects the SignalR hub. Renewal must not drop the connection.
- **External sessions are not persisted by the app**; MSAL's cache is the single source. Rejected: persisting them in `user-data`, which would restore an expired token after a reload.
- **Silent failure returns null rather than redirecting**, so a mid-conversation expiry signs out cleanly instead of navigating away.
- **No `@azure/msal-react`**: the session lives in Redux, and a second state holder would duplicate it.
- **`vendor-msal` untagged** so a password-only visitor never pays for it, unlike the `$initial` vendor groups.

## Verified
- `npm run verify` (oxlint, prettier check, tsc, vitest, vite build) passes, 346 tests (as reported; I did not re-run the suite for this note). `external-auth.test.tsx` holds 21 tests (I counted 21 `it`/`test` calls): MSAL client with a fake module, slice persistence and renewal, `useExternalSession` including fake-timer renewal and sign-out, AuthScreen.
- Mutation checks (reported): dropping `'email'` from the sign-in scopes, and allowing external sessions to persist, each fail a test.
- **End to end locally against the real WebChat Dev tenant**: API (`dotnet run`, Development, :7199) plus Vite (:3000). The owner signed up and in via "Continue with Microsoft". The API log showed exactly one `INSERT INTO "User"` and one `INSERT INTO "UserLogin"`, `GET api/users/getprofile` 200, `POST /chat/negotiate` 200 (hub authenticated with the Entra token), no auth failures or exceptions. This also confirms phase-2 pieces with a real token: issuer, audience, scope and the `email` optional claim. (Log observations as reported; not re-observed for this note.)
- Code locations cited above were checked against the working tree.

## Known issues / follow-ups
- **Not verified**: hourly renewal against real Entra (fake timers only); a page reload restoring the session; sign-out via `logoutRedirect`. These checks were pending with the owner when this was written.

## Production rollout (2026-11-17)
- **Configuration:** the 10 variables from `.do/app.yaml` were added one row at a time in the dashboard's environment-variable editor on the `web` component:
  - the 7 `Auth__Oidc__0__*`;
  - the 3 `VITE_ENTRA_*`, left at the default "Run and build time" scope, which App Platform passes to Docker as build args.
- **Avoided the bulk "Add from .env" editor:** it shows *every* variable, encrypted secrets included, and editing it risks the same `EV[…]` round-trip as `doctl apps update --spec`.
- **doctl could not be used:** its saved token answered 401, so everything went through the dashboard.
- **Gotcha: saving the variables started a deployment of `a9e6498`, the previous deployment's commit, not the just-merged `dd51ff4`.** It was cancelled and replaced with Actions → Deploy ("fetch any updates from your source repository"), whose build log showed `Checking out commit "dd51ff4…"`. `CLAUDE.md`'s deploy bullet now says this.
- **Verified in production:**
  - a served JS asset contains the SPA client id, so the build args reached Vite;
  - `/health` returns 200, and the app would not boot with an invalid `Auth` section;
  - unauthenticated `api/users/getprofile` returns 401;
  - the login page shows "Continue with Microsoft";
  - the owner signed in through it.
- **Docker build:** the `VITE_*` build args were used here for the first time, and the build succeeded.
- **Dependency on the trial:** production now relies on the trial-subscription tenant, with local password sign-in kept as the fallback.
- Invitations are still refused for external sign-in (phase 4, see the backend note).
- Pre-existing, unrelated: `npm audit` reports 2 high advisories in axios / follow-redirects.
