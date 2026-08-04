# Email activation (issue #25)

- **Date:** 2026-08-05
- **Type:** change
- **Scope:** new project `WebChat/WebChat.Tests`; `WebChat/WebChat.Services/Email/*`;
  `WebChat/WebChat.Data/User.cs`;
  `WebChat/WebChat.Connection/Migrations/20260804215858_AddEmailConfirmation.cs`;
  `WebChat/WebChat/Controllers/AuthController.cs`; `WebChat/WebChat/Startup.cs`;
  `WebChat/WebChat/appsettings*.json`; `WebChat/.env.example`; `WebChat/docker-compose.yml`;
  `.do/app.yaml`; `WebChat/WebChat/ClientApp/src/features/auth/*`;
  `WebChat/WebChat/ClientApp/src/app/App.jsx`;
  `WebChat/WebChat/ClientApp/src/services/api-service.js`
- **Status:** done (branch `feature/email-activation`, not merged to `master`; not deployed)

## Context
Issue #25: require a confirmed email address before an account can sign in, with the
confirmation link sent by mail. Branch `feature/email-activation`, commits `e7a9f0d`,
`deebd32`, `94d9eb1`, `dc108bd`, `88e82ba`, `35cb6a3`, `dccd0f9`.

## What I found — the finding that matters most

**Delivery is unsolved, and no provider choice fixes it.** Brevo was picked over Resend
because Resend requires a verified *domain* before it will send at all, while Brevo only
needs a verified sender *address* — and this repo owns no domain. That reasoning is correct
about *sending* and wrong about *delivering*: the first real message, sent from
`wod.moshkin@gmail.com` through Brevo's relay, was accepted by Brevo and landed straight in
Gmail's spam folder. `gmail.com`'s SPF record does not list Brevo, and the DKIM signature on
the message is Brevo's, not Gmail's — so SPF alignment fails, DKIM alignment fails, and
DMARC fails as a result. No relay can authenticate mail as `gmail.com`; only Google can. This
is not fixable by warm-up, template changes, or a different provider — it makes the custom
domain in issue #18 a **prerequisite** for this feature to work at all, not a nicety.

Also found while choosing a provider: DigitalOcean has no email product and blocks outbound
SMTP ports 25/465/587 by default; DO's own tutorial for confirmation emails uses Resend.
Self-hosting an SMTP server was considered and rejected — same port-blocking problem, plus
cloud IP ranges generally lack the reverse-DNS/SPF/DKIM/DMARC reputation to avoid spam
folders and are commonly pre-listed on Spamhaus's PBL. What was kept from that idea: sending
is written against plain SMTP with MailKit (`WebChat/WebChat.Services/WebChat.Services.csproj:16`,
MailKit 4.17.0) rather than a vendor SDK, so swapping providers later is configuration, not
code — see `SmtpEmailSender.cs`.

**SMTP identities are three separate values, easy to conflate** — documented in
`WebChat/.env.example:48-55`: the SMTP username is a Brevo-generated login of the form
`b46927001@smtp-brevo.com` (SMTP & API → SMTP), *not* the account's login email; the password
is a generated SMTP key, not the account password; the From address is a third value,
verified separately under Senders. Brevo's "Authorized IPs" allowlist is deliberately left
empty because App Platform has no stable egress IP — enabling it would break sending
unpredictably.

## Token design (`WebChat/WebChat.Services/Email/EmailConfirmationTokenService.cs`)
- 256 bits from `RandomNumberGenerator.GetBytes`, not `Guid.NewGuid()` — a GUID is not a
  CSPRNG and its fixed version/variant bits carry well under the 128 bits its size suggests
  (comment at `EmailConfirmationTokenService.cs:28-30`).
- Only a SHA-256 hash is stored (`Hash(token)` at line 83-87); a database leak alone cannot
  forge a link.
- `Verify` compares in constant time via `CryptographicOperations.FixedTimeEquals`
  (line 71-77), and checks expiry itself (line 66-69) so no caller can forget to.
