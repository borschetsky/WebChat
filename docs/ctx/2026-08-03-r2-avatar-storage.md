# Cloudflare R2 avatar storage behind presigned redirects

- **Date:** 2026-08-03
- **Type:** change
- **Scope:** `WebChat/WebChat.AvatarWriter/*`, `WebChat/WebChat/Controllers/AvatarsController.cs`,
  `WebChat/WebChat/Startup.cs`, `WebChat/WebChat/Program.cs`, `WebChat/WebChat/appsettings.json`,
  `WebChat/WebChat/ClientApp/vite.config.ts`
- **Status:** done — upload path now driven through the UI end to end (see 2026-08-03 update)

## Context
Avatars were written to `Directory.GetCurrentDirectory()/wwwroot/images`
(`WebChat/WebChat.AvatarWriter/AvatarWriter.cs`), which is container-local storage. That's
fine on a droplet where `docker-compose.yml` mounts a named volume over it
(`webchat-avatars:/src/wwwroot/images`, `WebChat/docker-compose.yml:40,46`), but is wiped on
every deploy on DigitalOcean App Platform, whose filesystem is ephemeral. Commit
`475a6ec42cd683bd265c36783a8006bc6cfda1e6` on `chore/update-ui-libs` moves avatars to
Cloudflare R2 with a fallback to the old local-disk behavior.

## What I found / decided

**R2 over DO Spaces, over a DO block-storage Volume.** R2's free tier (10 GB storage, zero
egress) covers a project this size at $0; Spaces bills a $5/month minimum from the first
byte. Both speak the S3 API (`AWSSDK.S3`), so switching later is a `ServiceUrl` and a bucket
name away. A DO Volume was rejected as the same "container-local disk" model this change is
trying to get away from.

**Presigned URLs, not a public bucket.** Serving R2 objects publicly with a clean URL
requires attaching a custom domain, which requires the domain's DNS to be on Cloudflare —
this project has no domain. The `r2.dev` fallback URL is rate-limited and Cloudflare
documents it as not for production.

**Redirect rather than embedded URLs — the design decision that matters.**
`AvatarsController.GetImage` (`WebChat/WebChat/Controllers/AvatarsController.cs:63-82`) is
`[AllowAnonymous]`, mapped at `[HttpGet("/images/{fileName}")]`, and does nothing but 302 to
`avatarUrls.GetReadUrl(fileName)`. Consequences, all confirmed in code/comments:
- Expiry never reaches the client — every image load re-signs. `R2Options.UrlLifetimeMinutes`
  defaults to 15 minutes (`WebChat/WebChat.AvatarWriter/R2Options.cs:28`).
- Zero client change: `avatar-image-service.ts:7` already builds
  `` `${Config.network.api}images/${fileName}` ``, and the DB stores bare filenames, so no
  migration or adapter change was needed (`WebChat/WebChat/ClientApp/src/services/avatar-image-service.ts:7`).
- Image bytes go browser→R2 directly; the API only emits the redirect.
- `Startup.cs` calls `app.UseStaticFiles()` (line 186) before `app.UseRouting()` (line 195),
  so any avatar still physically sitting in `wwwroot/images` is served from disk and never
  reaches `GetImage` — legacy/local avatars get a free fallback path.
- The action must be anonymous because an `<img>` tag can't send the bearer token the API
  otherwise requires. Filenames are server-generated GUIDs (not enumerable), but anyone
  holding a filename can fetch that avatar — accepted tradeoff, not an oversight
  (comment at `AvatarsController.cs:55-57`).
- `Response.Headers.CacheControl = "no-store"` is set on the redirect (`AvatarsController.cs:79`)
  so a cached 302 can't keep sending browsers to an expired signature.

