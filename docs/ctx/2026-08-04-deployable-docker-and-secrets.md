# Making WebChat actually deployable: compose fixes, a missing SPA build, and runtime secrets

- **Date:** 2026-08-04
- **Type:** change
- **Scope:** `WebChat/docker-compose.yml`, `WebChat/WebChat/Dockerfile`, `WebChat/WebChat/ClientApp/Dockerfile`, `WebChat/WebChat/ClientApp/vite.config.ts`, `WebChat/WebChat/WebChat.csproj`, `WebChat/WebChat/Startup.cs`, `WebChat/WebChat/appsettings.json`, `WebChat/WebChat/appsettings.Development.json`, `WebChat/.env.example`, `WebChat/.dockerignore`, `.gitignore`
- **Status:** done (compose stack and a simulated Production build); DigitalOcean deployment itself not yet attempted

## Context
Branch `fix/docker-compose-stack` (PR #12), four commits: `16e8b2d`, `4dc212b`, `bf5113c`,
`7c8e0f9`. Goal was to get `docker compose up` working again and, in the process, discovered
that the app had never produced a deployable publish output at all — `dotnet publish` had
been silently shipping a client-less app since the Vite migration.

## What I found

**Hardware, not software.** The session's initial Docker failures (daemon 500 on `_ping`,
"no installed distributions") traced to AMD-V being disabled in BIOS on a Ryzen 9 5900X
(`VirtualizationFirmwareEnabled: False`, `VMMonitorModeExtensions: True`). Enabling SVM Mode
fixed it; no WSL/Docker Desktop reconfiguration was relevant. Worth remembering because both
symptoms point at the software stack, not firmware. (Reported by the user, not verifiable
from this repo — recorded for the next time this exact error shape recurs.)

**Postgres 18 changed its data directory layout.** It moved into a version-named
subdirectory of `/var/lib/postgresql` (so `pg_upgrade --link` can work within one mount).
Mounting the old `/var/lib/postgresql/data` path makes the entrypoint refuse to start
outright, not silently ignore the volume — `WebChat/docker-compose.yml:43` now mounts
`webchat-db:/var/lib/postgresql`.

**Vite's Host-header check breaks `UseProxyToSpaDevelopmentServer`.** Vite 8 blocks
unrecognised `Host` headers as DNS-rebinding protection; the ASP.NET proxy forwards the
target's authority, so under compose every proxied request arrived as `Host: react-app` and
got a plain-text 403 from Vite — served through Kestrel, so it read as an API auth failure.
Direct requests to `localhost:3000` were unaffected, which is what made it look
client-specific. Fixed with `allowedHosts: ['react-app']` in
`WebChat/WebChat/ClientApp/vite.config.ts:31`.

**`VITE_API_PROXY_TARGET` has no compose-safe default.** It defaults to
`https://localhost:7199` (`vite.config.ts:7`) — inside the `react-app` container that
resolves to the container itself and the connection is refused, producing a 502 from the dev
proxy that the client renders as "Cannot reach the server. Is the API running?", which reads
identically to the API actually being down. `docker-compose.yml:18` now sets it to
`https://webchat-api:8443` — HTTPS, not `:8080`, because the API redirects HTTP→HTTPS and the
dev proxy does not follow redirects, so an `:8080` target would hand the browser a
compose-internal address it cannot reach. `secure:false` already accepts the self-signed cert.

**`dotnet publish` never built the SPA — the actual deployment blocker.** Nothing invoked
`vite build` on publish, so `ClientApp/dist` was absent and `AddSpaStaticFiles` had nothing
to serve. Invisible in Development because `UseSpa` proxies to the dev server rather than
reading the directory (`Startup.cs:289-299`). Fixed with two MSBuild targets in
`WebChat/WebChat/WebChat.csproj:60-85`:
- `BuildSpa` (`BeforeTargets="ComputeFilesToPublish"`) runs `npm ci` only when
  `node_modules` is absent, then `npm run build`.
- `IncludeSpaOutput` (depends on `BuildSpa`) maps `dist` into the publish output at
  `ClientApp/dist` via `ResolvedFileToPublish`, and **errors** when `dist` is empty so this
  cannot silently regress.

They're separate targets so Docker can pass `-p:SkipSpaBuild=true` and supply `dist` from a
`node:22-alpine` build stage instead (`WebChat/WebChat/Dockerfile:15-20,38-39`) — the .NET SDK
image ships no Node.

