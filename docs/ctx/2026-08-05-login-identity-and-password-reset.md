# Sign in by email-or-username, password reset, and JWT revocation

- **Date:** 2026-08-05
- **Type:** change
- **Scope:** `WebChat.Services/UserQueries.cs` (new), `UserService.cs`, `IUserService.cs`,
  `AuthService.cs`, `IAuthService.cs`, `Email/PasswordResetTokenService.cs`,
  `Email/PasswordResetEmail.cs`, `Email/Templates/ResetPassword.html`, `WebChat/Startup.cs`,
  `WebChat/Controllers/AuthController.cs`, `WebChat/ViewModels/LoginViewModel.cs`,
  `WebChat/ViewModels/ResetPasswordViewModel.cs` (new), `WebChat.Data/User.cs`, two EF
  migrations (`AddPasswordReset`, `AddSecurityStamp`), `WebChat.Tests/Auth/UserLookupTests.cs`
  (new), and client `features/auth/AuthScreen.jsx`, `features/auth/ForgotPassword.jsx` (new),
  `features/auth/ResetPassword.jsx` (new), `app/App.jsx`, `services/api-service.js`,
  `services/index.js`, `.gitignore`.
- **Status:** done

## Context
Issue #28: sign-in only accepted an email address, there was no way to recover a forgotten
password, and — discovered while doing the work, not asked for — a stolen or leaked JWT
could not be revoked short of waiting out its lifespan. PR #31 (commits `23c2e92`, `951ffff`,
`ea050b8`, `ac74f6d`) did all three; PR #32 (commit `bd42603`) fixed two UI bugs the repo
owner found by looking at the actual screen after #31 merged.

## What I found
- **Email matching was case-sensitive and unsafe twice over.** `u.Email == email` compares
  exactly in PostgreSQL, so a capitalised address in someone's password manager could not
  sign in. `isEmailUniq` had the identical flaw, so `User@x.com` and `user@x.com` could
  *both* be registered — after which sign-in resolved to whichever row the database
  returned first. Pre-existing bug, fixed by `23c2e92` with server-side `ToLower()` folding
  (`WebChat/WebChat.Services/UserQueries.cs:36-39,57-58,73-74,85-86`) so registration is now
  rejected as duplicate.
- **JWTs could not be revoked at all, pre-`ac74f6d`.** `AuthService.GetToken` issued a token
  carrying only the user id and expiry; nothing on any later request consulted the database.
  `JWTLifespan` is `604800` seconds (`WebChat/WebChat/appsettings.json:95`) — seven days. A
  password reset changed the password and ended nothing.
- **`GetUserByEmail` silently accepted usernames before `951ffff`.** It routed through the
  combined email-or-username lookup, so the endpoint's own name and doc comment were false.
  Confirmed fixed: `UserQueries.ByEmail` is now a separate query
  (`WebChat/WebChat.Services/UserQueries.cs:50-59`), and `UserService.GetUserByEmail` calls it
  (`WebChat/WebChat.Services/UserService.cs:221-227`).
- **A deleted user's token kept working until expiry**, another gap closed as a side effect
  of `ac74f6d`: `OnTokenValidated` treats a missing `SecurityStamp` (deleted row) the same as
  a mismatched one and fails auth (`WebChat/WebChat/Startup.cs:221-226`).

## What changed
- `UserQueries` (new, static, takes `IQueryable<User>`): `ByEmailOrUsername` (email tried
  first, then username, both case-folded), `ByEmail` (email only), `IsEmailAvailable`,
  `IsUsernameAvailable`.
- `LoginViewModel.Email` renamed to `Identifier`, `[EmailAddress]` attribute dropped — that
  attribute was what made typing a username impossible, rejecting it client/server-side
  before any lookup ran.
- `AuthController`: sign-in now resolves via `ByEmailOrUsername`; new `forgot-password` and
  `reset-password` endpoints; the 403 for an unconfirmed account now includes the account's
  email in the response.
