# Should avatars be stored content-addressed, and is MD5 the right hash in 2026?

- **Date:** 2026-08-12
- **Status:** answered
- **Question:** Should `R2AvatarWriter` name stored avatars after a hash of their content (deduplicating identical images), and if so which hash — and does that change how issue #20 (orphaned R2 objects) should be fixed?
- **Recommendation:** **No — do not content-address.** Keep `$"{Guid.NewGuid()}.{ext}"`, fix #20 with a best-effort `DeleteObjectAsync` of the previous object after the new one is committed, and add a one-off sweep for the orphans already in the bucket. If a future feature ever needs a content hash, use **SHA-256 from the BCL** (no package, and measured **3.3× faster than MD5** on this hardware) and put it in a *column*, not in the filename.

## The short answer

Content addressing solves a problem this app does not have and creates one it does not want.
The dedup rate here is approximately zero — avatars are re-encoded by `AvatarImageProcessor`
before storage, and I measured that the same photograph re-saved at a different source quality
produces different stored bytes, that a client-side crop (which
[2026-08-11-avatar-crop-library.md](2026-08-11-avatar-crop-library.md) recommends baking in)
would vary per browser, and — the surprise — that **the pipeline's output is not even stable
across CPU SIMD width**: the identical source produced 11,593 / 11,608 / 11,631 bytes under
AVX2 / SSE / no-intrinsics on the same machine. Against that, the storage being saved is a
fraction of a 10 GB free tier that already holds roughly 500,000 avatars at ~20 kB each.

What content addressing *would* buy is the thing to look at hardest: an object whose name
proves its bytes, making `Cache-Control: immutable` truthful. **It does not pay out here**,
because the browser never sees the object name — it sees a SigV4 presigned URL whose query
string is part of the cache key and which rotates every `UrlCacheMinutes`. The lever for
longer caching is the signature lifetime (R2 allows up to 7 days) and the memo window in
`CachingAvatarUrlProvider`, and that lever is a config change available today, entirely
independent of how files are named. The GUID scheme already gives the immutability guarantee
that #46 depends on: a new upload is a new name, so a name never changes meaning.

On MD5 specifically: the instinct is not as wrong as it looks. MD5's *second-preimage*
resistance is unbroken (best known attack 2^123.4, RFC 6151), and an attacker can only produce
colliding **pairs they control both halves of** — which in this app aliases two of their own
avatars and harms nobody. The re-encode is a second, independent block: JPEG/PNG MD5
collisions are built out of comment segments and palette padding that ImageSharp discards.
So MD5 would very likely be *safe* here. It is still the wrong choice, because it is **slower**
than SHA-256 on any CPU with SHA extensions (measured: 645 MB/s vs 2,115 MB/s), needs no less
code, and costs an explanation in every future code review.

## What decides it

**One: the refcount problem is a new, irreversible risk, taken on to save nothing.** Today
there is not a single delete anywhere in the codebase — `grep` for `DeleteObject` /
`DeleteUser` across the solution returns nothing. Issue #20's fix will be the *first* deletion
this app ever performs. Under GUID naming that delete is safe by construction: exactly one
`User.AvatarFileName` can ever point at a given object. Under content addressing it is not, and
issue #20's own warning — *"there is no reverse index from object to user, so a stray delete is
unrecoverable"* — becomes the actual failure mode: **naive dedup upgrades "we leaked a 17 kB
object" into "we deleted someone else's avatar."** That is strictly worse than the bug being
fixed. And it is the asymmetric one: removing a delete is a one-line revert, whereas unwinding
sharing after the fact is impossible to do correctly, because nothing records which of two
users "owns" a shared object.

**Two: the dedup rate is ~0, and it is measurable rather than arguable.** Hashing finds
byte-identical files. Two users reach byte-identical *stored* bytes only if they uploaded
byte-identical *source* files (same file, not the same photo) **and** were served by a process
with the same SIMD width. Measured on `SixLabors.ImageSharp` 3.1.12 / .NET 10.0.10 / AMD Ryzen
9 5900X, replicating `AvatarImageProcessor`'s JPEG branch exactly:

| Case | Processed output |
|---|---|
| Same source bytes, twice, same process | identical (`B3DEB4A6…`) |
| Same source bytes, separate process | identical (`B3DEB4A6…`) |
| Same picture, source encoded at q85 instead of q90 | **different** (`BCE7E54F…`) |
| Same source, `DOTNET_EnableAVX2=0` | **different** (`1B369AE6…`, 11,608 B) |
| Same source, `DOTNET_EnableHWIntrinsic=0` | **different** (`D6F4AF00…`, 11,631 B) |