- Base64url encoding (`ToBase64Url`, line 89-95) so the token survives a query string
  untouched — standard base64's `+`/`/` are escaped by some mail clients and not others,
  producing a link that works in one inbox and silently fails in another.
- `Verify` returns `false` for malformed/empty input rather than throwing — the token arrives
  from a public, unauthenticated URL, and a throw there is a 500 anyone can trigger.
- `AuthController.Confirm` (`Controllers/AuthController.cs:104-123`) looks the user up by
  hash first (`GetUserByConfirmationHash`, indexed) but still calls `Verify` — the lookup
  only narrows the candidate, it doesn't replace expiry/constant-time checking.

## Migration (`Migrations/20260804215858_AddEmailConfirmation.cs`)
`EmailConfirmed` is added `NOT NULL DEFAULT false` (line 26-31), which — as generated —
would apply to every *existing* row too. Since sign-in is refused while `EmailConfirmed` is
false and existing accounts have no pending token, deploying the plain migration would have
locked out every current user with no way back in. Fixed with an explicit backfill
(line 40): `UPDATE "User" SET "EmailConfirmed" = TRUE;`. General lesson worth generalizing
beyond this feature: adding a non-nullable gate column to a table with live rows needs an
explicit grandfathering statement, because EF's generated default only affects new inserts.

## Endpoint design (`Controllers/AuthController.cs`)
- `POST register` returns 201 with **no** auth token (explicit product decision: block
  sign-in until confirmed) — see doc comment at line 68-72.
- `POST login` checks `EmailConfirmed` *after* the password check (line 53-63), so an
  unconfirmed account cannot be used to probe which addresses are registered — the
  `403 email_not_confirmed` only appears once credentials are already proven correct.
- `GET confirm` clears the stored hash via `ConfirmEmail` (making the link single-use), then
  issues an auth token directly — arriving here proves mailbox ownership, so no password
  re-entry (line 99-123).
- `POST resend-confirmation` answers with the identical 200/body for a pending, unknown,
  already-confirmed, or cooldown-suppressed address (line 125-150) — any observable
  difference turns it into an account-enumeration oracle.
- `SendConfirmation` (line 164-190) persists the new token hash **before** sending the mail
  — the reverse order risks a link reaching an inbox the database has no record of.
- Registration succeeds even when the mail send fails; the response's `emailSent` flag tells
  the client to offer a resend rather than coupling account creation to a third party's
  uptime (line 86-96).

## Bug found by tracing what a user actually clicks
The activation link initially pointed at `{publicUrl}/api/auth/confirm?token=...` — the API
endpoint. Every automated test passed and the endpoint worked correctly, but a user clicking
it would see raw JSON containing a bearer token, with no browser mechanism to store a
session from it. Fixed to point at the SPA route `{publicUrl}/confirm?token=...`
(`AuthController.cs:175-179`), which calls the endpoint and signs in client-side. Only
surfaced by tracing the user journey, not by any test.

## Client (`ClientApp/src/features/auth/`, `app/App.jsx`)
- New screens `CheckYourEmail.jsx` and `ConfirmEmail.jsx`; routes `/check-email` (App.jsx:108)
  and `/confirm` (App.jsx:119).
- A `403 email_not_confirmed` on sign-in routes to `/check-email` (`AuthScreen.jsx:33-36`,
  `App.jsx:49,89`) rather than surfacing as a form error — the credentials were correct and
  there is nothing on the sign-in form to fix.
- `ConfirmEmail.jsx` holds its callbacks in refs (`confirm`/`done`, lines 23-27) rather than
  listing them as effect dependencies, citing
  `docs/ctx/2026-08-04-compose-search-render-loop.md`. Here the failure mode would be worse
  than that bug: repeatedly re-submitting a single-use token, so only the first call
  succeeds and the user watches every subsequent one fail.
- Icon gotcha: `@mui/icons-material/ErrorOutline` does not exist in this build; only the
  suffixed `ErrorOutlineOutlined` does (`ConfirmEmail.jsx:4,6`). It fails at *import* time,
  so it shows up as a failing test file, not a compile error — worth knowing before assuming
  a red test file means logic is wrong.

