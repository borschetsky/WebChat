# Cloudflare R2 avatar storage behind presigned redirects

- **Date:** 2026-08-03
- **Type:** change
- **Scope:** `WebChat/WebChat.AvatarWriter/*`, `WebChat/WebChat/Controllers/AvatarsController.cs`,
  `WebChat/WebChat/Startup.cs`, `WebChat/WebChat/appsettings.json`
- **Status:** done (storage layer + read path verified; upload path not driven through the UI)

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
- Upload-via-UI is the one remaining gap before calling this feature fully exercised (see
  Verified above).
- **Incidental, unrelated finding from this session's diagnosis work:** `GET /api/threads` and
  `GET /api/Thread` both fall through MVC routing to the SPA dev-server proxy (500/502 when
  Vite isn't running). `ThreadController` is routed `api/[controller]`
  (`WebChat/WebChat/Controllers/ThreadController.cs:12`) and only declares
  `getmessages/{id}` (line 27) and `search` (line 62) — there is no parameterless `GET`
  action, so a bare `GET /api/Thread` was never going to be handled by MVC. This is
  pre-existing (confirmed present as far back as commit `f5bf97a`) and unrelated to the R2
  change; noted here because it cost time during diagnosis and will likely confuse the next
  person too.