The last two rows are the interesting ones and I have not seen them written down anywhere: a
content-addressed store here is *correct* but **hardware-dependent**. Move the app to a
different instance generation and the same user re-uploading the same file writes a second
object, silently. Dedup would still be safe; it just quietly stops working, which is the worst
kind of feature to own.

Everything else — which hash, how fast it is, whether ETag is free — is downstream of those
two and does not change the answer.

## Is MD5 acceptable here? (the honest version)

**Broken, in exactly the way that sounds fatal and here is not.**

- *Collision resistance is gone, and images are the textbook vector.* RFC 6151 (2011):
  *"MD5 is no longer acceptable where collision resistance is required."* The
  `corkami/collisions` repository states that an MD5 collision **of two arbitrary JPEGs is
  _instant_** via UniColl — no chosen-prefix search, "just some minor file changes" — the same
  for PNG, and ~11 minutes with FastColl for GIF. Prebuilt colliding image pairs are shipped in
  that repo.
- *Preimage resistance is not gone.* RFC 6151: *"the best result can find a pre-image attack of
  MD5 faster than exhaustive search … the complexity 2^123.4 is still pretty high."*
  `corkami/collisions`' FAQ puts it plainly: making a file take *the same hash as an existing
  file* is not achievable.

That distinction is the whole answer, because in this app an attacker does not get to choose
the other side of the collision:

1. **They cannot target an existing avatar.** That is a second-preimage attack. Infeasible.
2. **They can produce a pair and upload both** — but both are then their own avatars, aliased
   to one object. Harm: none. They could also upload one half and try to get a victim to upload
   the other (social engineering: "here's your team photo"). The payoff is that the victim's
   avatar renders the attacker's other image — an outcome the attacker could have had by simply
   giving the victim that image instead. No token, key, message or permission in this system is
   keyed by an avatar hash.
3. **The re-encode blocks it anyway.** The hash that matters is over
   `AvatarImageProcessor`'s *output*, and the output is bytes this process produced. UniColl and
   FastColl collisions live in structural slack — JPEG comment segments, palette bytes, EXIF —
   which the processor strips (`ExifProfile/IptcProfile/XmpProfile = null`) and re-encodes past.
   Crafting two *source* images whose ImageSharp-q82-256px *encoder outputs* collide is not a
   published capability, and it is a materially harder problem than the collision itself.

**So: MD5 is not exploitable in this design.** It is still not what to reach for, for a reason
that has nothing to do with security — it is **slower**. Measured below: on a CPU with SHA-NI,
SHA-256 runs at 3.3× MD5's throughput. MD5's only remaining argument was speed, and on modern
hardware that argument has inverted.

## What to use instead, if a hash is ever needed

Measured on this machine (AMD Ryzen 9 5900X, Windows 11, .NET 10.0.10, Release, naive
`Stopwatch` loop — **not** BenchmarkDotNet; treat as ratios, not absolutes):

| Algorithm | 17,615 B (a real avatar) | 5 MB (max upload) | Where it comes from |
|---|---|---|---|
| MD5 | 0.0261 ms — 645 MB/s | 7.51 ms — 666 MB/s | BCL, shared framework |
| SHA-1 | 0.0206 ms — 817 MB/s | 6.04 ms — 827 MB/s | BCL |
| **SHA-256** | **0.0079 ms — 2,115 MB/s** | **2.27 ms — 2,203 MB/s** | **BCL, shared framework, zero packages** |
| SHA-512 | 0.0252 ms — 668 MB/s | 7.19 ms — 695 MB/s | BCL |
| SHA3-256 | 0.0371 ms — 453 MB/s | 11.12 ms — 450 MB/s | BCL (`SHA3_256.IsSupported` = True here) |
| BLAKE3 | 0.0130 ms — 1,295 MB/s | 2.28 ms — 2,191 MB/s | NuGet `Blake3` 3.0.2 |
| XXH3-64 | 0.0110 ms (see caveat) | 0.101 ms — ~49 GB/s | NuGet `System.IO.Hashing` 10.0.11 |
| XXH128 | 0.0005 ms | 0.102 ms — ~49 GB/s | NuGet `System.IO.Hashing` 10.0.11 |

**SHA-256 wins on every axis that applies here.**

