# .NET Core 3.1 → .NET 10 upgrade + full project analysis

- **Date:** 2026-08-02
- **Type:** both
- **Scope:** all six C# projects under `WebChat/`, Docker assets, `appsettings*.json`
- **Status:** done (server side); ClientApp deliberately left on its old stack

## Context

The solution was pinned to `netcoreapp3.1`, which went out of support in December 2022.
The machine has only the .NET 10 SDK (`10.0.102`) installed, so the solution could not be
built at all before this work. Goal: get the whole thing onto `net10.0`, building and
running, without changing observable API behaviour.

## What I found

**Architecture.** Six projects: `WebChat` (ASP.NET Core host + controllers),
`WebChat.Models` (entities + view models), `WebChat.Connection` (EF Core `DbContext` +
migrations), `WebChat.Services` (business logic), `WebChat.Hubs` (SignalR), and
`WebChat.AvatarWriter` (image upload). A CRA React 16 SPA lives in `WebChat/ClientApp`
and is proxied by `UseSpa` in development. Auth is hand-rolled JWT — no ASP.NET Identity.
Transport is REST + a single SignalR hub at `/chat`, with the JWT passed via the
`access_token` query string for the websocket handshake.

**The two blocking upgrade issues** were not the target framework itself:

1. `Microsoft.Data.SqlClient` 4.0 (pulled in by EF Core 7+) flipped the connection-string
   `Encrypt` default from `false` to `true`. The container SQL Server presents a
   self-signed certificate, so every connection would have failed with a certificate
   trust error until `TrustServerCertificate=True` was added.
2. `IHostingEnvironment` no longer satisfies the `IsDevelopment()` extension — that lives
   on `IHostEnvironment` in `Microsoft.Extensions.Hosting` now, so both the parameter type
   *and* the `using` had to change.

**Two projects referenced assemblies by absolute HintPath into the SDK's
`NuGetFallbackFolder`** (`WebChat.AvatarWriter.csproj`, `WebChat.Services.csproj`),
pointing at 2.2.0/5.3.0 DLLs that no longer ship. These were shadowing the real
`PackageReference`s and are machine-specific — they would never have restored on
another developer's box.

`WebChat.Hubs` referenced `Microsoft.AspNetCore.SignalR.Core` **1.1.0**, an ASP.NET Core
2.x-era package. SignalR has been part of the shared framework since 3.0.

**Password hashes are safe.** `CryptoHelper` is still maintained (5.1.0 targets `net10.0`).
`Crypto` was renamed to `PasswordHasher` — same ASP.NET Identity V3 PBKDF2 format. I
verified empirically that a hash produced by 3.0.2 verifies under 5.1.0 (see Verified).

**JWT claim mapping survives.** This was the biggest behavioural risk: since .NET 8,
`AddJwtBearer` uses `JsonWebTokenHandler` instead of `JwtSecurityTokenHandler`. Because
`JwtBearerOptions.MapInboundClaims` still defaults to `true`, the `unique_name` claim
written by `AuthService.GetToken` is still mapped back to `ClaimTypes.Name`, so the
`User.Identity.Name` idiom used throughout the controllers keeps working. Verified end
to end.

**The EF Core 3.1 migration is still valid.** EF Core 10 reads
`20200910102236_InitialDbCreate` and the 3.1 model snapshot without complaint, and
reports no model drift. No new migration is needed.

**CORS was configured to allow nothing.** `Startup.Configure` called `UseCors` with
`AllowAnyMethod().AllowAnyHeader().AllowCredentials()` but never specified an origin — a
policy with no origins matches no origin. It happened not to matter because the SPA is
served through the API's own origin via `UseSpa`, so requests are same-origin.

**`UseRouting()` was called twice** (once before the environment check, once after
`UseAuthentication`), and `UseAuthentication` ran before `UseRouting` — an ordering that
happens to work but is not the documented pipeline.

**The SPA dev-server URL was hardcoded** to `http://react-app:3000`, the docker-compose
service name, so development outside docker could not work.

## What changed

**Retargeting** — all six `.csproj` files moved from `netcoreapp3.1` to `net10.0`.

**Package references**
- EF Core, JwtBearer, NewtonsoftJson, SpaServices.Extensions, EFCore.Design → `10.0.10`
- `Swashbuckle.AspNetCore` 5.5.1 → `10.2.3`
- `CryptoHelper` 3.0.2 → `5.1.0`; `Microsoft.IdentityModel.Tokens` / `System.IdentityModel.Tokens.Jwt` 6.7.1 → `8.22.0`
- Removed `Microsoft.AspNetCore.SpaServices` (discontinued after 3.1 — only the
  `.Extensions` package survives), `Microsoft.EntityFrameworkCore.Sqlite.Core` (unused;
  the SQLite line in `Startup` was already commented out), and
  `Microsoft.VisualStudio.Azure.Containers.Tools.Targets` (VS-only tooling, not needed to build)