- Password reset: `PasswordResetTokenService` reuses the same CSPRNG / hash-only-storage /
  constant-time-compare mechanism as email confirmation (`Email/EmailConfirmationTokenService.cs`
  from the prior activation work), differing only in a 1-hour lifetime vs. confirmation's 24.
  `PasswordResetEmail` + `Templates/ResetPassword.html` send the link.
- `User` gained `SecurityStamp` (`WebChat.Data/User.cs:61`), issued as JWT claim `sstamp`
  (`AuthService.SecurityStampClaim`, `WebChat.Services/AuthService.cs:26`), rotated on reset,
  checked on every request in `JwtBearerEvents.OnTokenValidated`
  (`WebChat/Startup.cs:201-227`).
- Migration `AddPasswordReset` adds the reset-token columns; migration `AddSecurityStamp`
  adds the stamp column and backfills a **distinct** `gen_random_uuid()::text` per existing
  row (built into PostgreSQL 13+, no extension needed).
- Client: `ForgotPassword.jsx` and `ResetPassword.jsx` (new screens), wired into
  `App.jsx`; sign-in field relabelled "Email or username" and `type=email` dropped from it
  (that attribute would have made the browser reject a username before submit).
- `UserLookupTests.cs` (new): runs `UserQueries` against a real SQLite in-memory
  `WebChatContext`, not a hand-rolled copy of the query.
- PR #32 (`bd42603`): `App.jsx` now passes `onForgotPassword` to `AuthScreen`
  (`WebChat/WebChat/ClientApp/src/app/App.jsx:96`); `AuthScreen.jsx` gained a `FRIENDLY`
  pattern table (`WebChat/WebChat/ClientApp/src/features/auth/AuthScreen.jsx:7-22`) that
  rewrites recognised ASP.NET validation messages and passes unrecognised ones through
  unchanged; all three sign-in/register fields marked `required` client-side.
  `.gitignore` widened from `.env` to `.env` + `.env.*` + `!.env.example`.

## Decisions and trade-offs
- **Email is matched before username** in `ByEmailOrUsername`, deliberately — nothing stops
  someone registering the username `someone@example.com`, and an address typed at sign-in
  must resolve to whoever owns that mailbox, not whoever claimed it as a display name.
- **`forgot-password` gives an identical response** for a known address, an unknown one, and
  one requested moments ago (rate-limited). This is *not* the same policy as sign-in, where a
  wrong address can safely be reported as wrong, because the sign-in caller is claiming to
  own the address. `forgot-password` is answerable by anyone about anyone, so any
  distinguishable response enumerates the user base. It accepts an email address only, never
  a username — accepting a username would itself leak whether that username exists.
- **Reset links live 1 hour, not confirmation's 24.** A stale confirmation link can only
  confirm an address its holder already controls; a stale reset link can take the account
  over. Rejected: reusing the 24-hour window uniformly.
- **A successful reset also marks the email confirmed** — opening a link sent to that mailbox
  is the same proof activation asks for.
- **Tokens issued before `ac74f6d` are refused, not grandfathered.** Trusting a missing
  `sstamp` claim would leave a permanent bypass. Consequence, accepted: everyone signed in at
  deploy time was signed out once.
- **`ResetPassword` returns the newly rotated stamp** rather than the value loaded at the
  start of the request, so the caller can sign the new session's token with it; using the
  stale value would hand back a token that fails on first use.
- **The 403 for an unconfirmed account now carries the account's email.** Signing in by
  username previously sent the *username* to the check-your-email screen, and resend rejected
  it as "not an address." Judged not a leak: reaching that response already required the
  correct password.
- **UI validation-message rewriting is pattern-based (regex), not exact-string keyed** —
  `The field Password must be a string or array type with a minimum length of '6'.` is not a
  string anyone would guess in advance, and an exact-match table would have missed it.
  Unrecognised messages pass through rather than being swallowed, so a future ASP.NET wording
  change degrades gracefully instead of silently hiding an error.
