# ImageSharp advisories: TIFF made unreachable instead of upgrading; MailKit bumped

- **Date:** 2026-11-02
- **Type:** change
- **Scope:** `WebChat/WebChat.AvatarWriter/AvatarImageProcessor.cs`, `WebChat/Directory.Build.props`,
  `WebChat/WebChat.Services/WebChat.Services.csproj`, `WebChat/WebChat.Tests/Avatars/AvatarFormatTests.cs`
- **Status:** done (code); not yet deployed

## Context
CI's `api` job (`dotnet build -warnaserror`) started failing on every branch, master included,
with NuGet audit errors NU1902/NU1903: six advisories against `SixLabors.ImageSharp` 3.1.12
(published 2026-10-07) and two against `System.Security.Cryptography.Pkcs` 10.0.0. NuGet audit
reads advisories live, so no commit caused it. It surfaced on #110 (Swagger gating).

## What I found
- **Pkcs** comes in through MailKit 4.17.0 → MimeKit 4.17.0. MailKit 4.18.2 → MimeKit 4.18.2
  pins Pkcs 10.0.13, the first patched version. Plain bump.
- **ImageSharp**: every fix is in 3.2.0 / 4.1.2+. **3.2.0 now refuses to build in Release
  without a Six Labors license key** (`SixLabors.ImageSharp.targets`, `ValidateLicenseTask`;
  Debug only warns, so a local Debug build hides it). The project qualifies for the free Apache
  terms of the Split License, but the key check applies regardless. There is no 3.1.13.
- **The TIFF bugs were reachable in production.** `WriteHelper.GetImageFormat` accepts TIFF
  magic bytes, and `Image.LoadAsync` used the default configuration, which decodes TIFF. So any
  signed-in user could reach the tiled-fax TIFF heap out-of-bounds write (GHSA-v76p-62qx-wwq2)
  and the BigTIFF non-terminating loop (GHSA-wmxv-xphr-5c9g) through an avatar upload. A test
  encoding a real TIFF confirmed it was accepted before the fix.
- The other four are not reachable: the TIFF CCITT T4/T6 *encoders* (we only encode JPEG/PNG),
  `HistogramEqualization` (never called), and the ICC CLUT allocation, which in 3.x is reached
  only through the public lazy `IccProfile.Entries` accessor (never called) — the advisory says
  the automatic decode path exists only in 4.x.

## What changed
- `AvatarImageProcessor.DecoderOptions`: a `Configuration` with only the JPEG, PNG, GIF and BMP
  modules, passed to both `IdentifyAsync` and `LoadAsync`. TIFF is also rejected right after
  the magic-byte gate with "TIFF images are not supported. Use JPEG, PNG, GIF or BMP."
- `WebChat/Directory.Build.props` (new): `NuGetAuditSuppress` for the six ImageSharp advisories,
  with the reasons. Pkcs is fixed, not suppressed.
- MailKit 4.17.0 → 4.18.2.
- `AvatarFormatTests`: TIFF rejected; the decoder configuration has no TIFF format; JPEG, PNG,
  GIF and BMP still accepted; EXIF orientation still applied; a source scan failing if
  production code mentions `HistogramEqualization`, `IccProfile`, `TiffEncoder`, `SaveAsTiff`
  or `TiffConfigurationModule`.
- CLAUDE.md gains one bullet (the pin and how to treat the next advisory); ORIENTATION trap 6
  corrected (it said only 4.0 needed a key).

## Decisions and trade-offs
- **Suppress-and-make-unreachable over buying/registering a key.** Owner's choice. Upgrading
  would need the key in CI, the Docker build and App Platform. Revisit if ImageSharp ships a
  3.1.x patch, or if a key is obtained — then delete the suppressions.
- **Metadata still decoded** (`SkipMetadata` not used): it would drop the EXIF orientation flag
  `AutoOrient` needs, rotating every portrait photo. Not needed for ICC in 3.x (see above).
- **BMP kept**: it was accepted before and has no advisory; removing it would be a behaviour
  change with no security reason. WebP was never accepted (the magic-byte gate does not know it).
- The scan test strips `//` lines so doc comments may name the forbidden APIs.

## Verified
- New tests seen failing first (TIFF accepted; default config contains TIFF), then passing.
- Scan test seen failing against a probe file containing `HistogramEqualization`.
- `dotnet build WebChat.sln -c Release --no-incremental -warnaserror`: 0 warnings, 0 errors.
- `dotnet test WebChat.Tests`: 395 passed, 2 skipped.
- **Not verified:** production. Ship with `doctl apps create-deployment`.

## Known issues / follow-ups
- The client's avatar input is `accept="image/*"`, so a TIFF can still be picked; the server's
  message is what the user sees.
- Any future ImageSharp advisory fails CI again; handle it the same way (CLAUDE.md).
