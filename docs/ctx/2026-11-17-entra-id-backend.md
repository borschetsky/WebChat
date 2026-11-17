# Entra External ID backend: provider-agnostic external sign-in (phase 2)

- **Date:** 2026-11-17
- **Type:** change
- **Scope:** `WebChat/WebChat/Auth/` (new), `WebChat/WebChat/Startup.cs`, `WebChat/WebChat/Controllers/AuthController.cs`, `WebChat/WebChat.Services/ExternalLoginService.cs` (new), `WebChat/WebChat.Services/AuthService.cs`, `WebChat/WebChat.Data/UserLogin.cs` (new), `WebChat.Connection` (context + migration `AddUserLogins`), `appsettings*.json`, `WebChat.Tests/Auth/` and `WebChat.Tests/Admin/AdminApiFactory.cs`
- **Status:** partial (backend done on branch `feature/entra-id-backend`; not merged, not deployed, no real Entra token validated yet)

## Context
Phase 2 of `docs/plans/2026-11-17-entra-id-migration.md`: let the API accept access tokens from Microsoft Entra External ID while the app's own HS256 sign-in keeps working. The owner explicitly asked for a provider abstraction so the app can switch between Azure and its own implementation, which shaped the design below.

## What I found
- **`UseSetting` in `WebApplicationFactory` writes host settings, and `appsettings.json` overrides them.** Adding `Auth:Local:Enabled: true` to `appsettings.json` silently made `UseSetting("...", "false")` lose, and the local-disabled tests only failed in the run after that edit. Fix: `ConfigureAppConfiguration` + `AddInMemoryCollection` (`ExternalLoginFactory.cs:55-67`). Recorded as a bullet in `CLAUDE.md:126`. Pre-existing trap, newly exposed.
- **`AdminApiFactory` shared one `SqliteConnection` across all `DbContext`s.** EF registers a collation on the connection in the context constructor (a plain `Dictionary`), so two contexts constructed concurrently threw "Operations that change non-concurrent collections must have exclusive access". This hit intermittently (about 1 run in 5, on whichever test booted the host) when `ClientErrorRetentionService` pruned at host start beside the first request. Pre-existing. Fix: a named shared-cache in-memory DB (`file:webchat-<guid>?mode=memory&cache=shared`, `AdminApiFactory.cs:58`), one connection per context plus a keep-alive connection, and `ClientErrors:PruningEnabled=false` in the factory (`AdminApiFactory.cs:90`).
- **The Entra issuer host is the tenant id, not the tenant name.** Authority is `https://webchatdev.ciamlogin.com/<tenant-id>/v2.0` but `iss` is `https://<tenant-id>.ciamlogin.com/<tenant-id>/v2.0` (`appsettings.Development.json:34-35`). Confirmed by fetching the tenant's discovery document. The router matches on `iss`, so using the Authority as the Issuer would never route.
- **`AuthService.VerifyPassword` would have thrown (a 500) for non-local accounts.** `CryptoHelper` throws on a non-hash string. It now returns false for null, empty or the `NoLocalPassword` sentinel (`AuthService.cs:87-91`).

## What changed
- **Config** (`Auth/AuthOptions.cs`): `Auth:Local:Enabled` (default true) and `Auth:Oidc[]` with `Name, Authority, Issuer, Audiences, RequiredScope, SubjectClaim ("sub"), EmailClaim, NameClaim, EmailIsVerified`. `Problems()` validates. `Startup.ValidateRequiredConfiguration` (`Startup.cs:65`) now throws on any problem in every environment, including Development, and requires `JWTSecretKey` only when Local is enabled.
- **Routing** (`Auth/AuthenticationSetup.cs`): default scheme `WebChat` is a policy scheme whose `ForwardDefaultSelector` (line 68) reads the token's unverified `iss`, from the header or the `access_token` query for hub paths:
  - no `iss` goes to local `Bearer` (unchanged HS256 and security-stamp hook, now `Startup.ConfigureLocalBearer`, `Startup.cs:237`);
  - an `iss` equal to a provider `Issuer` goes to `oidc:<name>`;
  - an unknown `iss` goes to a fallback (local if enabled, else the first provider), which then fails.
  Reading `iss` unverified is safe because the chosen scheme fully validates.