Getting there hit NETSDK1152: the Web SDK's `**/*.json` `Content` glob was already publishing
`ClientApp/package.json` and `tsconfig.json`, and once `dist` existed it also picked up
`dist/manifest.json`, colliding with `IncludeSpaOutput`'s copy at the same relative path.
Fixed with `<Content Remove="$(SpaRoot)**" />` plus a parallel `<None Include>` so the client
tree stays visible in Solution Explorer without being publish content
(`WebChat.csproj:35-46`). `**/dist` was added to `WebChat/.dockerignore` so a developer's
local Vite build never gets copied into an image and mixed with fresh hashed assets.

**A second, only-visible-once-deployed blocker: infinite redirect behind a TLS-terminating
proxy.** A platform that terminates TLS and forwards plain HTTP makes
`UseHttpsRedirection` see `http`, answer 307 to `https`, and the proxy forwards `http`
again — forever. Setting `X-Forwarded-Proto` alone does nothing; something has to consume it.
Fixed by adding `app.UseForwardedHeaders(...)` as the **first** middleware in
`Startup.Configure` (`Startup.cs:239-253`), gated on `Configuration["ForwardedHeaders:Enabled"]`
(`appsettings.json:30-32`, default `false`), clearing `KnownIPNetworks`/`KnownProxies`. Off by
default because clearing those lists means trusting `X-Forwarded-*` from any caller — safe
only when something in front is guaranteed to overwrite them. Note: `KnownNetworks` is
obsolete on .NET 10 (`ASPDEPR005`) — use `KnownIPNetworks`, which is what's used here.

**Secrets: injected at runtime, never baked into the image.** Design decision, not just an
implementation detail — build-time placeholder substitution was rejected because values would
land in image layers exposed by `docker history`/`docker save`, get carried to every registry
the image is pushed to, and tie one image to one environment. No templating step is needed
anywhere because ASP.NET Core's configuration provider already maps environment variables onto
config keys with `__` as the section separator (`R2__AccessKeyId` → `R2:AccessKeyId`).
`WebChat/.env` (gitignored, `.gitignore:16`) supplies compose; `WebChat/.env.example` is the
committed template. Each reference in `docker-compose.yml` uses `${NAME:?message}`, so a
missing variable stops the command naming it rather than substituting an empty string that
would fail further downstream (`docker-compose.yml:31,69,74,77`). `POSTGRES_PASSWORD` is
defined once and composed into `ConnectionStrings__DefaultConnection` so the two cannot drift
(`docker-compose.yml:74`). R2 vars deliberately have **no** `:?` — blank selects the
local-disk avatar fallback (`Startup.cs:200-207`) so a clone with no Cloudflare account still
runs.

`Startup.ValidateRequiredConfiguration` (`Startup.cs:52-78`) is a no-op in Development and
otherwise throws at boot naming any of `JWTSecretKey` / `ConnectionStrings__DefaultConnection`
that's missing. `appsettings.json` no longer carries the JWT key or DB password; dev values
moved to `appsettings.Development.json`, loaded only in that environment — so a deployment
inherits nothing from the repo. The stated point of that ordering: a shared default in
`appsettings.json` would let a misconfigured production instance start and sign tokens with a
key that's public in this repo's history. **Those values remain compromised until rotated —
rotation is explicitly deferred until CI/CD exists**, per the user.

**YAML trap in the `:?` messages.** `- JWTSecretKey=${JWT_SECRET_KEY:?generate one with:
openssl rand -base64 48}` broke `docker compose config` with "unexpected type
map[string]interface{}" — the `: ` inside the unquoted message made YAML parse the list item
as a map. Fixed by quoting the whole entry (`docker-compose.yml:77`). It was masked initially
because the missing-variable check failed at `POSTGRES_PASSWORD` earlier in the file before
reaching this line.

**Side effect: avatars now work under `docker compose` for the first time.** R2 credentials
previously lived only in `appsettings.Secrets.json`, which `.dockerignore` excludes on
purpose (`WebChat/.dockerignore`, "Local credentials - must never reach an image"), so
containers silently fell back to local disk. `/images/<name>` now 302s to a presigned R2 URL
with `cache-control: no-store`.

## Decisions and trade-offs
- **Runtime env-var injection over build-time templating** — see above; rejected because it
  bakes secrets into image layers and couples one image to one environment.