**Config fork and null-object fallback.** `R2Options.IsConfigured`
(`R2Options.cs:38-42`) requires `AccountId`, `AccessKeyId`, `SecretAccessKey`, and `Bucket`
all present. `Startup.AddAvatarStorage` (`Startup.cs:132-171` roughly, see diff) binds `R2`
config, and if not configured registers the original `AvatarWriter.AvatarWriter` plus a new
`LocalAvatarUrlProvider` null object (`WebChat/WebChat.AvatarWriter/LocalAvatarUrlProvider.cs`)
that always returns `null` from `GetReadUrl`. This keeps `AvatarsController`'s
`IAvatarUrlProvider` dependency non-optional rather than leaving it unregistered and relying
on `ActivatorUtilities` to fill in a default for an unresolvable service — a deliberate
choice per the class doc comment (`LocalAvatarUrlProvider.cs:9-11`). Only `R2:Bucket` and
`R2:UrlLifetimeMinutes` live in `appsettings.json`
(`WebChat/WebChat/appsettings.json:34-45`); `AccountId`/`AccessKeyId`/`SecretAccessKey` must
come from user secrets or `R2__*` env vars — appsettings.json carries an explicit comment
warning not to add them there.

**Two R2-specific settings that are load-bearing** (both commented in code, both easy to
silently "clean up" later — flagging so nobody does):
- `DisablePayloadSigning = true` on the `PutObjectRequest`
  (`WebChat/WebChat.AvatarWriter/R2AvatarWriter.cs:64`) — R2 rejects the streaming-checksum
  trailer `AWSSDK.S3` v4 adds by default.
- `ForcePathStyle = true` with `AuthenticationRegion = "auto"` on `AmazonS3Config` in
  `Startup.AddAvatarStorage` — R2 addresses buckets by path, not by subdomain, and has a
  single global region.
- `AWSSDK.S3` is pinned to `4.0.101.6` (`WebChat/WebChat.AvatarWriter/WebChat.AvatarWriter.csproj`).

**Two pre-existing bugs fixed in `AvatarWriter.cs`** (both had to be settled anyway to pick a
Content-Type for the R2 upload, so they were fixed in the local writer too for consistency):
1. Extension came from the uploader-controlled `file.FileName`
   (old `AvatarWriter.cs`: `"." + file.FileName.Split('.')[...]`). Since these files are
   served from the app's own origin, an attacker-chosen `.html` extension on content crafted
   to satisfy both an image-format sniff and an HTML parser was a stored-XSS vector. Fixed:
   extension is now derived from `WriteHelper.GetImageFormat` magic-byte sniffing via a new
   `ExtensionFor` helper, in both `AvatarWriter.cs` and `R2AvatarWriter.cs`.
2. `wwwroot/images` is not in source control, so outside Docker (where compose mounts a
   volume over it) it doesn't exist; `FileMode.Create` threw `DirectoryNotFoundException`,
   the catch block returned `e.Message`, and the caller (`AvatarsController.UploadImage`)
   stored that exception text as the user's avatar filename. Fixed by calling
   `Directory.CreateDirectory(directory)` before opening the `FileStream`
   (`WebChat/WebChat.AvatarWriter/AvatarWriter.cs`, in `WriteFile`).

## What changed
- `WebChat/WebChat.AvatarWriter/AvatarWriter.cs` — extension now sniffed, not taken from
  upload filename; directory created before write.
- `WebChat/WebChat.AvatarWriter/R2AvatarWriter.cs` (new) — `IAvatarWriter` +
  `IAvatarUrlProvider` implementation backed by `IAmazonS3`.
- `WebChat/WebChat.AvatarWriter/R2Options.cs` (new) — bound from config section `"R2"`.
- `WebChat/WebChat.AvatarWriter/Interface/IAvatarUrlProvider.cs` (new) — `GetReadUrl(fileName)`.
- `WebChat/WebChat.AvatarWriter/LocalAvatarUrlProvider.cs` (new) — null object, always returns null.
- `WebChat/WebChat/Controllers/AvatarsController.cs` — new `[AllowAnonymous]`
  `GET /images/{fileName}` action that redirects to a signed URL.
- `WebChat/WebChat/Startup.cs` — `AddAvatarStorage` forks between R2 and local-disk DI
  registration based on `R2Options.IsConfigured`.
- `WebChat/WebChat/appsettings.json` — `R2:Bucket` / `R2:UrlLifetimeMinutes` added, with a
  comment steering credentials to user secrets / `R2__*` env vars.
