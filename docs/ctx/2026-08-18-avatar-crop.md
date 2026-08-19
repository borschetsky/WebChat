# Crop an avatar before uploading it

- **Date:** 2026-08-18
- **Type:** change
- **Scope:** `ClientApp/src/features/settings/cropImage.ts`, `AvatarCropDialog.tsx`,
  `SettingsDrawer.jsx`, `cropImage.test.ts`, `src/test/avatar-crop.test.tsx`,
  `src/test/avatar-crop-flow.test.tsx`, `ClientApp/package.json`
- **Status:** done

## Context

Issue #84, branch `feature/84-avatar-crop`, commit `f265544`, PR #90.

Picking a profile photo *was* the upload: the file went straight to
`ChatApp.handleUploadAvatar` and the server centre-cropped whatever arrived. There was no
moment at which anyone could frame the picture or decline it.

Two prior investigations fed this. `docs/research/2026-08-11-avatar-crop-library.md` chose
`react-easy-crop` and the client-side design; the owner's design handoff, written
independently, specifies the same library — so the choice is doubly grounded.

## What changed

`react-easy-crop` 6.2.3 behind `React.lazy`, built to the handoff: 384 px dialog, 320 px stage,
280 px circle, zoom slider 1–3 step 0.05, rule-of-thirds grid.

- **`cropImage.ts`** — `sourceRectFor` is the pure geometry; `cropToFile` decodes with
  `createImageBitmap`, mattes the canvas white, does one `drawImage` with a source rect, and
  encodes JPEG q0.92, falling back to PNG if the first four bytes are not what the server
  accepts.
- **`AvatarCropDialog.tsx`** — the dialog. The ring, dimmed surround and thirds grid all come
  from the library restyled to the handoff's numbers; drawing them on top as well would have
  produced two of each a half-pixel apart.
- **`SettingsDrawer.jsx`** — picking a file sets local state and lazy-mounts the dialog, keyed
  on the file, instead of uploading immediately.

**Remove is deliberately absent.** The handoff draws it, but nothing in the API can clear an
avatar — `AvatarsController` has only `upload` plus the read redirect, `IUserService` has
`AddAvatar` and no counterpart, `UpdateProfile` writes only `Email` and `Username`. A test pins
its absence so the button cannot arrive before the endpoint. Filed as #89.

## Decisions and trade-offs

1. **Crop client-side, upload the result — zero server change.** `handleUploadAvatar` already
   builds `FormData` from whatever it is handed and the server reads `form.Files[0]`, so a
   cropped `Blob` wrapped in a `File` drops in. Storing the original with crop metadata and
   re-deriving would mean writing to a stable per-user key, and the memoised presigned URL is
   safe *only* because every upload writes a fresh `{Guid}.{ext}`
   (`docs/ctx/2026-08-09-stable-avatar-urls.md`) — the old picture would keep being served,
   most visibly to the person who just re-cropped it. **Superseded for future work:** the
   2026-08-16 handoff mandates storing the original plus crop parameters server-side so
   "Adjust crop" does not force a re-upload. See #88, and note that
   `docs/research/2026-08-15-avatar-recrop-and-original-storage.md` recommends the opposite —
   the design overrides it.
2. **JPEG with a PNG fallback, gated on the server's own rule.** The server accepts only
   `FF D8 FF E0/E1`; a legitimate JPEG can start `FF D8 FF DB`. Chrome emits `E0`, so the JPEG
   branch runs — confirmed in a browser, and it matters because the server keeps a PNG as a PNG
   (`keepAlpha`), storing ~87 kB where JPEG stores ~9.4 kB.
3. **`React.lazy`, because `vite.config.ts` groups vendors with `tags: ['$initial']`** — a
   component reachable only from the settings drawer cannot be hoisted into `vendor-mui` and
   lands whole in whatever imports it. 15.50 kB gzip, fetched only when a photo is picked.
4. **If a crop rect is ever persisted, persist percentages, not source pixels.** The handoff
   and the research reach this independently: pixels are rounded and drift the crop on restore.

## Four defects found after the implementation reported done

This is the part worth reading.

