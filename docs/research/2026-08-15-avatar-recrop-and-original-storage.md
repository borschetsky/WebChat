# Should the app let someone re-crop an existing avatar without re-picking the file?

- **Date:** 2026-08-15 (R2 pricing, free-tier limits and lifecycle behaviour verified on this
  date; they rot — re-check before quoting)
- **Status:** answered
- **Question:** should WebChat store an un-cropped original so an avatar can be re-cropped,
  and if so what is the least-bad design — issue [#88](https://github.com/borschetsky/WebChat/issues/88)
- **Recommendation:** **Do not store originals server-side.** Keep the `File` the user already
  picked, plus the last `croppedAreaPixels`, in the settings drawer's own state, and offer
  "Adjust" from there — zero storage, zero schema, zero server change. Fix
  [#20](https://github.com/borschetsky/WebChat/issues/20) first, on its own, unchanged.

## The short answer

**Build the session-scoped version, not the stored-original version.** `SettingsDrawer.jsx`
already holds the picked photo in `pickedPhoto` state and throws it away on confirm; keeping it
(and the `Area` the cropper last reported) and adding an "Adjust photo" entry that reopens
`AvatarCropDialog` with `initialCroppedAreaPixels` costs roughly twenty lines, no migration, no
second R2 object, and no change to #20. `initialCroppedAreaPixels?: Area` is a real prop on the
installed `react-easy-crop@6.2.3` (verified in `node_modules/react-easy-crop/index.d.ts:74`), so
restoring a crop is a prop, not a project.

That covers the case that actually happens — *"I just saved it and my chin is cut off"* — because
the value of re-cropping is concentrated in the minutes after the crop, and in that window the
browser still has the file. The case it does not cover — re-cropping weeks later, from a device
that no longer has the photo — is served today by picking the file again, at a cost of two
clicks.

**Storage is not the reason to say no.** I measured it rather than assuming: an original stored
at 512 px JPEG q82 averages **29.8 kB**, so originals for ten thousand users would be 298 MB —
**under half a cent a month** at R2's $0.015/GB-month, and inside a free tier that holds tens of
thousands of users either way. Anyone arguing this on storage cost is arguing the wrong axis.
The reasons to say no are that it needs a migration, a second object with a *different* lifetime
from the avatar, a second image-processing path, an anonymous endpoint that serves the part of
the photo the user deliberately cropped out, and a permanently two-state UI (no existing avatar
has an original, so "Adjust" is absent for everyone until their next upload).

**Surprise finding, and it matters more than #88 does:** #84 as currently written exports PNG
(`cropImage.ts:36`), and `AvatarImageProcessor` stores PNG whenever the *upload* was PNG
(`AvatarImageProcessor.cs:76`). Measured on four photographs, that takes the stored object from
**~9.4 kB (JPEG q82 @256) to ~87 kB (PNG @256) — 9.3×**, which is a far larger change to the
storage picture than storing an original would be. That is a #84 observation, not a #88 one, but
#88's arithmetic cannot be done without it. See *The storage arithmetic*.

## What decides it

**One: the value of re-cropping decays fast, and the cheap design covers the part that has
value.** The complaint that motivates #88 is a crop that came out slightly wrong. That is noticed
immediately — you see the result in the drawer the moment the upload lands. In that window the
original is already in memory. Storing it in R2 buys only the *long-tail* case, and the long tail
competes against an existing two-click path (pick the file again) rather than against nothing.

**Two: the reversibility is lopsided.** The session-scoped version is a component-state change in
one file; deleting it is deleting it. The stored-original version is a migration, a new column, a
second object per user whose deletion rule differs from the avatar's, and — once shipped — a
button people will notice going away. It is also the version that starts *collecting data the
server does not have today*: under design 1, the un-cropped image never leaves the browser. Do
the reversible one first and see whether anyone asks for the other.

**Three: the cache invariant is intact and does not actually decide anything.** Re-verified in
this working tree today:

- `R2AvatarWriter.cs:45` — `var fileName = $"{Guid.NewGuid()}.{image.Extension}";` (and
  `AvatarWriter.cs:34` for the local-disk writer).
- `appsettings.json` — `"UrlLifetimeMinutes": 30`, `"UrlCacheMinutes": 5`.
- `AvatarsController.cs:115-118` — emits `private, max-age={CacheableFor}`, i.e. `max-age=300`
  with those two values.
- `Startup.cs:425` — `CachingAvatarUrlProvider` registered as a singleton wrapping the provider.

So the invariant in [`docs/ctx/2026-08-09-stable-avatar-urls.md`](../ctx/2026-08-09-stable-avatar-urls.md)
holds exactly as written, and the trap the issue describes is real: re-render a crop into the
same object key and the memoised signed URL plus the 5-minute browser cache serve the old face,
invisibly to the person who just changed it. **But every candidate design here avoids it for
free**, because "write a new Guid" is what `UploadImage` already does and there is no reason to
do otherwise. The invariant kills exactly one design — the naive one nobody has to build — and
then stops being the deciding factor. Do not let it stand in for an argument it does not make.

## The storage arithmetic

Measured 2026-08-15, replicating `AvatarImageProcessor`'s pipeline exactly (AutoOrient → `Resize`
`ResizeMode.Max` → strip EXIF/IPTC/XMP → encode), SixLabors.ImageSharp **3.1.12**, .NET SDK
**10.0.302**, Windows 11, on four public-domain photographs (three colour portraits/scenes, one
grayscale). Bytes, not estimates:

| Photograph (source px) | stored **JPEG** q82 @256 (today) | stored **PNG** @256 (#84's path) | client 512 px PNG upload | original @512 JPEG q82 | original @1024 JPEG q82 |
|---|---|---|---|---|---|
| Merkel (960×1342) | 8,760 | 106,795 | 388,087 | 25,668 | 89,653 |
| Korda/Guevara (960×1112, gray) | 9,818 | 56,185 | 232,972 | 33,217 | 153,592 |
| Flower (500×477) | 10,478 | 77,984 | 197,885 | 32,801 | 32,801¹ |
| Panda (1280×853) | 8,526 | 108,560 | 384,889 | 27,533 | 97,791 |
| **mean** | **9,396** | **87,381** | 300,958 | **29,805** | 93,459 |

¹ smaller than 1024 px, so not resized — the pipeline never upscales.

Against R2's free tier of **10 GB-month** (taking GB as 10⁹; binary GiB gives ~7% more room):

| What is stored per user | bytes | users inside 10 GB |
|---|---|---|
| cropped JPEG only (today, no crop dialog) | 9.4 kB | ~1,064,000 |
| cropped PNG only (**#84 as written**) | 87.4 kB | ~114,000 |
| cropped PNG + original @512 JPEG | 117.2 kB | ~85,000 |
| cropped PNG + original @1024 JPEG | 180.8 kB | ~55,000 |

**The marginal cost of the original is the second column, and it is nothing.** At $0.015/GB-month
(Cloudflare R2 Standard, verified 2026-08-15), 29.8 kB per user beyond the free tier is
**$0.00045/month per 1,000 users** — $0.0045/month at ten thousand. `PutObject` is Class A at
$4.50/million against a 1M/month free allowance, and storing an original doubles PUTs from one to
two *per avatar change*, which at any plausible rate here is unmeasurable. `DeleteObject` is free.
Egress is free.

Two corrections to the numbers this repo currently reasons with:

- **`AvatarOptions.cs:11-16`'s "3,500 avatars instead of ~200,000" is about the *upload* size**
  (2.8 MB vs an assumed ~50 kB stored). It was never a measurement of what actually lands in the
  bucket. The real figure today is ~9.4 kB — five times better than the comment's optimistic
  case — and ~87 kB once #84 ships, which is about 1.7× *worse* than it.
- **The PNG inflation is the live issue, not originals.** `cropImage.ts` exports `image/png`
  deliberately and well-argued (the server's magic-byte gate accepts JPEG only on `FF D8 FF E0/E1`,
  and PNG's signature is fixed), but `AvatarImageProcessor` then takes the `keepAlpha` branch
  because `DecodedImageFormat is PngFormat`, so a photograph is stored as a 256 px PNG. If that
  is unwanted, the fix is a *content* check, not a format check: a `<canvas>` is always RGBA, so
  "the upload is PNG" and "the upload has alpha" and "the upload *uses* alpha" are three different
  questions and only the third one should force PNG. **Out of scope for #88 — raise it on #84.**

## Options

### A. Do nothing. Re-crop means picking the file again

Per-unit cost 0, fixed cost 0, setup 0, ongoing 0. What it rules out: nothing. **Right if** the
crop dialog turns out to be accurate enough that nobody re-crops. This is the status quo the
#84 research already recommended, and it is a defensible place to stop.

### B. Session-scoped original, client-side only — **recommended**

Keep `pickedPhoto` (the `File`) and the last `Area` after a successful upload instead of
clearing them; render an "Adjust photo" affordance while both are non-null; reopen
`AvatarCropDialog` with `initialCroppedAreaPixels={area}`.

- **Per unit:** zero — one new object per save, exactly as today.
- **Fixed:** zero. No column, no endpoint, no R2 change, no server change at all.
- **Setup:** ~20 lines in `SettingsDrawer.jsx` plus a prop on `AvatarCropDialog`, and a test.
- **Ongoing:** retains one `File` in memory for the session — bounded by `MaxUploadBytes`, so
  ≤ 5 MB, once. Release it when the drawer unmounts if that is judged too much.
- **Rules out later:** nothing. It is strictly a superset of A and strictly a subset of C.
- **The catch, stated plainly:** it does not survive a reload, and it is per-device. That is the
  honest boundary of what it promises, and it should be reflected in the wording — "Adjust" that
  appears next to the photo you just changed reads as scoped; a permanent "Adjust" that vanishes
  after F5 reads as a bug.
- **Implementation note:** a `File` is not serialisable, so it must not go in the Redux store —
  `configureStore` in `src/app/store.ts` uses default middleware, which includes
  `serializableCheck`. Component state or a ref, per
  [`2026-08-09-redux-slices-vs-local-state.md`](2026-08-09-redux-slices-vs-local-state.md).
- **Optional extension, only if the reload gap actually annoys someone:** `File` is
  structured-cloneable, so it can be persisted in IndexedDB. That buys reload-survival at the
  cost of an eviction story and a per-device quota. I would not do it pre-emptively.

### C. Store the original in R2 under its own Guid, plus the crop rect

Design 1 plus: an `OriginalFileName` column, an optional `{x, y, zoom}` or `Area`, a second
processing path at a larger `MaxDimension`, an upload path that sends both the original and the
crop (or sends the original and crops server-side — a bigger change), and an "Adjust" flow that
fetches the original back.

- **Per unit:** +29.8 kB/user at 512 px, +93.5 kB at 1024 px (measured above). Financially nil.
- **Fixed:** a migration, an API field through the `ProfileDto` → `Profile` → `adapters.ts` seam
  that CLAUDE.md documents as a silent-drop trap, and a second object lifetime to reason about.
- **Setup:** the largest of the three by a wide margin.
- **Ongoing:** two objects to delete correctly instead of one (see #20 below), and a support
  question every time the two disagree.
- **What it rules out / costs to stop:** this is the one with a real exit cost. You will have
  collected originals; removing the feature means deleting them and removing a visible button.
- **Two costs that are easy to miss:**
  1. **It gives up a property #84 accidentally created.** Today the un-cropped image never
     reaches the server — the client crops first. Under C the server holds it, and to be
     re-croppable it must be readable by an `<img>`/`fetch` the browser can make, which means the
     `[AllowAnonymous] /images/{fileName}` path. Cropping is frequently *deliberate exclusion*;
     C stores what was excluded and serves it to anyone holding a URL. The existing endpoint's
     unguessable-Guid argument (`AvatarsController.cs:84-90`) still applies, so this is a
     confidentiality *reduction*, not a hole — but it is a reduction, and it is the kind of thing
     worth deciding on purpose.
  2. **"Adjust" is missing for every existing user until their next upload**, because no original
     exists for avatars uploaded before the feature. So the UI is two-state forever, and the
     feature is invisible to exactly the people who already have an avatar they might want to fix.
- **Right if:** a design decision later requires the server to hold a higher-resolution source —
  e.g. retina avatars at 512, or a profile header image derived from the same photo. Then the
  original is being stored for a reason that is not #88, and re-cropping comes along free.

### D. Re-derive a new crop from the stored avatar — **not viable, say so plainly**

The stored object is the cropped square, already downscaled to 256 px and re-encoded. A second
crop can only ever *zoom further in*: a 150 px region blown back up to 256 is visibly soft, and it
is a third-generation encode. The actual complaint — "my head is off-centre", "it cut off my
chin" — needs pixels **outside** the stored square, and those pixels do not exist anywhere on the
server. This option cannot do the thing the issue asks for. It is not a cheaper C; it is a
different, useless feature.

## Interaction with #20

**Fix #20 first, on its own, exactly as
[`2026-08-12-avatar-content-addressing-and-hash-choice.md`](2026-08-12-avatar-content-addressing-and-hash-choice.md)
recommends** — capture the previous `AvatarFileName`, `DeleteObjectAsync` after the new one is
committed, best-effort and logged, plus a one-off sweep for the orphans already there. It is a
small, independent change, it is correct under GUID naming by construction (one column, one
object, one referent), and `DeleteObject` is free on R2.

Do not couple it to #88, and specifically **do not "fix #20 in a way that anticipates #88"**:

- Under **option B**, #88 does not touch #20 at all. Nothing extra is uploaded, so nothing extra
  is orphaned. This is another point in B's favour that is easy to miss.
- Under **option C**, #88 does not merely double the leak — it **changes what the fix means**. The
  two objects have different lifetimes: replacing the photo should delete both the old crop and
  the old original; *re-cropping* must delete the old crop and **keep** the original. So the
  delete stops being "one column changed, delete the old value" and becomes a conditional rule
  over two columns. The failure mode of getting it wrong is asymmetric and worth writing into the
  code: deleting the original too eagerly silently degrades "Adjust" back to "pick the file
  again" (annoying, invisible in tests), while failing to delete it leaks (harmless at this
  scale). Neither is catastrophic, which is precisely why it will not be noticed.

The generalisation is the same one that note already made: the delete is safe **only while
filenames are unique per upload**. That stays true here.

## Can a lifecycle rule retire originals automatically?

**Yes, it is expressible — and it is the wrong tool, in two distinct ways.** Verified against
Cloudflare's documentation on 2026-08-15:

- R2 supports object lifecycle rules for **expiration** and **storage-class transition**,
  configurable from the dashboard, `wrangler r2 bucket lifecycle`, or the S3
  `putBucketLifecycleConfiguration` API.
- Rules **can be scoped by prefix**, so `originals/{guid}.jpg` would be addressable without
  touching avatars. Limit is 1,000 rules.
- Conditions are **age-based only** — `Days` or `Date`. There is **no last-access condition**, so
  "keep the original as long as it is being used" is not expressible.
- Deletion is eventual: objects are "typically removed from a bucket within 24 hours", and
  "existing objects may experience a delay".

Why it is the wrong tool:

1. **It solves a cost problem that does not exist.** The original costs ~$0.0005/month per
   thousand users. A lifecycle rule to save that is operational complexity purchased with real
   money's worth of attention for a fraction of a cent.
2. **The Infrequent Access variant is actively worse than doing nothing.** Cloudflare's pricing
   page states the free tier "only applies to Standard storage, and does not apply to Infrequent
   Access storage." So transitioning originals to IA moves them **out** of the 10 GB free
   allowance and starts a bill ($0.01/GB-month, plus a $0.01/GB retrieval fee, plus a **30-day
   minimum storage duration** charged even if the object is deleted sooner, plus Class A/B
   operations at 2× and 2.5× the Standard rates). This is the classic trap: the cheaper per-unit
   storage class is the more expensive choice at this volume. **Do not transition avatars or
   originals to IA.**

And expiry breaks the feature in a specific way: R2 deletes the object, the database column still
points at it, and "Adjust" 404s. To avoid that the client would have to hide the button based on
an age it computes locally from a stored timestamp — which turns the feature into "you may
re-crop for 30 days", an odd promise. If option C is ever built, the honest shape is *no
lifecycle rule*: keep the original for as long as the avatar exists, and delete it when the
avatar is replaced or the user is deleted.

## Is the crop rect needed at all?

**Not server-side. Yes client-side, where it is free.**

- Under option B the rect is already in `AvatarCropDialog`'s state (`area`, from
  `onCropComplete`). Lifting it one level to the drawer costs a `useState`, and passing it back as
  `initialCroppedAreaPixels` is one prop. There is no reason not to.
- Under option C, re-opening the original **un-cropped** is genuinely good enough for a first
  version and is strictly simpler — no extra column, no format to version, no question of what
  happens when the rect and the image disagree. Redoing a crop from scratch is a few seconds of
  dragging. The rect is a polish item, and it can be added later without a second migration only
  if the column is planned as nullable from the start.
- One asymmetry worth knowing: a stored rect must be interpreted against *the same image
  dimensions it was measured in*. `croppedAreaPixels` is in source-image pixels
  (`cropImage.ts:63-64`), so if the stored original is ever re-encoded at a different size, every
  saved rect becomes wrong by a scale factor. `initialCroppedAreaPercentages` exists on the same
  component and does not have that problem. If a rect is ever persisted, **persist percentages.**

## What I could not confirm

- **How often anyone actually wants to re-crop.** There is no telemetry in this app and no user
  reports on the issue. The claim that the value is concentrated immediately after a crop is
  reasoning from how the interaction works, not a measurement. *What would settle it:* ship B and
  see whether anyone asks for re-crop after a reload. That is also the cheapest way to find out.
- **That the stored object really becomes a PNG end to end.** I verified each link separately —
  `cropImage.ts:36` sets `EXPORT_MIME = 'image/png'`; `AvatarImageProcessor.cs:76` sets
  `keepAlpha` from `DecodedImageFormat is PngFormat`; `AvatarImage.Accepted(…, "png", "image/png")`
  on that branch — but I did **not** run a browser through the real upload path. The inference is
  strong (a canvas PNG carries the fixed PNG signature) but it is an inference.
  *What would settle it:* upload one photo through the #84 branch and look at the stored object's
  extension and size.
- **The PNG size figures are ImageSharp's encoder, on four photographs.** The *stored* column is
  solid, because ImageSharp is what encodes the stored object. The *upload* column
  (181–388 kB) is a proxy: a browser's `canvas.toBlob('image/png')` is a different encoder and
  will not produce these exact bytes. n=4 is enough to establish the ~9× JPEG/PNG ratio, not
  enough to quote a mean to three digits.
- **Whether GB in "10 GB-month" is 10⁹ or 2³⁰** on Cloudflare's invoices. I used 10⁹, which is
  the conservative direction; the binary reading gives ~7% more headroom. It does not change any
  conclusion.
- **Whether R2 lifecycle `Days` is measured from upload or from last modification.** The
  documentation refers to `Days`/`Date` without stating the reference point. Only matters if a
  lifecycle rule is used, which this note recommends against.
- **The 30-day IA minimum applied to a transitioned (rather than directly written) object.** The
  pricing page states the minimum duration; I did not find wording covering the transition case
  specifically. Same conclusion either way — do not use IA here.

## Sources

- **This working tree, read 2026-08-15:** `WebChat.AvatarWriter/R2AvatarWriter.cs:45` and
  `AvatarWriter.cs:34` (fresh `{Guid}.{ext}` per upload — the invariant still holds);
  `AvatarImageProcessor.cs:76,100-108` (`keepAlpha` branch → PNG in, PNG out);
  `AvatarOptions.cs:11-22` (the "3,500 vs 200,000" comment, and `MaxDimension = 256`);
  `WebChat/appsettings.json:59-73` (`UrlLifetimeMinutes: 30`, `UrlCacheMinutes: 5`);
  `Controllers/AvatarsController.cs:84-90,115-118` (anonymous `/images/{fileName}`,
  `private, max-age=300`); `Startup.cs:425` (`CachingAvatarUrlProvider` as singleton);
  `ClientApp/src/features/settings/cropImage.ts:21,36,63-64` (512 px cap, PNG export, rect in
  source pixels); `ClientApp/src/features/settings/SettingsDrawer.jsx:157-166,320-326`
  (`pickedPhoto` state and the lazy dialog); `ClientApp/src/app/store.ts:20` (default middleware,
  hence `serializableCheck`).
- **`node_modules/react-easy-crop/index.d.ts:70-75`** (installed version 6.2.3) —
  `initialCroppedAreaPixels?: Area` and `initialCroppedAreaPercentages?: Area` exist. This is
  what makes option B cheap.
- **Measured locally, 2026-08-15**, in a scratch console app outside the repo (ImageSharp 3.1.12,
  .NET SDK 10.0.302): the byte table above. Four photographs from Wikimedia Commons via
  `Special:FilePath`.
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/) — fetched 2026-08-15.
  Standard $0.015/GB-month; Class A $4.50/M, Class B $0.36/M; free tier 10 GB-month / 1M Class A /
  10M Class B; egress free; `DeleteObject` free. **The load-bearing sentence:** *"The free tier
  only applies to Standard storage, and does not apply to Infrequent Access storage."* IA:
  $0.01/GB-month, $0.01/GB retrieval, 30-day minimum duration.
- [Cloudflare R2 object lifecycles](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)
  — fetched 2026-08-15. Expiration and storage-class transition; prefix scoping; 1,000-rule
  maximum; dashboard / Wrangler / S3 `putBucketLifecycleConfiguration`; removal "typically within
  24 hours"; **age-based conditions only — no last-access condition**, which is the fact that
  kills "retire originals nobody is using".
- This repo: [`docs/ctx/2026-08-09-stable-avatar-urls.md`](../ctx/2026-08-09-stable-avatar-urls.md)
  (the invariant, re-verified above),
  [`2026-08-11-avatar-crop-library.md`](2026-08-11-avatar-crop-library.md) (design 1, and the
  three variants of design 2),
  [`2026-08-12-avatar-content-addressing-and-hash-choice.md`](2026-08-12-avatar-content-addressing-and-hash-choice.md)
  (the #20 fix this note says to ship first, unchanged), issues #20, #84, #88.
- **Looked decisive and was not:** the caching invariant itself. It is the headline of the issue
  and it is genuinely true, but it only rules out re-rendering into a stable key — something no
  sensible design would do, since `UploadImage` already mints a Guid. It does not distinguish
  between the options that are actually on the table.