- `WebChat/WebChat.AvatarWriter/WebChat.AvatarWriter.csproj` — added `AWSSDK.S3` 4.0.101.6.

No changes needed on the client: `ClientApp/src/services/avatar-image-service.ts` was
already URL-shaped correctly for the new redirect endpoint.

## Verified
- **Storage layer, live bucket, throwaway console tool:** round-tripped a 1x1 PNG through the
  real R2 bucket using the exact `AmazonS3Client` config `Startup` builds — PUT, presign,
  unauthenticated HTTPS GET (200, `image/png`, bytes identical to what was uploaded), DELETE.
  Bucket confirmed empty afterward by listing it.
- **Read path, running app** (`https://localhost:7199`, LocalDB launch profile):
  `GET /images/{name}` with no bearer token → 302, `Cache-Control: no-store`, a
  900-second-lifetime signature; following the redirect → 200 `image/png`, 70 bytes; a
  filename with no corresponding object → 404 after the redirect.
  `POST /api/avatars/upload` with no token → 401, confirming `[AllowAnonymous]` is scoped to
  the read action only (`AvatarsController` class itself carries `[Authorize]`,
  `AvatarsController.cs:14`).
- **Not verified:** the upload path has not been driven through the actual React UI — no
  avatar has been uploaded by a signed-in user via the client. Only the storage layer and the
  read redirect were exercised end to end.