- **`.gitignore` widened to `.env.*` with `!.env.example`.** A bare `.env` entry does not
  cover `.env.bak`; an earlier draft of `bd42603` briefly included `WebChat/.env.bak` with a
  live SMTP key. Caught before pushing — confirmed via `git log --all -- WebChat/.env.bak`
  that no such path exists anywhere in the reachable history.

## Verified
- `23c2e92`: all six case variants of an address, plus username, sign in against the running
  stack; a registration differing only in case is refused.
- `951ffff`: identical HTTP responses for a known address, an unknown one, and a username;
  reset succeeds, old password stops working, new one works, the link cannot be replayed.
- `ac74f6d`: a token taken before a reset returns 200 then 401 after; the token issued by the
  reset itself returns 200; SignalR negotiate behaves the same in both cases (relevant because
  a stolen token could otherwise hold an open hub connection and keep reading messages after
  the password changed).
- `ea050b8`: all five auth routes serve; the reset link in the email points at the client
  route, not the API; client typecheck clean; 60 client tests passing.
- Read and confirmed in this session: `UserQueries.cs` contents, `OnTokenValidated` in
  `Startup.cs:201-227`, `SecurityStamp` on `User.cs:61` and its claim in `AuthService.cs:26`,
  `GetUserByEmail` routing through `UserQueries.ByEmail`, `App.jsx` passing
  `onForgotPassword`, the `.gitignore` diff, and that `UserLookupTests` runs against a real
  SQLite-backed `WebChatContext` rather than a reimplemented query.
- **Not verified in this note-writing pass or (per the reporting agent) during the main
  work itself:** the client screens were never driven in a real browser during PR #31 —
  only route-serving and HTTP through the dev proxy were checked. The missing
  `onForgotPassword` prop is exactly the class of bug that gap allowed through, and it was
  only found when the repo owner looked at the actual screen.

## Known issues / follow-ups
- **Cost of revocation:** `OnTokenValidated` adds one database read to every authenticated
  request. Flagged as worth measuring, not yet measured.
- **Testing pitfall, worth repeating to future agents:** the first version of
  `UserLookupTests` reimplemented the lookup logic inline in the test file instead of calling
  `UserQueries`, so it would have passed against any implementation whatsoever, including a
  broken one. Caught and rewritten to call the real `UserQueries` methods against a real
  (SQLite in-memory) database. `SQLitePCLRaw` is pinned explicitly in
  `WebChat.Tests.csproj` because the transitive default version carries a known high-severity
  advisory that broke the project's 0-warning build.
- **Process finding — substring checks lie.** Across this work, `includes()`-style substring
  checks reported an insertion that had not actually happened three separate times: once
  matching a route path instead of a prop (the `onForgotPassword` bug — the author's own
  check for it matched the string `/forgot-password` rather than the prop being passed),
  once a method name in an interface instead of its implementation. All three were only
  caught later, by a compile or runtime failure — never by the check itself. Treat a
  substring match as insufficient evidence that an edit landed where intended.
- **Process finding — multi-line C# edits via node/regex scripting silently failed
  repeatedly**, where the same edits made through an editor succeeded. Reported by the
  agent doing the work; not independently reproduced here, but worth a future agent
  preferring editor-based edits for multi-line C# changes over scripted regex replacement.
- **Environment gotcha — stale Vite dev-server cache masked a fix.** After `bd42603`, a
  stale pre-bundled/transformed `App.jsx` kept being served from the dev container even
  across browser reloads; `docker compose restart react-app` was needed. `curl`ing what the
  dev server actually serves located this in one step, where guessing at browser-side
  caching did not. See also the Vite `--force` note in `CLAUDE.md` for a related but
  distinct pre-bundling cache issue.