- **SHA-256** — `System.Security.Cryptography.SHA256.HashData(ReadOnlySpan<byte>)`, one call, no
  allocation of a disposable, **no package**: I confirmed `System.Security.Cryptography.dll` is
  in `Microsoft.NETCore.App/10.0.10` and the benchmark resolved it from there. Cryptographic,
  and the default for every content-addressed system worth copying (Git's SHA-256 mode, OCI
  image digests, IPFS). Fastest of the cryptographic options on this CPU because of SHA-NI.
- **BLAKE3** — NuGet `Blake3`, latest **3.0.2**, published **2026-07-16**, **BSD-2-Clause**,
  by xoofx, 5,032,478 total downloads (NuGet search API, checked 2026-08-12). It is a P/Invoke
  wrapper over the Rust implementation via `Blake3.Native` (win/linux/macOS incl. musl and
  ARM64; the runtime image here is Debian-based `mcr.microsoft.com/dotnet/aspnet:10.0`, so
  linux-x64 glibc). Its headline is throughput — and on this CPU **it lost to BCL SHA-256**,
  because hardware SHA extensions beat a software tree hash on a 17 kB input. A native
  dependency and a third-party package for negative benefit. Ruled out.
- **xxHash / XXH3 / XXH128** — NuGet `System.IO.Hashing`, latest **10.0.11**, published
  **2026-08-11**, **MIT**, Microsoft. Note it is *not* in the shared framework (confirmed: no
  `System.IO.Hashing.dll` under `Microsoft.NETCore.App/10.0.10`; the benchmark needed a
  `PackageReference`). Blazing, and **disqualified as an identity**: xxHash is
  non-cryptographic and makes no collision-resistance claim at all, so with untrusted input a
  colliding pair is not merely possible but constructible on purpose. Input here *is* untrusted
  — any confirmed account can upload. Fine as a cheap pre-filter in front of a real comparison;
  never as the name of an object.
- **SHA-1** — broken for collisions (SHAttered 2017, chosen-prefix 2020), no speed advantage,
  no reason.

Caveat on the numbers: the XXH3-64 figure at 17 kB (1,522 MB/s) contradicts XXH128 on the same
input (37 GB/s) and I do not believe it — that row is loop overhead, not the algorithm. The
5 MB rows are the trustworthy ones, and even those may be flattered by the buffer sitting in
L3. None of this matters operationally: **at real avatar size every option finishes in tens of
microseconds**, against a pipeline that already spends milliseconds decoding and re-encoding.

## Original bytes or processed bytes?

**Processed output, if you hash at all.** Three reasons: it is the thing actually stored, so
hash identity and object identity are the same fact (a refcount over anything else is a lie
waiting to happen); it defuses the crafted-collision vector described above; and hashing the
original would require a second table mapping original→stored anyway. The costs are that the
hash is unknown until after processing (irrelevant — processing is milliseconds and happens
before the PUT regardless) and the SIMD-dependence measured above.

**Perceptual hashing (pHash/dHash/aHash) is the wrong tool here, and cheaply dismissed.**
`CoenM.ImageSharp.ImageHash` 1.3.6 (MIT, published **2022-07-05**, depends on
`SixLabors.ImageSharp >= 2.1.3`, so it does not force the 4.x paid-licence upgrade this repo
deliberately avoids) implements AverageHash, DifferenceHash and PerceptualHash. I verified it
**compiles and runs against the pinned ImageSharp 3.1.12 on .NET 10** — so availability is not
the obstacle. The obstacle is semantics: a perceptual hash answers "are these *similar*?" with
a threshold, so using it for storage dedup means occasionally deciding that two different
people's photographs are the same file, and **serving user A's face to user B**. That risk is
unbounded downside for a storage saving already established as zero. It is a reasonable tool
for a banned-image list or "you already uploaded this" UX hint; it is not a storage scheme.

## The refcount problem, if dedup ever happens anyway