1. **The feature was not wired in at all.** `SettingsDrawer.jsx` was byte-identical to `HEAD`;
   nothing outside tests imported the dialog, so it was unreachable from a browser, and
   `avatar-crop-flow.test.tsx` was 7/7 failing. The edit had existed — a browser pass had
   driven the real flow successfully — and was lost when `git reset --hard origin/master` was
   run on `master` to move an unrelated docs commit onto a branch. That discards modifications
   to **tracked** files while leaving new **untracked** files intact, so the branch still looked
   complete and the loss read as "the implementer forgot the wiring". **`git reset --hard` in a
   clone where other work is uncommitted destroys exactly half of it, and the surviving half
   disguises the damage.**
2. **A transparent PNG exported as a black square.** The canvas was never filled before
   `drawImage`, and JPEG has no alpha, so alpha-0 pixels encoded as pure black — and the server
   made it permanent. A regression: the pre-#84 path posted the PNG untouched. Fixed with a
   white matte, guarded by a test asserting fill-**before**-draw ordering, because a fill
   afterwards would erase the photo. Proven failing first.
3. **`objectFit` left at the library default while `cropSize` pinned the circle to 280 px.** A
   non-square photo at zoom 1 then does not cover the circle, and the exported square is
   anchored at the clamped edge rather than at what the circle showed — a 1200×400 banner
   exported its left third. Fixed with `objectFit="cover"`. **The browser pass could not have
   caught it: the fixture was a square 600×600 colour grid, and a square source cannot exhibit
   the bug.** A fixture chosen for one property (a verifiable crop region) silently guaranteed
   another (squareness) that suppressed a whole class of defect.
4. **The dialog had no accessible name.** MUI generates `aria-labelledby` for `Dialog` and
   expects `DialogTitle` to carry the id; this dialog draws its own `h2` to hit the handoff's
   sizing, so the attribute pointed at an id nothing had. Found by *resolving* the attribute in
   a browser rather than asserting its presence. The test queries by role **and name** —
   asserting the heading text passes either way, which is why it went unseen.

Also fixed while restoring the wiring: `aria-label="Change profile photo"` sat on the
`IconButton` (a `component="label"`), which names the label and leaves the control unnamed.
Moved onto the input.

## Verified

- `npm run verify` — lint, `format:check`, typecheck, **223 tests across 19 files**, build. Green.
- `AvatarCropDialog` is its own chunk, 49.28 kB / **15.50 kB gzip**; the render-blocking payload
  is unchanged.
- **In a browser**, against the local compose stack: stage measured 320 px and circle 280 px,
  ring `2px rgba(255,255,255,.85)`, dim `.55`, thirds grid at `.35`; an off-centre framing
  round-trips to the stored avatar; the stored object is `.jpg`; cancel closes with no upload
  and leaves the avatar untouched; re-picking the same file reopens the dialog; dark mode
  correct; no console errors; the dialog announces as "Crop your photo".

**Not verified:** narrow viewport (the resize tool moved the OS window but the tab kept
reporting 2048 px), a real EXIF-rotated phone photo, Firefox and Safari, pinch on a touch
device, and the `objectFit` fix in a browser — that one is covered only by the prop assertion.

## Known issues / follow-ups

- **#89 — remove avatar.** No endpoint can clear one. The 2026-08-16 handoff specifies a menu
  (Upload a new photo / Adjust crop / Remove photo) and removal with **no confirm** but a
  working **Undo** restoring the photo *and* its crop, which means removal cannot be an
  immediate irreversible delete.
- **#88 — re-crop without re-picking.** Requires storing the original; see the reversal noted
  in decision 1. Open question flagged there: if originals are stored, are they reachable over
  the anonymous `/images/{name}` path? That would make the part of a photo a user deliberately
  cropped out publicly fetchable.
- **#20** — replacing an avatar orphans the previous R2 object; storing originals would orphan
  two per replacement.
- Two environment traps live in `CLAUDE.md` and `ORIENTATION.md` rather than here: adding a
  client dependency needs `docker compose up --renew-anon-volumes`, and the container's Vite
  watcher never sees host edits (no `server.watch.usePolling`), so the browser can run code that
  no longer exists on disk — which produced one confident, wrong conclusion during this work.
