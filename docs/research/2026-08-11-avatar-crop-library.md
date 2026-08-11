# Which library should crop an avatar inside a circle, and should the crop be baked in or stored as metadata?

- **Date:** 2026-08-11 (all package facts verified on this date; they rot — see *Verified how*)
- **Status:** answered
- **Question:** which client-side cropper WebChat should use for pan/zoom/confirm inside a circle, and whether the crop is applied client-side before upload or stored as metadata and applied later
- **Recommendation:** **`react-easy-crop` 6.2.3, cropping client-side and uploading the resulting Blob** — no server change, no schema change, and it is the only candidate that ships the interaction the question describes (pan + pinch-zoom of the image inside a fixed round window) *and* renders clean under React 19.2.8 in jsdom with zero test-environment stubs.

## The short answer

Use **`react-easy-crop` 6.2.3** (MIT, published 2026-07-24) with `cropShape="round"`, `aspect={1}`, `restrictPosition`, and export via a ~30-line `<canvas>` helper you copy from its docs. Cost measured locally: **+7.2 kB gzip** over a React baseline, one transitive dep (`normalize-wheel`), styles auto-injected so nothing new enters the CSS pipeline. Put the whole dialog behind `React.lazy` — it is only reachable from the settings drawer, and the bundle-splitting work of #19 already established that pattern.

Take **design 1: crop client-side, upload the result.** `ChatApp.handleUploadAvatar` already builds a `FormData` from whatever it is handed (`ClientApp/src/app/ChatApp.jsx:282-292`), so a cropped `Blob` wrapped in a `File` drops in with **zero server change**. Design 2 (store the original, store crop metadata) is not merely more work — it directly contradicts an invariant this repo wrote down eleven days ago and depends on for correctness. See *What decides it*.

Runner-up: **`react-avatar-editor` 15.1.0** — smaller (+3.5 kB gz), zero deps, ships the canvas export and HiDPI scaling in-package, and its own devDependencies are `react@19.2.4` / `vite@8` / `vitest@4`, i.e. literally our stack. It loses on one released fact: **the published build has no pinch-to-zoom.**

## What decides it

**Two facts, one per half of the question.**

**Library half — the interaction model, not the peer range.** All six candidates install against `react@19.2.8` without ERESOLVE (verified by real `npm install`, no `--legacy-peer-deps`), so React 19 compatibility does not separate them the way you expected. What separates them is *what the user does with their fingers*:

- `react-easy-crop` and `cropperjs` v2 move the **image** behind a fixed crop window (the avatar model).
- `react-image-crop` moves a **selection rectangle** over a fixed image. It has `circularCrop`, but no zoom of the underlying image at all — there is no `scale` or `zoom` prop on the component (verified in `dist/index.d.ts`, the full prop list is 20 props and none of them zoom). On a phone that means dragging a small circle with resize handles rather than pinching. Wrong model, and the `@media (pointer: coarse)` block in its CSS that hides four of the eight drag handles is the library conceding as much.
- `react-avatar-editor` is the avatar model but **single-touch only** — its build reads `e.targetTouches[0]` and nothing else; there is no two-finger distance maths anywhere in `dist/index.mjs`. Zoom comes from an external slider you render yourself. Pinch-to-zoom and wheel zoom were merged as PR #434 on **2026-04-01**, which is *after* the 15.1.0 release on **2026-03-21**, and no release has followed. So the feature exists on `main` and does not exist in anything npm will give you today.

`react-easy-crop` has the two-finger maths (`getDistanceBetweenPoints`, `touches[1]`, `touches.length`), Safari trackpad `gesturestart`, and wheel normalisation — that last one is the entire reason for its single dependency.

**Architecture half — issue #46's invariant.** [`docs/ctx/2026-08-09-stable-avatar-urls.md`](../ctx/2026-08-09-stable-avatar-urls.md) memoises the R2 presigned URL for a 30-minute window and serves it with `Cache-Control: private, max-age=300`. That note states the safety condition in as many words: it is safe *"only because every upload writes a fresh `{Guid}.{ext}` — a filename's bytes never change, so replacing an avatar is a guaranteed miss rather than a stale hit; **it would be wrong against stable per-user filenames**."* `R2AvatarWriter.cs:45` is where that guarantee lives (`var fileName = $"{Guid.NewGuid()}.{image.Extension}"`).