- Replaced `Microsoft.AspNetCore.SignalR.Core` and `Microsoft.AspNetCore.Http.Features`
  package references with `<FrameworkReference Include="Microsoft.AspNetCore.App" />`
- Deleted both `NuGetFallbackFolder` `<Reference>`/`<HintPath>` blocks

**Code**
- `Program.cs`: `WebHost.CreateDefaultBuilder` → `Host.CreateDefaultBuilder(...).ConfigureWebHostDefaults(...)`
- `Startup.Configure`: `IHostingEnvironment` → `IWebHostEnvironment`, added
  `using Microsoft.Extensions.Hosting`
- `Startup.Configure`: removed the duplicate `UseRouting()`; pipeline is now
  static files → swagger → routing → CORS → authentication → authorization → endpoints → SPA
- `Startup.ConfigureServices`: CORS became a named policy reading `Cors:AllowedOrigins`
- `Startup.Configure`: SPA dev-server URL now reads `SpaDevServerUrl` from configuration,
  defaulting to `http://localhost:3000`
- `AuthService.HashPassword` / `VerifyPassword`: `Crypto` → `PasswordHasher` (the obsolete
  type still works but warns)
- Dropped dead code from `Startup`: unused `server`/`port` locals, a leftover
  `Environment.GetEnvironmentVariable("HELLO")` probe, and two stale `using`s

**Configuration**
- `TrustServerCertificate=True` added to all three connection strings in `appsettings.json`
- Added the `Cors:AllowedOrigins` array and `SpaDevServerUrl` (Development)

**Docker**
- `mcr.microsoft.com/dotnet/core/{aspnet,sdk}:3.1-buster*` → `mcr.microsoft.com/dotnet/{aspnet,sdk}:10.0`
- Removed the two Node installs from the API image. They ran `curl` in a base image that
  has no `curl`, and nothing in the build actually uses Node — the SPA is built by the
  `react-app` container.
- Ports moved 80/443 → 8080/8443 because .NET 8+ images run as the non-root `app` user
  and cannot bind privileged ports. Host-facing ports are unchanged (8080/8081), so
  `ClientApp/src/config.js` still resolves.
- `wwwroot/images` is now created and chowned in the image (see follow-ups)
- compose: dropped the obsolete `version:` key, `SA_PASSWORD` → `MSSQL_SA_PASSWORD`,
  mssql 2017 → 2022, fixed the stray trailing quote in `ASPNETCORE_HTTPS_PORT=8081"`,
  replaced the placeholder `/path/on/host` bind mount with a named `webchat-avatars`
  volume, and re-enabled `depends_on`
- `dotnet-tools.json` added at the solution root pinning `dotnet-ef` 10.0.10

## Decisions and trade-offs

**Kept the `Startup` class instead of converting to minimal hosting.** `WebApplication.
CreateBuilder` is the modern idiom, but folding `Startup` into `Program` would have made
the upgrade diff much harder to review for no functional gain. `ConfigureWebHostDefaults`
+ `UseStartup<T>` is fully supported in .NET 10. Converting later is a self-contained change.

**Kept Newtonsoft.Json rather than moving to System.Text.Json.** `ThreadController`
returns `Dictionary<DateTime, List<MessageViewModel>>`, and the SPA parses those keys with
`new Date(key)` (`ClientApp/src/components/message-list/message-list.js` and
`helpers/date-time-format.js`). The two serializers format non-string dictionary keys
differently, so switching would have silently broken message grouping in the UI.

**Kept `SpaServices.Extensions` rather than moving to `Microsoft.AspNetCore.SpaProxy`.**
`SpaServices.Extensions` still ships at 10.0.10 and the existing `UseSpa` /
`UseProxyToSpaDevelopmentServer` calls work unchanged. `SpaProxy` is the newer template
approach but would require reworking both the host and the client Dockerfile.

**Pinned the client image to Node 16, not the latest LTS.** `react-scripts` 3.x is built
on webpack 4, which calls `crypto.createHash('md4')` — removed in OpenSSL 3, so it hard
fails on Node 17+. Node 16 is the highest version compatible with the current frontend.
Going further requires migrating the SPA first.

