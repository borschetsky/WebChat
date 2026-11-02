# Swagger is Development-only, and answers 404 everywhere else

- **Date:** 2026-11-02
- **Type:** change
- **Scope:** `WebChat/WebChat/Startup.cs`, `WebChat/WebChat.Tests/Admin/SwaggerExposureTests.cs`
- **Status:** done (code); not yet deployed

## Context
Found by the native-iOS research (WebChat-Mobile `docs/native-ios-plan.md`) while checking
whether OpenAPI code generation was possible: production at `https://chat.vtechsolutions.site`
served `/swagger/v1/swagger.json` (44 KB, OpenAPI 3.0.4, all 45 operations) and
`/swagger/index.html` to anyone, verified 200 on 2026-11-02. Not a vulnerability by itself,
but a complete survey of the API for anyone probing it, on an app that has already had an
account-takeover bug (#99).

## What I found
- `AddSwaggerGen` / `UseSwagger` / `UseSwaggerUI` were registered unconditionally in
  `Startup`.
- **Removing the middleware alone does not produce a 404 in production.** An unmatched GET
  falls through to `UseSpa`, which outside Development serves `ClientApp/dist/index.html`
  with 200. So `/swagger/v1/swagger.json` would have answered with the SPA shell — not a
  leak, but a 200 that a scanner or a code generator can mistake for "it is there".
- `AdminApiFactory` boots the host as environment `Testing`, i.e. the same side of any
  `IsDevelopment()` gate a deployment is on — so it is the right harness for this test.

## What changed
- `Startup.SwaggerEnabled(env)` reads `Swagger:Enabled`, defaulting to
  `env.IsDevelopment()`. It gates `AddSwaggerGen` in `ConfigureServices` and
  `UseSwagger`/`UseSwaggerUI` in `Configure`.
- When disabled, `app.Map("/swagger", …)` answers 404 explicitly, ahead of the SPA fallback.
  Its position in the pipeline is where Swagger was — after `/health` and
  `UseHttpsRedirection`, so `/health` ordering is untouched.
- `SwaggerExposureTests`: `/swagger/v1/swagger.json`, `/swagger/index.html` and `/swagger`
  return 404 on the non-Development host; and with `Swagger:Enabled=true` the document is
  served (200, contains `"openapi"`), so the 404s cannot pass merely because Swagger is
  broken.

## Decisions and trade-offs
- **A flag defaulting to Development, rather than a hard `IsDevelopment()`.** Costs one
  line, lets a staging environment opt in with `Swagger__Enabled=true`, and is what makes
  the positive test possible without booting a Development host (which proxies unmatched
  requests to a Vite dev server that is not running). Never set it on the public app.
- **Generator gated too**, not just the middleware — nothing else resolves it.
- **Explicit 404 rather than relying on the SPA fallback** — see above.

## Verified
- New tests written first and seen failing (all three paths answered 200), then passing.
- `dotnet test WebChat.Tests`: 391 passed, 2 skipped, 0 failed.
- `dotnet build WebChat.sln`: 0 errors, 0 code warnings.
- **Not verified:** production. Merging does not deploy — it needs
  `doctl apps create-deployment 7337e1b0-3696-44f8-9462-df84a75c5bab`; re-check
  `/swagger/v1/swagger.json` returns 404 afterwards.

## Known issues / follow-ups
- **Pre-existing, unrelated:** `dotnet build -warnaserror` (what CI's `api` job runs) now
  fails on NuGet audit advisories NU1902/NU1903 for `SixLabors.ImageSharp` 3.1.12 in
  `WebChat.AvatarWriter` (GHSA-j3p4-wp97-rph4 and others, high severity). The advisories
  are fetched live, so this appeared without any commit; master's last green CI predates it.
- Mobile and native-iOS code generation must run against a local Development instance
  (`https://localhost:7199/swagger/v1/swagger.json`), not production.
