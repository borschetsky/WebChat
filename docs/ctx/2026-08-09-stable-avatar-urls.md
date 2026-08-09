# Avatars stopped being re-downloaded: one signed URL per file per window

- **Date:** 2026-08-09
- **Type:** change
- **Scope:** `WebChat.AvatarWriter/CachingAvatarUrlProvider.cs` (new), `R2Options.cs`,
  `WebChat/Startup.cs`, `Controllers/AvatarsController.cs`, `appsettings.json`,
  `WebChat.Tests/Avatars/` (new). Issue #46. Supersedes part of
  [2026-08-03-r2-avatar-storage.md](2026-08-03-r2-avatar-storage.md).
- **Status:** done, verified against the running stack

## Context

Every place an avatar appeared re-fetched it. #47 made the cost visible rather than
theoretical: a group stack that previously drew initials now draws three images, so a thread
list plus a conversation fetched the same faces repeatedly.

## What I found

**Two independent things defeated caching, and only one of them was known.** The redirect
carried `Cache-Control: no-store`, which was deliberate — a cached 302 could outlive the
signature it points at. But even without it nothing would have cached, because **the answer
differed every time**. Proven against the running stack before changing anything, two
requests one second apart:

```
X-Amz-Date=20260808T223403Z   X-Amz-Signature=9d8f82b9e40183811fb65954…
X-Amz-Date=20260808T223404Z   X-Amz-Signature=98cacbc4aba434fd3bbcc6e5…
```

SigV4 puts the signing instant in the URL and signs over it. A different URL is a cache miss
by definition, so the image was re-downloaded on every render regardless of any header.

**The AWS SDK offers no way to pin the signing instant.** `GetPreSignedUrlRequest` exposes
`Expires`, not the clock, so "round the signing time to a window boundary" is not directly
expressible. The URL is therefore **memoised** rather than made deterministic — same
observable effect, and no dependence on SDK internals.

**Safe only because a stored avatar is immutable.** Every upload writes
`$"{Guid.NewGuid()}.{ext}"` (`R2AvatarWriter.cs:45`), so the bytes behind a filename never
change and replacing an avatar produces a *different* filename — a guaranteed miss, not a
stale hit. That single fact is what makes caching correct here; it would be wrong against
stable per-user filenames. (It is also why #20 exists: the old object is orphaned.)

## What changed

- `CachingAvatarUrlProvider` decorates `IAvatarUrlProvider`, returning one byte-identical URL
  per file for `UrlCacheMinutes`. Registered as a **singleton** wrapping the R2 writer — the
  cache has to outlive a request to be a cache at all.
- `R2Options.UrlCacheMinutes` (5) alongside `UrlLifetimeMinutes` (raised 15 → 30), and
  `CacheableFor`, which computes what the redirect may claim.
- `AvatarsController` emits `private, max-age=<CacheableFor>` instead of `no-store`, falling
  back to `no-store` when `CacheableFor` is zero.

## Decisions and trade-offs

- **`CacheableFor = min(window, lifetime − window)`, and the second term is the one that
  matters.** A URL handed out at the very *end* of a reuse window has only `lifetime − window`
  left. Bounding `max-age` by the window alone would let a browser cache a redirect pointing
  at something already expired — a failure visible only to whoever holds it. With 5 and 30 the
  binding constraint is the window, giving `max-age=300` against a URL with ≥25 minutes left.
- **`private`, not `public`.** The target carries a signature; no shared cache should hold it.
- **A zero window disables reuse** and restores per-request signing, as an escape hatch if a
  signed URL ever has to be single-use.
- **Config now states the pair explicitly.** `appsettings.json` pinned `UrlLifetimeMinutes: 15`,
  which silently overrode the new 30 default — the guard did the right thing (`max-age` was
  bounded to 300 against a 15-minute URL) but the shipped config disagreed with the code's
  own reasoning, so both numbers are now written down together.
- **Unbounded growth is handled crudely and deliberately**: a prune pass over expired entries
  once the map exceeds 5,000 distinct files, rather than a fixed-size eviction policy nobody
  would tune.

## Verified

- **Before**, against the running stack: two requests one second apart returned different
  `X-Amz-Date` and different signatures, with `Cache-Control: no-store`.
- **After**, same request: `stable URL: YES`, `Cache-Control: private, max-age=300`,
  `X-Amz-Expires=1800`, and a *different* avatar still gets its own URL (`distinct per
  file: YES`). This is end-to-end through the rebuilt container, not a unit test.
- 9 new tests: 5 on the provider (identical URL inside the window, new URL after it, distinct
  per file, zero-window escape hatch, nulls not cached) and 4 on `CacheableFor` (each branch
  of the min, including the misconfiguration where reuse would outlive the signature and it
  must return zero).
- `dotnet build --no-incremental -warnaserror` — **0 warnings** — and **72 tests** pass. One
  CS8603 of my own making, in a test fake returning null for a non-nullable `string`, was
  fixed rather than suppressed.
- **Not verified: an actual second render reusing the browser cache.** The URL is provably
  stable and the header provably present, which is what makes a hit possible — but I did not
  watch a repeat load come from cache in devtools. That is the remaining gap.

## Known issues / follow-ups

- **Nothing invalidates the cache when an avatar changes**, and nothing needs to: a new
  upload is a new filename. If filenames ever become stable per user, this must be revisited
  first.
- The window is per-process. Two instances hand out two different URLs for the same file
  within a window — harmless (each is valid, each caches on its own client) but it halves the
  benefit behind a load balancer. Irrelevant at `instance_count: 1`.