| Option | Failure mode | Verdict |
|---|---|---|
| **No dedup, delete-on-replace** (recommended) | The delete fails → one orphan. Same as today's failure, but the rate goes from 100% of replacements to ~0. Must be best-effort and logged, never allowed to fail the upload. | Correct by construction: one object, one referent. |
| **Never delete** (dedup + accept growth) | Nothing breaks; the bucket grows forever. At ~20 kB an avatar, 10 GB free ≈ 500k objects. | Honest, and arguably fine — but then dedup saves storage nobody was short of. |
| **Refcount column** (`AvatarObject { Key PK, RefCount, CreatedOn }`) | A missed decrement leaks (benign); a **double** decrement deletes a live avatar (malign) — and there is no reverse index to recover from. Two concurrent uploads of the same content both see "no row" and both insert: EF Core gives you a PK violation on one, and the naive retry path is where the double-count bug lives. Only race-free formulation is a single-statement Postgres upsert — `INSERT … ON CONFLICT (key) DO UPDATE SET "RefCount" = "AvatarObject"."RefCount" + 1` — which EF Core has no first-class API for, so raw SQL. | Workable, but the counter is a second source of truth that can silently diverge from the users table. |
| **Derive the count** (`DELETE … WHERE NOT EXISTS (SELECT 1 FROM "User" WHERE "AvatarFileName" = key)`) | No counter to corrupt — the users table *is* the truth. Race: between the check and the R2 delete, someone can adopt that key. | Better than a counter, needs the race closed. |
| **Mark-and-sweep GC with a grace period** | List the bucket, subtract every referenced key, delete the remainder **only if older than N days**. The grace period is what makes the TOCTOU race harmless. Cost: `ListObjectsV2` is Class A, 1,000 keys per call, against a 1M/month free allowance — negligible. Failure mode: a GC bug deletes broadly rather than narrowly, so it needs a dry-run mode and a log. | The only option that also cleans up **historic** orphans, which delete-on-replace never will. Right answer *if* dedup ever exists. |

Whichever is chosen, the interaction with #20 must be stated in the code: **issue #20's fix as
written ("capture the old `AvatarFileName`, `DeleteObjectAsync` after commit") is safe only
while filenames are unique per upload.** If content addressing is ever introduced, that delete
has to change in the same commit, or the first user to replace a shared avatar blanks somebody
else's profile.

## The two side questions

**Can R2's `ETag` be the hash, for free? No — it arrives too late.** For the objects this app
writes it *is* an MD5: AWS documents that for general-purpose buckets "the ETag is the MD5
digest of the object" for single-`PUT` objects and explicitly not for multipart or SSE-KMS/SSE-C
objects, and Cloudflare documents R2's multipart ETag as the MD5 of the concatenated binary
MD5s of the parts plus `-N` (their example: two parts → `f77dc0ee…-2`). The multipart caveat is
unreachable here anyway: R2's minimum part size is 5 MiB, stored avatars are ~12–20 kB, and
`PutObjectAsync` never splits an upload (only `TransferUtility` does). The real problem is
ordering — **a content-addressed key must be known before the PUT, and `ETag` is only known
after it**. Using it would mean PUT to a temporary key → read `PutObjectResponse.ETag`
(property confirmed present in AWSSDK.S3 4.0.101.6) → `CopyObject` to the hash key → delete the
temporary: three billable operations and a non-atomic sequence, to avoid an 8 µs SHA-256. Use
`ETag` as a post-write integrity check if you want one; not as an identity. (R2 also accepts
`If-None-Match` on `PutObject` per its S3 compatibility table, and the SDK exposes
`PutObjectRequest.IfNoneMatch` — that is the primitive a conditional "create only if absent"
would use, if dedup ever happened.)

**Does content addressing improve the caching work in
[2026-08-09-stable-avatar-urls.md](2026-08-09-stable-avatar-urls.md)? No — and this is the
argument that looks strongest and isn't.** "Immutable content makes `Cache-Control: immutable`
truthful" is true and useless here, for two reasons. First, the GUID scheme *already* provides
immutability: that note's own reasoning — *"every upload writes `$"{Guid.NewGuid()}.{ext}"` …
so the bytes behind a filename never change"* — is the same guarantee content addressing would
provide, arrived at differently. Second, and decisively, the browser never caches against the
object name. It caches against the **presigned URL**, whose SigV4 query string is part of the
cache key and which `CachingAvatarUrlProvider` rotates every `UrlCacheMinutes`. An object-level
`Cache-Control: immutable` (settable — `PutObjectRequest.Headers.CacheControl` exists in the
SDK) cannot be exploited across a URL rotation. **The binding constraint on cache lifetime is
the signature, not the filename.** If longer caching is the goal, the change is to raise
`UrlLifetimeMinutes` toward R2's documented maximum of 7 days and widen `UrlCacheMinutes`
behind the existing `CacheableFor = min(window, lifetime − window)` guard — config, not
architecture. The trade to weigh there is that a longer signature is a longer window in which a
leaked URL still works.