Design 2, in the form where a re-crop re-renders into the same object key, is exactly the "stable per-user filename" case the note rules out. Both the memoised signed URL *and* the browser's own 5-minute cache would keep serving the old picture, and — worse — the failure is invisible to the person who just re-cropped, because their own browser has the stale copy. Design 1 is cache-correct by construction: new crop → new upload → new Guid → guaranteed miss.

You can have a version of design 2 that is cache-correct (store the original as one object, write each derived crop to a *new* Guid, keep the crop rect for a future re-edit), but notice what it has become: design 1 plus an extra stored object, plus a schema change, plus [issue #20](https://github.com/borschetsky/WebChat/issues/20) ("Replacing an avatar orphans the previous R2 object") now orphaning two objects per replacement instead of one. It buys exactly one user-visible thing — re-crop without re-picking the file — against a 10 GB free tier that `AvatarOptions.cs` already reasons about in units of "3,500 avatars vs 200,000".

**EXIF is not a differentiator, because both ends already handle it.** `AvatarImageProcessor.Process` calls `x.AutoOrient()` before resizing and then nulls the EXIF/IPTC/XMP profiles (`AvatarImageProcessor.cs:78-98`) — verified in the repo, not assumed. On the client, `image-orientation` has an initial value of `from-image` (CSS Images 3, Baseline since April 2020), so an `<img>` preview is already rotated correctly, and `createImageBitmap` defaults `imageOrientation` to `from-image` too. The gap: **`drawImage` of an `HTMLImageElement` is formally unspecified** on this point — [whatwg/html#10492](https://github.com/whatwg/html/issues/10492) and [w3c/csswg-drafts#4666](https://github.com/w3c/csswg-drafts/issues/4666) are both still open — even though all three engines respect EXIF in practice. If you want it airtight rather than de-facto, decode with `createImageBitmap(file)` and draw the bitmap; then preview and export cannot disagree, and it is one line different from the `new Image()` the docs helper uses.

## Options

Sizes below are **measured**, not looked up: esbuild 0.28.2, `--bundle --minify`, `NODE_ENV=production`, gzip level 9, as a delta over a `react@19.2.8` + `react-dom@19.2.8` baseline of 60,197 B gz. Downloads are npm's `last-week` API for 2026-08-03..2026-08-09. Open-issue counts include PRs (GitHub API `open_issues_count`).

### 1. `react-easy-crop` 6.2.3 — recommended

| | |
|---|---|
| Licence | MIT (LICENSE file present) |
| Published | 2026-07-24 |
| Peer deps | `react >=16.4.0`, `react-dom >=16.4.0` — no ERESOLVE on 19.2.8 |
| Downloads | 2,924,258 / wk |
| Repo | 2,768 ★, 5 open issues+PRs, pushed 2026-07-24 |
| Size | **+7.2 kB gz** (+25.9 kB raw, +6.4 kB brotli); styles auto-injected (1,578 B CSS), no CSS import needed |
| Deps | `normalize-wheel@^1.0.1` |
| Types | first-party `index.d.ts`, fully typed, no `any` needed at the call site |
| Circle | `cropShape="round"` — first-class |
| Touch | pan, **pinch**, Safari trackpad gestures, wheel, keyboard (`keyboardStep`) |

**Ongoing cost / what it does not do:** it never produces an image. It gives you `croppedAreaPixels` in `onCropComplete` and you write the canvas export. The canonical helper is `docs/src/components/cropImage.ts` in its repo — 67 lines, but it imports `getRadianAngle` and `rotateSize` from `src/helpers`, and **neither is exported from the package** (the public exports are `Cropper`, the types, and `getInitialCropFromCroppedAreaPercentages` / `getInitialCropFromCroppedAreaPixels`). Drop rotation, which an avatar crop does not need, and the helper collapses to roughly 30 lines: decode, one `drawImage` with a source rect, `toBlob`.

**Verified under our stack:** rendered with `cropShape="round"` under React 19.2.8 in jsdom 30.0.1 via vitest 4.1.10 — passes, no throw, no stub. It guards `ResizeObserver` (`typeof window.ResizeObserver === "undefined"` → falls back to a `resize` listener), which is why it needs nothing added to `src/test/setup.ts`. It is a class component; the only React-19-removed API anywhere near it is `defaultProps`, which remains supported on class components.

**What it rules out later:** nothing. It is a leaf dependency behind one dialog. Removing it costs deleting one component.

### 2. `react-avatar-editor` 15.1.0 — runner-up

| | |
|---|---|
| Licence | MIT (`package.json`; no LICENSE file in the tarball) |
| Published | 2026-03-21 |
| Peer deps | explicitly `^19.0.0` — the only candidate that names React 19 |
| Downloads | 682,716 / wk |
| Repo | 2,500 ★, 7 open, pushed 2026-04-22 |
| Size | **+3.5 kB gz** — the smallest |
| Deps | none |
| Types | first-party, includes a `useAvatarEditor()` hook returning a typed ref |
| Circle | `borderRadius` — it is an avatar editor, this is its purpose |
| Output | **built in**: `getImage()` / `getImageScaledToCanvas()` return an `HTMLCanvasElement`; handles `devicePixelRatio` |

Its devDependencies are `react@^19.2.4`, `@types/react@^19.2.14`, `vite@^8.0.1`, `vitest@^4.1.0`, `@testing-library/react@^16.3.2` — the strongest React 19 evidence of any candidate, and an unusually exact match to this repo.

**Two costs, and the first is the disqualifier:**

1. **No pinch-zoom in the published build.** Confirmed twice: no multi-touch maths in `dist/index.mjs`, and PR #434 merged 2026-04-01 with no release since. You would ship a slider-only zoom on mobile.
2. **It cannot render in jsdom.** Its effect calls `getContext('2d')` and throws `Error: No context found, please report this to: .../issues` when it returns null — reproduced here under jsdom 30.0.1. Any component test touching the avatar dialog would need a `HTMLCanvasElement.prototype.getContext` stub in `src/test/setup.ts` (there is precedent — `matchMedia` and `scrollIntoView` are already stubbed there) or a module mock. Small, but it is a cost `react-easy-crop` does not have.

**What would make it right:** a release containing #434. Then it is smaller, dependency-free, deletes the export helper, and the jsdom stub is four lines. That is the flip condition.

### 3. `react-image-crop` 11.1.2 — ruled out on interaction model

ISC (permissive), published 2026-06-21, 2,326,588 dl/wk, 4,104 ★ but **72 open issues+PRs**. +3.7 kB gz plus a mandatory CSS import (4,791 B raw / 1,113 B gz). Renders fine under React 19.2.8 in jsdom — verified. 11.1.0 (2026-06-21) newly added `cropToCanvas()` and `cropToImg()` helpers, so the old "it does not crop, it only gives you coordinates" caveat no longer holds.

It is ruled out anyway: no image zoom, so no pinch. It is the right library for "select a region of a photo", not for "fit my face in this circle".

### 4. `cropperjs` 2.1.1 + a hand-written React wrapper — ruled out on effort

MIT (verified in the tarball's LICENSE — **no commercial tier, no sponsorship gate; the licensing worry does not apply to v2**). 13,863 ★, 1,655,839 dl/wk, pushed 2026-07-26. +11.1 kB gz.

v2 is a set of Web Components (`CropperCanvas`, `CropperImage`, `CropperSelection`, `CropperShade`, `CropperHandle`, …), and `<cropper-image>` is translatable/scalable, so the avatar interaction *is* expressible. React 19 is in fact the first React that handles custom elements properly — [the 19 release notes](https://react.dev/blog/2024/12/05/react-19) say it "passes all tests on Custom Elements Everywhere". But:

- **There is no v2 React wrapper.** `react-cropper` 2.3.3 was last published **2023-04-12** and depends on `cropperjs@^1.5.13`; its repo was last pushed 2023-09-11. It is a v1 wrapper and will not be a v2 one.
- **No built-in circular selection.** Grepping `@cropper/elements` for `border-radius`/`circle` finds nothing; you supply the CSS.

So it is the largest option, and the one where you write the most code, to reach the same place.

### 5. `react-advanced-cropper` 0.20.1 — ruled out on size and staleness

MIT, but **+24.1 kB gz plus a 12.6 kB stylesheet** — three times `react-easy-crop` — for a `CircleStencil` that `cropShape="round"` gives you free. Last published 2025-03-01; 145,244 dl/wk. GitHub reports its licence as `NOASSERTION` because the repo's LICENSE covers code as MIT but reserves the documentation content; the npm package is MIT. Not a blocker, just noise.

### 6. MUI — confirmed absent

Checked, not assumed. [mui.com/x](https://mui.com/x/) lists Data Grid, Date and Time Pickers, Charts and Tree View, with Scheduler and Chat in preview. No image editor, no cropper, in either `@mui/material` or `@mui/x-*`. Nothing to wait for.

### 7. Commercial / heavyweight, listed so they are not rediscovered

- **`@pqina/pintura` 8.99.0** — `"license": "https://pqina.nl/pintura/license"`. Commercial. Rules itself out on the permissive-licence constraint.
- **`react-filerobot-image-editor` 5.0.0-beta.159** — MIT, but peer-depends on `react-konva` **and `styled-components >=5.3.5`**. That is a second CSS-in-JS runtime alongside the Emotion that MUI v9 uses, plus a canvas framework, and v5 has been in beta for months (34,312 dl/wk). Rules itself out on bundle and on the dependency constraint.

### 8. Bespoke component — honest sizing

The naive version really is small: an `<img>` with `transform: translate(x,y) scale(z)` inside an `overflow: hidden; border-radius: 50%` box, a MUI `Slider`, pointer-event drag, and a `toBlob` export. Call it **120–150 lines** and half a day, and it will look right on a desktop with a mouse.

What you will then spend the rest of the week on is what `react-easy-crop` spends **31.4 kB of `Cropper.tsx` (~900 lines) and 8.5 kB of `helpers.ts`, with 13.6 kB of tests for the helpers alone** on:

- **Pinch.** Two-pointer distance, and zooming about the *midpoint between the fingers* rather than the element centre, or the image lurches away from where the user is pinching.
- **Second finger mid-drag.** PR #434's own summary calls this out as the edge case: transitioning pan → pinch without a jump.
- **Wheel normalisation.** Deltas differ by browser, OS, and device (mouse wheel vs. trackpad); this is the whole reason `normalize-wheel` is a dependency. Safari trackpad pinch arrives as non-standard `gesturestart`/`gesturechange`, not as wheel.
- **Bounds clamping.** Keeping the crop circle covered when zoom changes means re-clamping the translation *and* deriving `minZoom` from the image's aspect ratio, and it has to hold at every intermediate frame of a pinch, not just at rest.
- **Transform → source rect.** Turning CSS pixels into source-image pixels through `object-fit: contain` letterboxing, the container's own size, and `devicePixelRatio`.
- **`touch-action: none`** on the right element, or mobile Safari scrolls the page instead.

None of this is beyond writing. All of it is bugs that only appear on hardware you do not have, and this repo's ctx notes are full of the lesson that the browser is where these get found. **+7.2 kB gzip, lazily loaded, is a very cheap way not to write it.** The bespoke option becomes right only if the design handoff demands an interaction none of these libraries expose.

## The architecture question, answered

**Design 1 — crop client-side, upload the result. Recommended.**

- Server change: **none**. `AvatarImageProcessor` keeps validating, `AutoOrient`ing, capping at 256 px and re-encoding at JPEG q82 — and that re-encode is still the security boundary, so a client-produced Blob is not trusted any more than a raw upload is.
- Cache: correct by construction (new Guid per upload).
- Bonus nobody asks for until it bites: canvas export **normalises the format**. Whatever the browser could decode becomes a PNG or JPEG, which is what the server's magic-byte gate accepts.
- Cost of stopping: you throw away one component. Fully reversible.
- What you give up: the original is gone, so re-cropping means re-picking the file. For a 40 px avatar, that is a shrug.

**Design 2 — store original + crop metadata. Not recommended, and if you do it, do it the third way.**

There are really three variants and only one is safe:

1. *Re-render into the same object key.* **Do not.** Breaks #46's stated precondition; both the memoised presigned URL and the `max-age=300` browser cache serve the old face, most visibly to the person who just changed it.
2. *Apply the crop at render time with CSS* (store the original at, say, 512 px, ship offset+zoom in the profile payload and transform inside the `Avatar`). No re-encode, re-crop is free — but every avatar everywhere (thread list, message rows, `AvatarStack`'s `AvatarGroup`, which clones its children for the `+N` surplus) now has to carry and apply the transform, and `PresenceAvatar`'s initials fallback has to survive it. That is a change to the most-rendered component in the app, and #47's history says the adapter layer loses fields exactly like this.
3. *Store the original under one Guid, write each derived crop under a new Guid, keep `{cropX, cropY, zoom}` on the user.* Cache-correct, re-croppable. But it is design 1 plus a migration, plus an API field, plus a second R2 object per user, plus doubling the orphan rate that issue #20 already tracks. `react-easy-crop` exports `getInitialCropFromCroppedAreaPixels`, which is precisely the function for restoring a saved crop — so if this is ever wanted, the library choice does not change and nothing done now is wasted.

**Do design 1 now.** It is reversible; design 2 is a migration. That asymmetry is the argument.

## What I could not confirm

- **JPEG magic bytes from `canvas.toBlob`.** `WriteHelper.GetImageFormat` accepts JPEG **only** when the first four bytes are `FF D8 FF E0` (JFIF) or `FF D8 FF E1` (EXIF APP1). An encoder that emits a bare `FF D8 FF DB` would be rejected as *"Invalid image file"* — a client-side crop that fails only on one browser. All three major engines are widely believed to emit a JFIF APP0 segment (the familiar `data:image/jpeg;base64,/9j/4AAQSkZJRg…` prefix decodes to `FF D8 FF E0 00 10 J F I F`), but **I did not run a browser to check**, and I did not check iOS Safari at all. *Settling it:* log `new Uint8Array(await blob.slice(0,4).arrayBuffer())` on Chrome, Firefox and iOS Safari before shipping. *Cheap insurance either way:* widen the gate to `FF D8 FF` — a one-line server change that costs nothing and removes the class.
- **HEIC.** iPhones shoot `.heic`. Browsers other than Safari cannot decode it, and ImageSharp 3.1.x cannot either, so it fails today too — this is not a regression introduced by cropping. iOS is generally said to transcode to JPEG when a photo is chosen through `<input type="file" accept="image/*">`, but I did not verify that and it may depend on the picker path.
- **`react-easy-crop` on React 19 in a real browser.** I verified it renders under React 19.2.8 in **jsdom**, which proves no removed-API breakage and no warnings on mount, but jsdom has no layout — so `cropSize` computation, pinch and wheel were not exercised. Its own CI still dev-depends on React 18 (`devDependencies.react: ^18.2.0` in `package.json` on `main`), and a GitHub issue search for "React 19" in that repo returns only unrelated Dependabot PRs. *Settling it:* ten minutes in a real browser with a phone photo.
- **`react-avatar-editor` unreleased pinch support.** PR #434 is merged (`merged: true`, `merged_at: 2026-04-01T04:34:05Z`) and 15.1.0 predates it. I did not diff `main` against the 15.1.0 tag to see what else is queued, so I cannot say how large or how safe the next release will be.
- **Open-issue *quality*.** The counts are raw GitHub `open_issues_count` (which includes PRs). `react-image-crop`'s 72 vs `react-easy-crop`'s 5 is suggestive of maintenance load, not proof of it; I did not read the issue lists.

## Verified how

- `npm install react@19.2.8 react-dom@19.2.8 <candidate>` in a clean scratch directory, **no `--legacy-peer-deps`**, npm 11 / Node 24.18.1 — all six candidates resolved without ERESOLVE. `react-cropper` was installed separately and also resolved (peer `react >=17.0.2`).
- Sizes: esbuild 0.28.2, `--bundle --minify --format=esm --define:process.env.NODE_ENV='"production"'`, gzip level 9, delta against a react + react-dom baseline of 60,197 B gz. Baseline and every candidate built from the same entry shape.
- React 19 rendering: `@testing-library/react` 16.3.2 + vitest 4.1.10 + jsdom 30.0.1 against `react@19.2.8`, `cropShape="round"` / `circularCrop` / `borderRadius` respectively. `react-easy-crop` and `react-image-crop` pass; `react-avatar-editor` throws on jsdom's missing canvas context.
- Feature claims (pinch, HiDPI, `ResizeObserver` guard, removed React APIs) by grepping the **published `dist` files** on disk, not the READMEs.
- Licences from the LICENSE file inside each tarball where one exists, `package.json` otherwise.
- Repo facts (`AvatarImageProcessor.AutoOrient`, `R2AvatarWriter` Guid filenames, `WriteHelper` magic bytes, `ChatApp.handleUploadAvatar`'s FormData, `vitest.config.ts` jsdom + `src/test/setup.ts` stubs) read directly from this working tree.

## Sources

- [npm registry](https://registry.npmjs.org/) and [npm downloads API](https://api.npmjs.org/downloads/point/last-week/) — versions, publish dates, peer ranges, licences, weekly downloads. Fetched 2026-08-11.
- [ValentinH/react-easy-crop](https://github.com/ValentinH/react-easy-crop) — `package.json` on `main` (devDeps still React 18), `docs/src/components/cropImage.ts` (the 67-line export helper), source sizes via the git-trees API.
- [mosch/react-avatar-editor PR #434](https://github.com/mosch/react-avatar-editor/pull/434) — pinch/wheel zoom, `merged_at: 2026-04-01`, after the 15.1.0 release. This is the fact that demotes it to runner-up.
- [dominictobias/react-image-crop](https://github.com/dominictobias/react-image-crop) — `dist/index.d.ts` prop list (no zoom), `ReactCrop.css` (`@media (pointer: coarse)` hides handles).
- [Cropper.js 2.1.1 docs](https://fengyuanchen.github.io/cropperjs/) and the bundled MIT LICENSE — confirms **no** commercial tier in v2, contrary to the concern raised.
- [MUI X](https://mui.com/x/) — the product list; establishes by absence that MUI ships no cropper.
- [React 19 release notes](https://react.dev/blog/2024/12/05/react-19) — full custom-elements support (relevant only to the cropperjs-v2 option).
- [MDN: `image-orientation`](https://developer.mozilla.org/en-US/docs/Web/CSS/image-orientation) — initial value `from-image`, Baseline since April 2020.
- [MDN: `createImageBitmap`](https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap) — `imageOrientation` defaults to `from-image`.
- [whatwg/html#10492](https://github.com/whatwg/html/issues/10492) (open, last updated 2024-12-06) and [w3c/csswg-drafts#4666](https://github.com/w3c/csswg-drafts/issues/4666) (open) — `drawImage` + EXIF is de-facto interoperable but **not specified**. The HTML spec's `drawImage` text mentions orientation nowhere, which I checked directly rather than inferring.
- This repo: [`docs/ctx/2026-08-09-stable-avatar-urls.md`](../ctx/2026-08-09-stable-avatar-urls.md) (the invariant that decides the architecture half), `WebChat/WebChat.AvatarWriter/AvatarImageProcessor.cs`, `R2AvatarWriter.cs`, `Helper/WriteHelper.cs`, `AvatarOptions.cs`, `ClientApp/src/app/ChatApp.jsx`, `ClientApp/vitest.config.ts`, `ClientApp/src/test/setup.ts`.
- **Looked authoritative and was not:** `react-cropper`'s npm page. It is the top search result for "React cropper", is MIT, and its peer range (`react >=17.0.2`) admits React 19 so it installs cleanly — which makes it look current. It was last published 2023-04-12, its repo last pushed 2023-09-11, and it wraps `cropperjs@^1.5.13`, a major version behind. A clean install is not evidence of maintenance.