**Widened CORS from "nothing" to a configured origin list.** Strictly this is a behaviour
change, not a port. I made it because a credentialed policy with zero origins is a
latent trap, and the defaults (`localhost:3000`, `localhost:8081`) match what this app
actually serves. If you want the literal old behaviour, set `Cors:AllowedOrigins` to `[]`.

**Left pre-existing bugs alone.** Several real defects are listed below. They are not
upgrade regressions and fixing them would have muddied the upgrade diff.

## Verified

- `dotnet build WebChat.sln` in **Debug and Release**: succeeded, **0 warnings, 0 errors**.
- `dotnet restore`: clean, no downgrade or compatibility warnings.
- **App boots on .NET 10** — started with `ASPNETCORE_ENVIRONMENT=Development`; log shows
  `Application started`, listening on both HTTP and HTTPS, no exceptions. This exercises
  the whole DI graph.
- **All 13 endpoints resolve** — `GET /swagger/v1/swagger.json` returned HTTP 200 listing
  every `/api/...` route, which forces MVC to build the application model over all six controllers.
- **Auth rejects anonymous** — `GET /api/hey/getthreads` without a token → HTTP 401.
- **Model validation intact** — `POST /api/auth/login` with a bad payload → HTTP 400 with
  the expected `Email`/`Password` validation messages.
- **JWT round-trip** — built a harness referencing the *real* `WebChat.Services`
  `AuthService`, issued a token, and called a `RequireAuthorization` endpoint with it:
  `User.Identity.Name` resolved to the user id and `IsAuthenticated=True`. Token payload
  confirmed to carry `unique_name`.
- **Password hash compatibility** — a hash generated by `CryptoHelper` 3.0.2 verifies
  `True` under 5.1.0's `PasswordHasher`, a wrong password verifies `False`, and 5.1.0
  round-trips its own hashes. Existing accounts will keep working.
- **EF Core 10 vs the 3.1 migration** — `dotnet ef dbcontext info` resolves the context;
  `migrations list` finds `20200910102236_InitialDbCreate`;
  `migrations has-pending-model-changes` reports *"No changes have been made to the model
  since the last migration"*; `migrations script --idempotent` generates valid SQL
  (7 CREATE TABLE/INDEX statements).

**Not verified:** no SQL Server and no Docker daemon were available on this machine, so
nothing was run against a live database and **no container image was actually built**.
The `TrustServerCertificate` fix, the container port change, and the non-root
`wwwroot/images` permissions are all reasoned corrections, not tested ones. The React
client was not built or run.

> **Superseded in part** — see *Update — 2026-08-02: verified against live SQL Server*
> below. The database half of this gap is now closed. Docker and the React client remain
> unverified.

## Known issues / follow-ups

All of these are **pre-existing** — none were introduced by the upgrade.

**Correctness**
- `WebChat.Services/ThreadService.cs:105` — `GetThreadMessages` wraps the *injected*
  scoped `DbContext` in `using (ctx)`, disposing a container-owned object. Any later use
  of that context in the same request throws `ObjectDisposedException`. It survives today
  only because it happens to be the last call in its request path. Delete the `using`.
- `WebChat.Services/UserService.cs:106` — unreachable `throw new NotImplementedException()`
  after a `return`.
- `WebChat.Services/UserService.cs:121` and `:126` — `.FirstOrDefault(...).Id` /
  `.Username` dereference without a null check.
- `WebChat.Services/Helpers/Validator.cs:28` — `DoesUserBelongToCurentThread` dereferences
  a possibly-null thread. Reachable if a thread is deleted between the two checks in
  `ThreadController`.
- `WebChat.Hub/ChatHub.cs:40` and `:57` — `Clients.All.SendAsync(...)` is not awaited;
  exceptions are swallowed and ordering is not guaranteed.
- `WebChat.Hub/ConnectionMapper/ConnectionMapping.cs:38` — `GetConnections` reads
  `_connections` without taking the lock that `Add`/`Remove` hold, and returns the live
  `HashSet`. This can throw during concurrent mutation. It is also a singleton holding
  in-memory state, so it breaks under more than one server instance.
- `WebChat/Controllers/AvatarsController.cs:34` — `Request.Form.Files[0]` throws if no
  file is posted; no size or content-type limit is enforced before the file is buffered.
- `WebChat.AvatarWriter/AvatarWriter.cs:44` — writes to `wwwroot/images` without creating
  it. Empty folders are not published, so this fails on a fresh deployment; the exception
  is caught and returned *as the filename*, which then gets stored on the user record.
  Worked around in the Dockerfile; the code should call `Directory.CreateDirectory`.