**One under-discussed cost of content addressing: it destroys an unguessability property the
code explicitly relies on.** `AvatarsController.GetImage` is `[AllowAnonymous]` by necessity,
and its doc comment leans on exactly this: *"The filenames are server-generated GUIDs, so they
are not enumerable."* A content-derived filename is computable by anyone who can reproduce the
bytes — and this repository is public, so the pipeline is known. That turns `/images/{name}`
into an existence oracle: "is *this* photograph somebody's avatar on this server?" answerable
without an account. It is a minor confidentiality leak, but it is a *regression* against a
documented, deliberate property, and it is independent of hash choice — SHA-256 has it too. The
fix, if dedup ever ships, is to key the storage name with an HMAC (`HMACSHA256` over the content
with a server secret) so dedup survives and enumeration does not — at the cost of a secret that
cannot be rotated without rewriting every key.

## Recommendation, and what would change it

**Do (now):**
1. Fix #20 as the issue already describes — capture the previous `AvatarFileName`, and after the
   new one is committed, `DeleteObjectAsync` the old one, best-effort, failures logged not
   thrown. `DeleteObject` is listed as a free operation on R2's pricing page, so this costs
   nothing per upload.
2. Add a one-off sweep for the orphans already in the bucket: `ListObjectsV2`, subtract every
   key present in `User.AvatarFileName`, delete what is older than a few days. Delete-on-replace
   does not clean history.
3. Do not add a hash, a dedup table, or a refcount.

**Keep the option open cheaply:** if a hash is ever wanted — abuse lists, "you already uploaded
this", integrity checks — add a nullable `AvatarSha256` **column** using
`SHA256.HashData(image.Bytes)`. Zero packages, ~8 µs, and it leaves the filename scheme and the
one-object-one-referent invariant untouched. That is the reversible version of this idea.

**Reversibility:** the recommendation is highly reversible (delete-on-replace is a few lines and
a revert). Content addressing is **not** — once two users share an object, there is no record of
who "owns" it, and unwinding means re-uploading per-user copies from bytes you may no longer be
able to reproduce (see the SIMD result). That asymmetry alone justifies the default of "no".

**What would change my mind:**
- **Avatars become shared by design** — a set of stock/default avatars, or an org logo pushed to
  many members. Dedup rate jumps from ~0 to high. Even then, the right fix is a small "stock
  avatar" table with fixed keys, not content addressing of user uploads.
- **Storage becomes a real constraint** — at ~20 kB each, 10 GB is ~500,000 avatars. Not this
  decade at this scale.
- **The presigned-redirect design is replaced by a public bucket on a custom domain** (which now
  requires moving DNS to Cloudflare — CLAUDE.md records DNS is at the registrar). Then URLs stop
  rotating, `immutable` becomes reachable, and the caching argument for content addressing
  becomes real for the first time. Note it would *also* become real for GUID names, so it still
  is not the deciding factor.
- **MD5 specifically:** nothing would make me choose it. If it were free (the `ETag`), it is
  not free in practice; if it were fast, it is not fast any more.

## What I could not confirm

- **Whether the DigitalOcean App Platform `basic-xxs` CPU has SHA-NI.** All throughput numbers
  here are from an AMD Ryzen 9 5900X. If production lacks the extensions, SHA-256 falls back to
  software and MD5's relative position improves — but at 17 kB both are microseconds, so the
  conclusion is unaffected. Settled by reading `/proc/cpuinfo` in the running container.
- **The benchmark method.** A naive `Stopwatch` loop, 20,000 iterations at 17 kB and 300 at 5 MB
  after a 50-iteration warm-up — not BenchmarkDotNet, no statistics. The XXH3-64 small-input
  row is visibly wrong (contradicted by XXH128 on the same buffer) and should not be quoted.
- **R2 `ETag` behaviour with `DisablePayloadSigning = true`.** The MD5-ETag claim comes from AWS
  and Cloudflare documentation, not from a round-trip against the live bucket — I had no
  credentials in this session and did not touch R2.
- **ImageSharp determinism across versions.** I tested 3.1.12 only (its assembly version reports
  3.0.0.0), on one CPU, varying SIMD width. Whether a patch release changes encoder output is
  untested — and if it does, that is a further strike against content addressing.
- **`Blake3` 3.0.2 on Linux.** Version, licence (BSD-2-Clause) and download count come from the
  NuGet APIs; the throughput figure was measured on win-x64. The musl/ARM64 native asset list
  came from the package page and was not verified by inspecting the `.nupkg`.
