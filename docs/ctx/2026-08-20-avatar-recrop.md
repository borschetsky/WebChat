# Re-cropping an avatar, and the two objects behind it

- **Date:** 2026-08-20
- **Type:** change
- **Scope:** `WebChat.AvatarWriter/*`, `WebChat.Data/User.cs` + `AvatarCropViewModel`,
  `WebChat.Services/{IUserService,UserService,MappingService}`, `Controllers/AvatarsController.cs`,
  `Startup.cs`, migration `20260819210436_AddAvatarOriginalAndCrop`,
  `ClientApp/src/features/settings/*`, `services/{adapters,api-service,index}`,
  `types/{dto,models}`, `app/ChatApp.jsx`, `WebChat.Tests/Avatars/*`
- **Status:** done

## Context

Issue #88, with **#20 folded in**, branch `feature/88-recrop-avatar`. Follows
[the avatar crop](2026-08-18-avatar-crop.md) (#84) and [the phone fix](2026-08-19-mobile-crop-dialog.md) (#92).

#84 baked the crop in and discarded the original, so adjusting a crop meant picking the file
again. The 2026-08-16 handoff specifies a menu under the avatar — Upload a new photo / Adjust
crop / Remove photo — and states the storage rule outright: *"Store the original uploaded
image + crop parameters server-side, never just the baked avatar output — otherwise 'Adjust
crop' degrades into forced re-upload."*

**This reverses `docs/research/2026-08-15-avatar-recrop-and-original-storage.md`**, which
recommended keeping the original client-side for the session and *not* storing one in R2. The
handoff overrides it, on the owner's explicit call. The note is now partly superseded and says
so; it is still the authority on the storage maths, which is what made the reversal cheap
(an original at 1024px is ~17 kB measured).

Remove photo is **#89** and is not here — the menu ships the two items that have endpoints,
the same way #84 shipped no Remove button.

## What changed

**Two objects, two delete rules.** `AvatarStorage` is the one place that knows key shape:
the crop stays a bare `{guid}.{ext}` on the anonymous path, the original becomes
`originals/{guid}.{ext}`. `IAvatarOriginalStore` (R2 and local implementations) returns
**bytes**, not a presigned URL — a URL is a capability that outlives the ownership check, and
the client needs a `File` for the cropper anyway. The local implementation writes *beside*
`wwwroot`, not inside it, because a directory under `wwwroot` would be served by
`UseStaticFiles` and silently undo the whole decision.

`User` gains `AvatarOriginalFileName` and `AvatarCropX/Y/Width/Height` (`double?`), all
nullable with **no backfill**. `ProfileViewModel` sends `HasOriginalPhoto` and `AvatarCrop`;
**the original's key is never sent to the client.** `IUserService.AddAvatar` becomes
`SetAvatar`/`SetAvatarCrop`, returning the keys the write surrendered so the controller can
delete them after commit.

The rule, which is also #20's fix: **uploading a new photo deletes the old crop and the old
original; re-cropping deletes the old crop and keeps the original.** Best-effort, logged,
never thrown, and only after the new object is committed — there is no reverse index from
object to user, so a stray delete is unrecoverable.

## Decisions worth knowing

1. **Originals are owner-only**, per the owner's call. `GetImage` presigns whatever key it is
   handed, so a prefix guard inside it is the entirety of that protection — hence a test that
   the anonymous path cannot reach an original, including `%`-escaped spellings, which is
   where the first attempt leaked.
2. **Two endpoints, not one flag.** `recrop` is separate from `upload` because they differ in
   what they delete; inferring it from "no original attached" would let a forgetful client
   keep an original belonging to a replaced photo.
3. **Crop as four columns and four form fields**, not JSON — no serializer dependency and no
   undocumented blob, parsed invariant-culture.
4. **`OriginalMaxDimension = 1024`**, not 512: the point of keeping an original is crop
   headroom. ~17 kB measured.
5. **The menu appears only when Adjust crop is actually available.** With Remove out and no
   original on any pre-#88 account, a photo-but-no-original user would otherwise get a
   one-item menu in front of the file picker. **Pre-#88 accounts therefore see no Adjust until
   they next upload** — deliberate: seeding the "original" from the already-cropped avatar
   would offer adjustment inside pixels that are gone.
6. **Percentages, not pixels** — `croppedAreaPixels` for the export, `croppedArea` for
   restoration. Pixels are rounded and drift. The handoff and the research note reached this
   independently, which is the whole reason the next section is about drift anyway.

## The defect the browser found, and jsdom could not

The feature passed every test and worked on screen. Then: **open Adjust crop, touch nothing,
press Save — and the stored rectangle changes.** Repeat and it changes again.

```
900x1200 source, original stored 768x1024
  after upload:       w 83.333
  untouched save #1:  w 62.500
  untouched save #2:  w 46.875
```

Each is the previous divided by **1.3333 — exactly the source's height/width**. Every adjust
zoomed the avatar in by the image's aspect ratio, so a face crept tighter each time the dialog
was opened. What was drawn was right; what was *written* was tighter than what was drawn.

**A confound nearly produced the wrong mechanism.** A 1000x1000 square round-tripped stably,
which looked like proof that aspect ratio was the cause — but that fixture was also under
`OriginalMaxDimension` and so was never downscaled. A **1400x1400** square, which *is*
downscaled to 1024, is also stable. That separates the two: downscaling is innocent, aspect
ratio is the cause. Without the second control the note would have blamed `downscaleToFile`.

**The cause is an ordering bug in `react-easy-crop@6.2.3`**, read out of its source rather
than inferred:

- `onMediaLoad` calls `computeSizes()` and *then* `setInitialCrop()` (`index.module.mjs:309`,
  `:313`).
- `computeSizes` chooses the rendered media size from `this.state.mediaObjectFit`, which is
  initialised `void 0` (`:276`) and only ever assigned in `componentDidUpdate` (`:670`). Its
  switch has `default:` falling straight into `case "contain"` (`:341`).
- So the load that applies the initial crop computes zoom against the **contain** width. A
  beat later the fit resolves to `horizontal-cover`, the media is re-measured — and the
  initial crop is never re-applied.
- The render path at `:717` uses `?? this.getObjectFit()`. `computeSizes` has no such
  fallback. That inconsistency is the bug.

For a 3:4 photo in a square stage: cover width 320 vs contain width 240 → 1.3333. The model
reproduces all the observed digits, not approximately.

**`objectFit="cover"` is innocent and stays** — removing it would reintroduce #84's bug where
a 1200x400 banner exported its left third.

The fix stops passing `initialCroppedAreaPercentages`, takes `onMediaLoaded` instead, and
applies the restore itself through the library's own public
`getInitialCropFromCroppedAreaPercentages`, supplying the media size the library *actually*
renders at (`coverMediaSizeFor`) and the crop size from `cropSizeFor(stageSide)` — so the
restore is correct on a phone, where the circle is not 280. A once-guard means a later
re-measure (rotation, breakpoint flip) does not discard the user's own adjustment.

## Verified

Re-run independently of the implementing agent, not relayed:

- `dotnet build WebChat.sln --no-incremental -warnaserror` — **0 warnings**;
  `dotnet test WebChat.Tests` — **292 passed, 2 skipped, 294 total**.
- `npm run verify` — **271 tests across 20 files** (was 258). `AvatarCropDialog` 51.67 kB /
  **16.22 kB gzip**.
- Migration applied to real PostgreSQL; all six `Avatar*` columns present.
- **In a browser at a 390 px viewport**, against the compose stack with real R2:
  no photo goes straight to the picker with no menu; photo + original gives a menu of exactly
  "Upload a new photo" and "Adjust crop"; Adjust reopens on the **original** (768x1024, not
  the 256 px avatar); every save rotates `AvatarFileName` while `AvatarOriginalFileName` holds.
- **Round-trip fixed point**, which is the thing that was broken: portrait 900x1200 stable at
  `{6.25, 17.1875, 87.5, 65.625}` across three untouched adjust-and-save cycles; landscape
  1600x900 stable at `{25.390625, 6.25, 49.21875, 87.5}` across two. Both `cover` branches —
  `horizontal-cover` and `vertical-cover` are separate code paths, and the portrait fixture
  alone only exercises one.
- No console errors or warnings through a full adjust cycle (captured inside the frame; the
  console tool reads the top document, not the iframe).
- #92 not regressed: `fullScreen` true, stage 320 square, circle 280 fitting.

## Not verified

A real phone or touch device — pinch is untested. Firefox and Safari. A real EXIF-rotated
photo through the downscale path. The 263.2 px narrow-stage restore is covered by a unit test
but has never been seen in a browser, because the phone stage measures 320 at every viewport
the fix produces.

## Found and not fixed

- **`UsersController.UpdateProfile` broadcasts the client-supplied `ProfileViewModel` to
  `Clients.All`, including `Email`** — so every connected client receives any user's email
  address on a profile save. Pre-existing, untouched by this change, surfaced by the
  implementing agent. Filed separately.
- Orphans created before the #20 fix are still in the bucket; the research note recommends a
  one-off sweep.
- Test residue in the local compose database and a handful of small objects in the shared R2
  bucket.

## The lesson, which is the same one twice

#84 shipped an `objectFit` bug its square test fixture **structurally could not exhibit**.
Here the mirror image: a square fixture round-trips perfectly under the broken code, so a
square fixture would have hidden this too. The regression test now uses a non-square fixture
with a comment saying why, and keeps the square case explicitly as the control that makes the
other two mean something.