## Rate limiting (`Startup.cs`)
Two independent layers because neither covers the other's case (`Startup.cs:127-160`):
- A per-IP fixed window of 5 requests / 15 minutes (`AddRateLimiting`, partitioned by
  `context.Connection.RemoteIpAddress`) stops one source flooding `register` /
  `resend-confirmation`, both `[EnableRateLimiting(Startup.EmailSendPolicy)]`.
- A 60-second per-address cooldown (`AuthController.RecentlySent`, line 152-162), read from
  the already-stored `EmailConfirmationSentAt` (no new state needed), stops a distributed
  flood aimed at a single victim's inbox — that pattern looks like many IPs and passes the
  IP limiter untouched.
- A cooldown-suppressed resend still returns the same 200/body as a real send (line 145-149)
  — otherwise the cooldown itself becomes an enumeration oracle.
- **Critical coupling**: partitioning by remote IP is only correct because
  `UseForwardedHeaders` runs before `UseRouting`/`UseRateLimiter` (`Startup.cs:340,377,380`).
  With `ForwardedHeaders:Enabled` off behind a proxy, every request appears to come from the
  proxy's IP, the whole world shares one bucket, and the first five callers in a window lock
  everyone else out. `Startup.cs:137` documents this explicitly.

## Decisions and trade-offs
- Brevo over Resend — see "What I found" above; reasoning was sound for sending, insufficient
  for delivery.
- Sending built on MailKit against plain SMTP rather than a Brevo SDK, specifically so the
  provider is swappable via configuration.
- Brevo's Authorized-IPs allowlist left empty deliberately (no stable egress IP on App
  Platform).
- Register does not return a token; confirm does. Explicit product decision, not an
  oversight.
- Resend and confirm-failure responses are intentionally generic/uniform to avoid
  account-enumeration oracles, at the cost of the resend endpoint giving no signal at all
  when suppressed by cooldown.
- Migration backfill added by hand; not something `dotnet ef migrations add` would generate
  on its own.

## Verified
Against the running `docker compose` stack with the logging email sender:
- register → 201, no token.
- login before confirming → 403 `email_not_confirmed`.
- confirm → 200 with an auth token; replaying the same link → 400.
- garbage token and empty token → 400, not 500.
- login after confirming → 200.
- resend → identical response body/status for known-unconfirmed and unknown addresses; a
  resend invalidates the previously issued link.
- 6th call to an email-sending endpoint within a window → 429.
- 3 resends inside the 60s cooldown → all 200, zero emails sent (confirmed via container log
  count).
- One real message sent through Brevo's relay and accepted — via the integration test, which
  is skipped unless SMTP credentials are present (`WebChat.Tests/Email/SmtpEmailSenderIntegrationTests.cs`).
- `dotnet test WebChat.Tests --filter "FullyQualifiedName!~Integration"` → 25 passed
  (confirmed directly in this session).
- Reported but not independently re-run in this session: Release build 0 warnings; 2
  skippable integration tests; 60 client tests; client typecheck clean.

**Not verified:** the client screens (`CheckYourEmail.jsx`, `ConfirmEmail.jsx`) were never
driven in a real browser during this work — the browser tooling stopped responding and was
not retried. Everything client-side is verified only via typecheck, unit tests, and the HTTP
flow through the dev-server proxy. Nothing from this branch is deployed; `master` does not
have it.

## Known issues / follow-ups
- No automated tests for the three auth endpoints (register/confirm/resend) or the two new
  client screens beyond what's listed above.
- Delivery lands in spam until issue #18 (custom domain) lands — this is a hard blocker on
  the feature being usable in production, not a polish item.
- `login` itself is not rate limited (brute-force password guessing is still open).
- Mid-session, a test briefly pointed the container at real SMTP and sent to a nonexistent
  domain, producing a bounce against sender reputation. Local/dev testing now deliberately
  uses the logging sender (leave `EMAIL_SMTP_*` blank) to avoid repeating this.
