# The bundle split, and the number that is easy to overstate

- **Date:** 2026-08-09
- **Type:** change
- **Scope:** `ClientApp/vite.config.ts`, `ClientApp/src/app/App.jsx`. Issue #19.
- **Status:** done

## Context

Every production build warned that the single chunk exceeded 500 kB, and `sourcemap: true`
put a 4 MB `.map` into `dist` — which the csproj publishes and the server then serves.

## What I found

**The two problems are unrelated and only one of them is about size on the wire.** Dropping
the sourcemap took `dist` from **4.73 MiB to 0.81 MiB** on disk. That is by far the larger
number, and it has nothing to do with chunking.

**`'hidden'` would not have worked.** It only removes the `//# sourceMappingURL` comment; the
file is still emitted, and `IncludeSpaOutput` globs `$(SpaRoot)dist\**`, so a 4 MB map would
still ship to a 512 MB instance and still be fetchable by name. With no error tracker to
upload to, dropping it is the only option that keeps it off the server.

**Vendor `manualChunks` does not reduce the initial payload.** It only improves cache reuse
across deploys. Worth having, but it is not what fixes #19, and a group without
`tags: ['$initial']` would have made things *worse* — MUI straddles the lazy boundary, so an
unrestricted `/@mui/` group drags chat-only MUI back into the login download.

**The render-blocking payload fell by a fifth, not by "a fraction".** 844.73 kB → 672.45 kB
raw, 266.06 → 216.49 kB gzip. The floor is real and worth knowing before anyone expects more:
`react-dom` (449 kB) + `react-router` (90 kB) are unavoidable; `@mui/material` + `@mui/system`
(375 kB) are genuinely reachable from the auth screens, because `TextField` statically pulls
`Select → Menu → Popover → Modal → FocusTrap` whether a select is used or not; RTK + immer
(160 kB) build the store at entry; axios (98 kB) is needed by `login`.

**Total JS went *up* 2.2 kB.** The split redistributes, it does not save.

## What changed

- `sourcemap: process.env.VITE_SOURCEMAP === 'true'` — off by default, with an escape hatch.
- Four `$initial`-tagged vendor groups (`vendor-react`, `-mui`, `-state`, `-net`).
- `ChatApp` behind `React.lazy`, `Suspense` on the `/dashboard` route element only, with
  `fallback={null}` and a `prefetchChatApp()` awaited inside `signIn` and `activated`.

## Verified

- Build before/after run by me, not taken from the report: nine assets, largest 232 kB, **no
  size warning** (and `chunkSizeWarningLimit` untouched, so it is gone rather than silenced).
- `ls dist/assets` — **no `.map`**; `grep -c sourceMappingURL` on the entry chunk → 0;
  `dist/index.html` does not preload `ChatApp`.
- `npm run verify` clean — 94 tests, 11 files. `dotnet build -warnaserror` 0 warnings,
  72 tests.
- **In a real browser, against the built output served by `vite preview`:** the login screen
  renders correctly, and the network panel shows the eight eager assets plus `ChatApp` — see
  the correction below. Loading `/dashboard` directly with a stored session loads the lazy
  chunk, renders, fails its API calls (there is no API behind `vite preview`) and falls back
  to the login screen without white-screening or sticking on the Suspense fallback.

### A correction to the agent's report, caught only in the browser

It reported that a signed-out visitor "downloads everything except `ChatApp-*.js`, which
`dist/index.html` confirms". `index.html` does confirm that `ChatApp` is not *modulepreloaded*
— but `prefetchChatApp()` runs from a mount effect, so the network panel shows
`ChatApp-C0y2mzVf.js` fetched on the login page anyway, as request 9 of 9.

So the honest framing is:

- **Render-blocking payload: 672 kB, down 20 %.** This is the metric #19 is about, and it is
  real.
- **Total bytes for a visitor who never signs in: unchanged**, because the prefetch fetches
  the chat chunk after first paint regardless.

That is a deliberate trade — it is what keeps sign-in from waiting on a chunk — but it is not
a byte saving, and the distinction is invisible from the build output alone.

## Known issues / follow-ups

- **The prefetch could be smarter.** Firing on mount means a visitor who never signs in still
  pays for the chat chunk. Triggering on first interaction with the form, or under
  `requestIdleCallback`, would keep the sign-in benefit without that cost.
- **`@microsoft/signalr` (~87 kB) loads before the login screen** and is not needed until
  after sign-in, because `store.ts` prepends `realtimeMiddleware` and that module imports the
  package statically. Deferring it is worth roughly another 7 % of the login path, but it
  means reworking `invokeHub`, which reads `signalR.HubConnectionState` synchronously — a
  change to the least-verified subsystem in the client. Its own issue.
- **`npm run build` still does not run in CI**, so none of this is protected. A
  `codeSplitting` group missing `tags: ['$initial']` would silently double the login payload
  and every existing check would stay green. Recommended as a step in the existing `client`
  job — a step, not a job, because the job name is what branch protection requires.