- **Separate `BuildSpa`/`IncludeSpaOutput` MSBuild targets rather than one** — lets Docker
  skip the npm-based build and supply `dist` from its own Node stage via
  `-p:SkipSpaBuild=true`.
- **`IncludeSpaOutput` errors on an empty `dist`** rather than publishing quietly — turns the
  exact bug this work found (years of client-less publishes) into a build failure instead of
  a silent regression.
- **`ForwardedHeaders` handling is opt-in, default off** — clearing `KnownIPNetworks`/
  `KnownProxies` means trusting `X-Forwarded-*` from any caller, so it's unsafe unless
  something in front of the app is guaranteed to overwrite those headers.
- **R2 credentials have no `:?` guard, unlike JWT/DB secrets** — blank is a legitimate
  configuration (local-disk fallback), not a missing one.
- **Secret rotation deferred to CI/CD**, by explicit user decision, despite the JWT key and
  DB password being publicly visible in this repo's git history right now.

## Verified
- `docker compose up --build`: migrations applied to an empty volume (4 tables); register,
  JWT auth, profile, user search, thread creation, send, `getmessages` returning the
  DateTime-keyed dictionary the client parses; SignalR negotiate 200; SPA and its module
  assets served through the API; 401 unauthenticated; 404 for a missing avatar; 307 from the
  HTTP port. (per commits `16e8b2d`, `4dc212b`)
- Browsing `localhost:3000` directly under compose: register, login, authenticated profile
  call, SignalR negotiate, 404 for missing avatar (`4dc212b`).
- Built the production image with `ASPNETCORE_ENVIRONMENT=Production` behind a simulated
  TLS-terminating proxy: index served from hashed build output with zero dev-server markers,
  assets/favicon/deep links 200, full API round trip (register, profile, search,
  createthread, send, getmessages, SignalR negotiate 200), 401 unauthenticated, 404 missing
  avatar, and — critically — still answers 307 to plain HTTP when the proxy header is absent,
  confirming HTTPS enforcement is unchanged (`bf5113c`).
- Guard rails: `Production` with no secrets set exits naming both `JWTSecretKey` and
  `ConnectionStrings__DefaultConnection`; `docker compose` with no `.env` fails naming
  `POSTGRES_PASSWORD` (`7c8e0f9`).
- Release build: 0 warnings, across all four commits.
- Client test count (56/56) is carried over from the 2026-08-03 Redux Toolkit refactor note;
  no client test files changed in this work, so it was not independently re-run as part of
  this note's verification.

**Not verified — say so plainly:** nothing has been deployed to DigitalOcean App Platform;
its behaviour (health checks, whether it forwards `X-Forwarded-Proto`) is inferred from the
simulated-proxy test, not observed on the actual platform. If App Platform's health check
does not set that header, it will see the 307 loop and may fail the deploy — check this
first before deploying.

## Known issues / follow-ups
- Client bundle is 825 KB (260 KB gzipped) in a single chunk, and `sourcemap: true`
  (`WebChat/WebChat/ClientApp/vite.config.ts:50`) ships a ~4 MB `.map` to production.
  Unaddressed in this work.
- Replacing an avatar still orphans the previous R2 object — pre-existing, noted in the
  2026-08-03 R2 avatar note.
- No .NET test project exists — pre-existing.
- Dependabot PRs #3 and #5 (from 2021) are still open; remote branch `chore/update-ui-libs`
  is stale — pre-existing.
- `docs/ctx/ORIENTATION.md` still describes SQL Server in places and now also predates this
  work — not corrected here.
- R2 credentials and the JWT signing key are pending rotation, deliberately deferred until
  CI/CD exists.
- A new `checkpoint` skill was added at `.claude/skills/checkpoint/SKILL.md` (auditing
  CLAUDE.md for staleness before delegating to `ctx`). Running it against this work found
  eight stale claims in `CLAUDE.md`, since corrected there: Create React App language, the
  `config.js`/`chat-service.js`/`mocks.js`/`theme.js` extensions (all now `.ts`/moved),
  "React 18" (now React 19), "Vite pinned to 6.x because the host runs Node 18" (Vite was
  already on 8.2.0), and "secrets are currently committed" (no longer true after `7c8e0f9`).
  Confirmed by reading the current `CLAUDE.md`, which reflects all eight corrections.