- `WebChat.Services/ThreadService.cs:26` — `matchedMessages` is built and never used
  (a second, real query follows).

**Security** — the JWT signing key and the SQL Server SA password are committed in
`appsettings.json` and `docker-compose.yml`. They are in git history, so rotating them
means rotating the secrets themselves, not just editing the files. Move them to user
secrets / environment variables.

**Performance** — `HeyController.cs:88` issues one `GetUserNameById` query per user, and
`GetUsersThreads` issues per-thread queries for last message and profile. Both are N+1.

**Frontend (untouched, needs its own migration)** — React 16.13 + `react-scripts` 3.0.0
(webpack 4, Node ≤16 only), `@material-ui/core` v3 (two major versions behind MUI v5+),
`axios` 0.18.1 (known advisories), and `@aspnet/signalr` 1.1.4 which is deprecated in
favour of `@microsoft/signalr`. A stray `sudo` package sits in `dependencies` and should
be removed. This is the largest remaining piece of work.

## Update — 2026-08-02: verified against live SQL Server

The machine turned out to have **LocalDB (SQL Server 2025 RC1, 17.0.925.4)** plus SSMS 22,
so the "never run against a real database" gap above is now closed. Everything below ran
against `(localdb)\MSSQLLocalDB`, database `WebChatTest`, with the connection string
supplied via the `ConnectionStrings__DefaultConnection` environment variable so
`appsettings.json` stayed pointed at the docker server.

Also note the toolchain moved underneath this work: a Visual Studio 2026 update to
18.8.12023.21 replaced the SDK with **10.0.302**. The solution rebuilds clean on it
(Release, 0 warnings, 0 errors).

**Migration applied for real.** `dotnet ef database update` ran the 2020-era 3.1 migration
under EF Core 10 against SQL Server 2025 with no edits: `User`, `Thread`, `Message`, three
indexes, and a `__EFMigrationsHistory` row stamped `10.0.10`.

**End-to-end flow, all passing:**

| # | Case | Result |
|---|---|---|
| 1-2 | Register two users | 200, tokens + ids returned |
| 3 | Duplicate email | 400 `user with this email already exists` |
| 4 | Login (PBKDF2 verify against stored hash) | 200 |
| 5 | Wrong password | 400 `invalid password` |
| 6 | List users | 200, excludes caller |
| 7 | Create thread | 200, threadId |
| 8 | Duplicate thread | 400, returns existing threadId |
| 9 | Send 4 messages (both users) | 201 each |
| 10 | Get messages | 200, `DateTime`-keyed dictionary |
| 11 | Search messages | 200, matched only the intended message |
| 12 | Get threads | 200, last message + opponent profile |
| 13 | User search by partial name | 200 |
| 14-15 | Get / update profile | 200, change re-read correctly |
| 16 | Third user reads someone else's thread | 400, access denied |
| 17 | SignalR negotiate without token | **401** |
| 18 | SignalR negotiate with `access_token` in query string | **200**, transports offered |

Cases 17-18 matter: they exercise the `JwtBearerEvents.OnMessageReceived` hook in
`Startup.RegisterAuthentication` that pulls the token out of the query string for the
websocket handshake. That path survives the IdentityModel 6→8 jump.

**The Newtonsoft decision is now empirically justified, not just reasoned.** The messages
endpoint serialized its dictionary key as `"2026-08-02T00:00:00"` — precisely what the
SPA's `new Date(key)` consumes. Switching to System.Text.Json would have changed this.

**Persisted state confirmed by direct SQL** — 3 users, 1 thread, 4 messages; messages join
correctly to their senders; the profile rename is reflected in the `User` row.

**New finding — the work factor increased.** Decoding the Identity V3 hash headers:

```
CryptoHelper 3.0.2:  01 00000001 00002710  ->  10,000 iterations
CryptoHelper 5.1.0:  01 00000001 000927C0  -> 600,000 iterations
```

The iteration count is embedded in each hash, which is *why* old hashes still verify — the
verifier reads the cost from the stored value. So old and new hashes coexist safely, but
**existing accounts keep their weak 10k work factor until those users next change their
password**. Consider a rehash-on-successful-login step in `AuthController.Post(LoginViewModel)`.

**Still not verified:** Docker images were never built (no daemon on this machine), and the
React client was never built or run.

**Test leftovers:** database `WebChatTest` on `(localdb)\MSSQLLocalDB` still exists with the
seeded alice/bob/carol data. Drop with
`sqlcmd -S "(localdb)\MSSQLLocalDB" -E -Q "DROP DATABASE WebChatTest"`.