- **The corkami "instant JPEG MD5 collision" claim** is read from that repository's README, not
  reproduced by running the tooling. It is consistent with the published UniColl technique and
  with RFC 6151, so I treat it as sound, but it is a secondary source.
- **R2 free-tier and operation-class figures** (10 GB-month, 1M Class A, 10M Class B, free
  `DeleteObject`, free egress) are from Cloudflare's pricing page fetched **2026-08-12**. Prices
  rot; re-check before relying on the delete being free at volume.

## Sources

- [RFC 6151](https://www.rfc-editor.org/rfc/rfc6151.txt) — authoritative on both halves of the
  MD5 question: collision resistance gone, preimage complexity still 2^123.4.
- [corkami/collisions](https://github.com/corkami/collisions) — that an MD5 collision of two
  arbitrary JPEGs/PNGs is *instant* via UniColl, with prebuilt examples; and the collision vs.
  preimage FAQ. Secondary but well-regarded; not reproduced here.
- [cr-marcstevens/hashclash](https://github.com/cr-marcstevens/hashclash) — the chosen-prefix
  tooling itself. **Looked authoritative and gave nothing usable:** the README as fetched
  carries no runtime or cost figures, so any "$X on GPUs" number should not be attributed to it.
- [AWS S3 `PutObject` API reference](https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutObject.html)
  — "for objects where the ETag is the MD5 digest of the object…", and the explicit exceptions
  (directory buckets, SSE-C: "The ETag that is returned is not the MD5 of the object").
- [Cloudflare R2 — multipart objects](https://developers.cloudflare.com/r2/objects/multipart-objects/)
  — multipart ETag = MD5-of-concatenated-MD5s + `-N`; min part 5 MiB, max 5 GiB, 10,000 parts.
- [Cloudflare R2 — S3 API compatibility](https://developers.cloudflare.com/r2/api/s3/api/) —
  `If-Match`/`If-None-Match` supported on `PutObject`; checksum algorithm support table.
- [Cloudflare R2 — presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) —
  "Timeout from 1 second to 7 days (604,800 seconds)".
- [Cloudflare R2 — pricing](https://developers.cloudflare.com/r2/pricing/) — free tier 10 GB-month
  / 1M Class A / 10M Class B; `DeleteObject` free; egress free. Checked 2026-08-12.
- [NuGet `System.IO.Hashing`](https://www.nuget.org/packages/System.IO.Hashing) — 10.0.11,
  published 2026-08-11, MIT; CRC-32, CRC-64, xxHash3/32/64/128.
- [NuGet `Blake3`](https://www.nuget.org/packages/Blake3) — 3.0.2, 2026-07-16, BSD-2-Clause,
  5.03M downloads (figures from `azuresearch-usnc.nuget.org` and the flat-container index).
- [NuGet `CoenM.ImageSharp.ImageHash`](https://www.nuget.org/packages/CoenM.ImageSharp.ImageHash)
  — 1.3.6, 2022-07-05, MIT, `SixLabors.ImageSharp >= 2.1.3`; AverageHash/DifferenceHash/
  PerceptualHash.
- **Measured locally, 2026-08-12** (scratch projects outside the repo, .NET 10.0.10, Release,
  AMD Ryzen 9 5900X, Windows 11): the hash throughput table; that SHA-256 lives in
  `Microsoft.NETCore.App/10.0.10` and `System.IO.Hashing` does not; that `SHA3_256.IsSupported`
  is true; that `CoenM.ImageSharp.ImageHash` 1.3.6 compiles and runs against ImageSharp 3.1.12
  on .NET 10; that AWSSDK.S3 4.0.101.6 exposes `PutObjectResponse.ETag`,
  `PutObjectRequest.IfNoneMatch`, `PutObjectRequest.MD5Digest`, `ChecksumSHA256` and
  `Headers.CacheControl`; and the pipeline-determinism table, including the SIMD-width result.
- **Repo, read this session:** `WebChat.AvatarWriter/R2AvatarWriter.cs:45` (GUID filename),
  `AvatarWriter.cs:34` (same), `AvatarImageProcessor.cs` (re-encode, metadata strip, limits),
  `WebChat/Controllers/AvatarsController.cs:84-90` (the "GUIDs are not enumerable" comment) and
  `:115-120` (the `CacheableFor` header), `WebChat.Services/UserService.cs:62-68`
  (`AddAvatar` — plain overwrite, no delete), issue #20, and the absence of any
  `DeleteObject`/user-deletion code anywhere in the solution.
