# Code-first database bootstrap on startup

- **Date:** 2026-08-02
- **Type:** change
- **Scope:** `WebChat/WebChat/Seed/PrepDB.cs`, `Program.cs`, `Startup.cs`, `appsettings.json`
- **Status:** done

## Context

This is a code-first EF Core project, but nothing created the schema automatically. The
database had to be provisioned out of band — either `dotnet ef database update`, or by
hitting the `GET /api/seed` endpoint. `PrepDB.PrepPopulation(app)` existed but its call site
in `Startup.Configure` was commented out, and it was written against `IApplicationBuilder`
with a synchronous `Migrate()` and a `Console.WriteLine`.

## What changed

**`PrepDB` rewritten** as `MigrateDatabaseAsync(IHost, CancellationToken)`:

- Takes `IHost` instead of `IApplicationBuilder`, so it runs *before* the server starts
  listening rather than as a side effect of pipeline construction.
- Resolves a scope properly and uses `ILogger` rather than `Console.WriteLine`, so output
  goes through the configured logging pipeline.
- Gated by `Database:AutoMigrate` (default `true`).
- **Retry loop** for the container case, where the API starts before SQL Server is accepting
  connections: `Database:MigrateRetryCount` (default 10) attempts spaced
  `Database:MigrateRetryDelaySeconds` (default 5). The `when (attempt < maxAttempts)`
  exception filter means a genuine schema error is *not* swallowed — retries are exhausted
  and the original exception propagates, failing startup loudly.
- Logs the applied migration list on success.

**`Program.Main` is now `async Task`** and awaits the bootstrap before `host.RunAsync()`.
Ordering matters: no request can be served against a missing or stale schema.

**`Startup`** — added `sql => sql.EnableRetryOnFailure()` to `UseSqlServer`. That covers
transient faults during normal operation; the loop in `PrepDB` covers startup, when the
server may not be reachable at all.

**`appsettings.json`** — new `Database` section documenting the three knobs.

## Decisions and trade-offs

**Migrate on startup rather than at first request.** `Database.MigrateAsync` creates the
database when absent and is a no-op when current, so it is safe to run unconditionally.
Doing it in `Main` means a broken schema fails fast at boot instead of surfacing as a 500
on the first user request.

**Kept it opt-out rather than Development-only.** Auto-migrate on every startup is
convenient for this project's docker-compose flow, where the whole stack is disposable. It
is *not* generally safe for production — concurrent instances racing, or an unreviewed
migration hitting real data. `Database:AutoMigrate = false` is the escape hatch, and the
setting is documented inline in `appsettings.json`.

**Left `SeedController` in place.** It is now redundant, since startup does the same work.
See follow-ups — it should probably go.

## Verified

Tested against `(localdb)\MSSQLLocalDB`, driving the connection string through
`ConnectionStrings__DefaultConnection` so committed config was untouched.

**Cold start, database does not exist** — pointed the app at a brand-new `WebChatBootstrap`
database:
- Confirmed absent beforehand.
- App logged `WebChat.Seed.PrepDB[0] Database ready (1 migration(s) applied): 20200910102236_InitialDbCreate`.
- Database appeared with `__EFMigrationsHistory`, `Message`, `Thread`, `User`.
- `POST /api/auth/register` against the freshly created schema returned 200 and the row
  landed (`users=1`).

**Warm restart, database already current** — restarted the app against the same database:
- Same "Database ready" line, **zero `CREATE TABLE` statements** in the log, so no DDL re-ran.
- Existing data survived (`users=1`).
- `POST /api/auth/login` with the account created *before* the restart returned 200.

`dotnet build WebChat.sln -c Release` — 0 warnings, 0 errors. Throwaway `WebChatBootstrap`
database dropped afterwards.

**Not verified:** the retry path was never actually exercised — no unreachable SQL Server
was available to test against (no Docker daemon on this machine). The loop is reasoned, not
proven.

## Known issues / follow-ups

**`GET /api/seed` is anonymous and runs migrations.** `SeedController` carries no
`[Authorize]` attribute, so any unauthenticated caller can trigger schema work. It was
already like this — not introduced here — but it is now also redundant, because startup
does the same job. Recommend deleting the controller, or at minimum putting `[Authorize]`
on it and restricting it to Development.

**Auto-migrate does not scale to multiple instances.** Two replicas starting together will
both attempt to migrate. EF takes an application lock (`__EFMigrationsLock`), so this is
safe rather than corrupting, but one instance blocks until the other finishes. If this ever
runs more than one replica, move migrations into a deploy step and set
`Database:AutoMigrate = false`.

**No data seeding.** The bootstrap creates schema only. If demo users/threads are wanted
for a fresh environment, that is a separate addition — deliberately not bundled in here.