## Known issues / follow-ups
- **Incidental, unrelated finding from this session's diagnosis work:** `GET /api/threads` and
  `GET /api/Thread` both fall through MVC routing to the SPA dev-server proxy (500/502 when
  Vite isn't running). `ThreadController` is routed `api/[controller]`
  (`WebChat/WebChat/Controllers/ThreadController.cs:12`) and only declares
  `getmessages/{id}` (line 27) and `search` (line 62) — there is no parameterless `GET`
  action, so a bare `GET /api/Thread` was never going to be handled by MVC. This is
  pre-existing (confirmed present as far back as commit `f5bf97a`) and unrelated to the R2
  change; noted here because it cost time during diagnosis and will likely confuse the next
  person too.
- Superseded by the 2026-08-03 update below: upload-via-UI is no longer a gap, a genuine
  data-corruption bug was found and fixed, and the R2 credentials moved out of user secrets.

## Update — 2026-08-03

Three follow-on commits on the same branch, in order: `676d787` (image processing + size
limit), `9f28cde` (dev-proxy fix), `fc94594` (credentials file). Together they close the
"upload path not driven through the UI" gap the original note left open — a real upload
through the React client was confirmed end to end.

### 1. Image processing and a 5 MB upload cap (`676d787`)

**Why.** The first real avatar uploaded through the UI was 2.8 MB straight off a phone,
stored as-is. At that size R2's 10 GB free tier holds ~3,500 avatars instead of ~200,000,
and a 20-row thread list pulls tens of megabytes — for images the client renders at 34–40 px
(`AvatarOptions.cs:19`, citing `densityTokens` in the client theme).

New `AvatarImageProcessor` + `IAvatarImageProcessor` (`WebChat/WebChat.AvatarWriter/AvatarImageProcessor.cs`,
`Interface/IAvatarImageProcessor.cs`) plus an `AvatarImage` result type and `AvatarOptions`
(`WebChat/WebChat.AvatarWriter/AvatarOptions.cs`, bound from config section `"Avatars"`,
`AvatarOptions.cs:9`). Called from both `AvatarWriter` and `R2AvatarWriter`
(`WebChat/WebChat.AvatarWriter/AvatarWriter.cs`, `R2AvatarWriter.cs`) so the two paths cannot
drift on limits or output format. Measured (commit message and note both cite the same run):
a 4000x3000 JPEG of 839 kB became 256x192 at 17,615 bytes — a 48x reduction.

**Three distinct limits, each guarding a different failure mode:**
- `MaxUploadBytes` (5 MB default, `AvatarOptions.cs:16`) enforced by the ASP.NET multipart
  parser via `services.Configure<FormOptions>(o => o.MultipartBodyLengthLimit = avatars.MaxUploadBytes)`
  in `Startup.AddAvatarStorage` (`WebChat/WebChat/Startup.cs:151`), so an oversized body is
  rejected before being buffered rather than after.
- `MaxSourceMegapixels` (50 default, `AvatarOptions.cs:30`) checked via `Image.IdentifyAsync`
  (`AvatarImageProcessor.cs:62`) — header only, before any pixel data is decoded. This is the
  decompression-bomb guard: such a file is small on disk (so the byte cap misses it) and
  enormous once decoded.
- Output format: PNG in → PNG out (transparency survives, `AvatarImageProcessor.cs:76,101-104`);
  everything else → JPEG at `JpegQuality` (82 default, `AvatarOptions.cs:32`,
  `AvatarImageProcessor.cs:107`). Animated GIFs lose animation, an accepted trade at 40 px.

**Re-encoding is a security property, not just a size one.** The stored bytes are bytes this
process produced, so EXIF is discarded (`image.Metadata.ExifProfile/IptcProfile/XmpProfile`
set to `null`, `AvatarImageProcessor.cs:96-98`, plus `x.AutoOrient()` applied first,
`AvatarImageProcessor.cs:82`, so portrait photos are not rotated) and any polyglot payload
crafted to parse as both an image and something executable is destroyed. Not independently
re-verified in this pass beyond confirming the code exists as described — the EXIF-stripping
claim was not proven by an actual EXIF-bearing test image, per the original work's own
admission.

**`SixLabors.ImageSharp` is pinned to `3.1.12`**, confirmed at
`WebChat/WebChat.AvatarWriter/WebChat.AvatarWriter.csproj:14`. Deliberate: 4.0 requires a paid
Six Labors licence key at build time; 3.1.x is the last version usable under the free Split
Licence for a project this size. A future "just upgrade ImageSharp" pass will break the build
without one.

### 2. Data-corruption bug fixed in the same commit

`IAvatarWriter.UploadImage` used to return a bare `string` carrying both the filename and any
error text; `AvatarsController` persisted whatever came back, so a rejected upload set
`User.AvatarFileName` to literal text like `"Invalid image file"` and still returned HTTP 200.
Fixed with a new `AvatarUploadResult` type (`Ok`/`FileName`/`Error`,
`WebChat/WebChat.AvatarWriter/Interface/IAvatarWriter.cs:20-35`, doc comment at lines 11-19
recording the bug). `ImageHandler.UploadImage` now returns it directly instead of wrapping in
an `ObjectResult` the controller unwrapped with `.ToString()`
(`WebChat/WebChat/Handler/ImageHandler.cs:21-25`). `AvatarsController.UploadImage`
(`WebChat/WebChat/Controllers/AvatarsController.cs:36-71`) persists only on `result.Ok`
(lines 61-66) and returns 400 with `result.Error` otherwise (line 63). Reading
`HttpContext.Request.Form` is wrapped in try/catch for `InvalidDataException`
(`AvatarsController.cs:38-49`), because the multipart limit throws from there and initially
surfaced as a 500 with a full stack trace.

Client side needed no change: `uploadAvatar` uses Axios, which throws on 400, so
`ChatApp.handleUploadAvatar` already shows a failure message — previously a rejected upload
returned 200 and the UI reported success while storing a broken filename. (Not independently
re-verified this pass; taken from the commit message, which is consistent with the code
change above.)

**Verified (per commit message, live bucket + LocalDB):** valid 4000x3000 upload → 200 +
17,615 bytes at 256x192; 6 MB upload → 400 "Multipart body length limit 5242880 exceeded.";
non-image → 400 "Invalid image file"; user row held only the successful filename afterward.
Not re-run in this pass; taken on the strength of the commit message plus the code matching
its description exactly.

### 3. Vite dev-server proxy gap (`9f28cde`)

`getUserAvatar` (`WebChat/WebChat/ClientApp/src/services/avatar-image-service.ts:7`) builds a
relative `/images/{fileName}`, but `vite.config.ts` proxied only `/api` and `/chat`. Browsing
`http://localhost:3000`, an avatar request therefore hit Vite's SPA fallback and returned
`index.html` to an `<img>` tag: HTTP 200, `Content-Type: text/html`, a broken avatar, and
nothing in any log to explain it. Browsing the ASP.NET host directly was unaffected, which is
why it went unnoticed. Pre-existing — avatars were served at the same relative path from
`wwwroot/images` before R2 — but the R2 work made it visible.

Fix, confirmed at `WebChat/WebChat/ClientApp/vite.config.ts:37`: adds
`'/images': { target: apiTarget, changeOrigin: true, secure: false }` to the proxy table,
with no `followRedirects` option set (the comment at lines 30-36 explains why: the API's 302
carries an absolute R2 `Location`, and http-proxy's default is to pass a redirect through
rather than follow it, so the browser follows it to R2 exactly as in production and image
bytes never travel through the dev proxy). Verified per commit message: `/images/{name}` on
`:3000` returns 302, following it yields 200 `image/jpeg`.

### 4. Credentials moved to a gitignored file (`fc94594`)

Moved from `dotnet user-secrets` to `WebChat/WebChat/appsettings.Secrets.json` (gitignored),
with `appsettings.Secrets.example.json` committed as the template — confirmed present at
`WebChat/WebChat/appsettings.Secrets.example.json`. Rationale per commit message: user secrets
work but are invisible — nothing in the tree says where keys come from or what shape they
take.

Three things confirmed in code:
- **Provider order.** `Program.cs:25-50` adds `appsettings.Secrets.json` via
  `ConfigureAppConfiguration`, then explicitly removes it from the end of `config.Sources` and
  re-inserts it immediately ahead of the first `EnvironmentVariablesConfigurationSource`
  (`Program.cs:36-49`), so a deployed instance's env vars always outrank a stray file.
- **Publish.** `WebChat/WebChat/WebChat.csproj:25` — `<Content Update="appsettings.Secrets.json" CopyToPublishDirectory="Never" />` — stops the Web SDK's `appsettings.*.json` glob from packaging real keys.
- **Docker.** `**/appsettings.Secrets.json` added to both `WebChat/.dockerignore:27` and
  `WebChat/WebChat/.dockerignore:27`, plus `.gitignore:335`.

`optional: true` (`Program.cs:29`) keeps a fresh clone runnable. Verified per commit message,
both directions, with user secrets cleared so the file was the only source: an upload landed
in R2 (17,615 bytes, nothing in `wwwroot/images`); with the file moved aside, the same upload
fell back to `wwwroot/images` and no object appeared in the bucket. Not re-run in this pass.

### Status now

The original note's "upload path not yet driven through the UI" gap is closed — per the
`676d787` commit message, a real upload was confirmed end to end (object in R2 at 17,615
bytes, DB row correct). The three commits above were verified by the agent doing the work,
each documented in its own commit message with concrete request/response evidence; this
update pass corroborated the code changes and citations against the repo but did not re-run
the upload/R2/proxy checks itself.

Remaining known gaps (from the `676d787`/`fc94594` commit context, not independently
verified beyond reading the code — no code exists yet to address either):
- Replacing an avatar orphans the previous R2 object; nothing in `R2AvatarWriter.cs` or
  `AvatarsController.cs` deletes the old one on a new upload. Negligible at ~17 kB each but it
  accumulates.
- No .NET test project exists in the solution (confirmed: `WebChat.sln` lists six projects,
  none a test project) — all backend verification across this body of work was curl/console
  tools, not committed tests.

## Update — 2026-08-09

**The `no-store` on the redirect, and the freshly-signed-URL-per-request design described
above, are no longer what the code does.** Both are superseded by
[2026-08-09-stable-avatar-urls.md](2026-08-09-stable-avatar-urls.md) (issue #46).

The reasoning recorded here for `no-store` — that a cached 302 could outlive the signature it
points at — is sound in isolation, but the consequence was not measured at the time: because
each request answered with a *newly signed* URL, the browser could never match the image in
its cache either, so every avatar was downloaded once per render. One signed URL is now reused
for a five-minute window, and the redirect carries `private, max-age=300`.