- **OIDC schemes**: plain `JwtBearer`, with `MapInboundClaims=false` (`AuthenticationSetup.cs:162`) so claim names are raw (`oid`, `scp`, `email`). `NameClaimType` is `webchat_uid` and `RoleClaimType` is `ClaimTypes.Role`. `OnTokenValidated` (line 179 onward) checks `RequiredScope` in `scp`/`scope`, reads `SubjectClaim`, calls `IExternalLoginService`, refuses if `!AccountStatus.CanSignIn` (line 239), then adds `webchat_uid`, `webchat_provider` and the role from the DB row. `ReadHubToken` (line 145) is shared by local and external schemes. `[RequiresLocalAuth]` (line 263), applied to `AuthController` (`AuthController.cs:16`), makes it answer 404 when Local is disabled.
- **Account resolution** (`ExternalLoginService.cs`), provider-agnostic:
  1. An existing `UserLogin(Provider, Subject)` wins, and email is never consulted again.
  2. Otherwise an account with the same email (case-insensitive, `UserQueries.ByEmail`) is linked only if the email is verified (provider `EmailIsVerified=true` or token `email_verified=true`). Refused if that account already has a login from the same provider under a different subject. An UNCONFIRMED existing account is taken over as a squatter defence: password set to `NoLocalPassword`, `EmailConfirmed=true`, confirmation and reset token hashes cleared, `SecurityStamp` rotated.
  3. Otherwise create a Member/Active user with `EmailConfirmed = EmailVerified` and `Password = NoLocalPassword`. The username comes from display name, then email local part, then "user", suffixed 2..49 until free.
  A `DbUpdateException` on the composite key (concurrent first sign-in) clears the tracker and re-reads (`ExternalLoginService.cs:88`). Error codes (`external_login_no_email`, `_email_not_verified`, `_already_linked`, `_account_gone`) are logged with the subject and deliberately not the email.
- **Data**: `UserLogin` entity, DbSet, config (composite PK Provider+Subject, FK to User with cascade, index on `UserId`) and migration `AddUserLogins`.
- **Settings**: `appsettings.json` gets an empty `Auth` section with a comment; `appsettings.Development.json` gets the real dev tenant provider "entra" (audience is the API client id, `SubjectClaim` `oid`, `EmailIsVerified` true).
- **Tests**: `ExternalLoginFactory` has two fake providers ("verified" and "unverified") and a static `OpenIdConnectConfiguration` with a test key, injected via `PostConfigure` on the scheme's `JwtBearerOptions.ConfigurationManager`, so there is no network. `ExternalLoginTests` has 17 tests and `LocalAuthDisabledTests` 3 (20 `[Fact]`s in the file).

## Decisions and trade-offs
- **A `UserLogin` table, not a single `User.ExternalObjectId` column.** The column was generated and then removed. The table lets one account hold several providers and adding a provider needs no migration, which is what the owner's abstraction requirement needs.
- **Plain `JwtBearer`, not `Microsoft.Identity.Web`.** Deliberately no new package, and the validation behaviour stays visible and testable.
- **Link by verified email only, and take over unconfirmed accounts.** Linking on an unverified email is an account-takeover path. Unconfirmed local accounts are exactly what a squatter creates, so the verified external identity wins and the squatter's credentials are neutralised.
- **Config problems throw in every environment, Development included**, so a bad `Auth` section cannot boot silently.
- **Role and status come from the DB row, not the token**, consistent with the existing choice that roles are not in the JWT.

## Verified
- `dotnet build WebChat.sln -c Release --no-incremental -warnaserror`: 0 warnings, 0 errors.
- Full suite: 419 passed / 2 skipped (the SMTP integration tests, pre-existing) three runs in a row in Release, twice in Debug.
- Mutation checks: `NameClaimType` set to "name" fails 11 tests; removing the scope check fails the scope test; removing the Local gate fails the 404 test. The tests were written before the implementation but only ever failed by not compiling, so these mutations are the behavioural red evidence.
- Dev host boots in Development with the Entra provider configured and `/health` answers 200.
- This note's pass corroborated file existence, line references, test counts (20 facts) and the dev-settings issuer; it did not re-run the build or tests.

## Known issues / follow-ups
- **No real Entra token has been validated end to end.** Needs the SPA (phase 3).
- **The access token carries `email` only if the webchat-api registration has the `email` optional claim on access tokens.** Without it first sign-in fails with `external_login_no_email`. The portal step is still to do.
- **Invitations (pending users) are refused by the status check when they sign in externally.** The redeem flow is phase 4.
- `BootstrapAdmins` still promotes only at boot, so an externally created user is not promoted until restart.
- Nothing is deployed and the branch is not merged.
- Related docs updated by the author: `CLAUDE.md` and `docs/ctx/ORIENTATION.md` Auth sections.
