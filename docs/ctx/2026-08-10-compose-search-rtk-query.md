# The compose search became a query, and the render-loop shape stopped existing

- **Date:** 2026-08-10
- **Type:** change
- **Scope:** `ClientApp/src/features/threads/ComposeDialog.jsx`, `app/ChatApp.jsx`,
  `app/api/chatApi.ts`, `lib/useDebouncedValue.ts` (new), `features/settings/SettingsDrawer.jsx`,
  and both compose test suites. Issue #58, bucket 1. Supersedes
  [2026-08-04-compose-search-render-loop.md](2026-08-04-compose-search-render-loop.md).
- **Status:** bucket 1 done; buckets 2 and 3 recorded on #58 and not started

## Context

The ask was "RTK Query everywhere, no plain functions in the `.ts` files, all state in slices,
no local state". Rather than apply it literally, #58 splits it into what the code should do,
what it should not, and what needs a decision. This note covers the first bucket: state that
duplicated something RTK Query already tracks.

## What I found

**Two of the four asks were already satisfied, and two are contradicted by Redux's own
documentation.** The research note
[2026-08-09-redux-slices-vs-local-state.md](../research/2026-08-09-redux-slices-vs-local-state.md)
has the quotes; the short version is that the Style Guide's Priority B rule
*"Evaluate Where Each Piece of State Should Live"* exists specifically to refute
"everything in the store", and RTK Query's own authentication example keeps its login form in
`useState`.

**Three findings from the research that were not in my brief and change decisions:**

- **The React Compiler is not in this build.** `vite.config.ts` calls a bare `react()` and
  `babel-plugin-react-compiler` is not a dependency. The `rh/*` oxlint rules are the
  compiler's *lint rules*; nothing memoises anything. So the "lift state to avoid re-renders"
  argument is weaker, not stronger — verified independently before relying on it.
- **`retry` cannot fire on `queryFn` endpoints.** `retry.ts` calls `baseQuery(...)`, and
  `fakeBaseQuery` throws when invoked. Undocumented; it constrains what bucket 3 can promise.
- **None of the 10 `queryFn`s forward `api.signal`**, so unmounting mid-flight abandons the
  promise rather than aborting the request. Confirmed by grep: `signal` appears zero times in
  `chatApi.ts`.

**My own count was wrong.** I reported 42 `useState`; that was raw occurrences including
imports and tests. It is **30 declarations across 12 files**.

## What changed

- **`ComposeDialog`** calls `useSearchDirectoryQuery` itself. Gone: `people` (a hand-kept copy
  of server data), `loading` (a hand-kept request flag), `creating` (a copy of the mutation's
  `isLoading`), the `search` ref, and the 40-line effect. `ChatApp` loses
  `handleSearchDirectory` and the lazy trigger with them.
- **`useDebouncedValue`** is the only part of the effect worth keeping — every distinct term is
  a distinct query key, so without it each keystroke is a request.
- **`SettingsDrawer`** takes `saving` and `saveError` from the mutation via `ChatApp` instead of
  keeping its own copies; `handleSaveProfile` stopped calling `.unwrap()`, because that rethrow
  was the reason the drawer had to catch and store an error at all.
- `chatApi` exports `useSearchDirectoryQuery` in place of `useLazySearchDirectoryQuery`.

## Decisions and trade-offs

- **The debounce is a value, not a callback.** A debounced *callback* has an identity, and an
  unstable identity crossing a component boundary listed in an effect's dependencies is
  precisely the render loop. A string cannot have that problem. This is the one idea from the
  old fix that survives.
- **`q` and `picked` stay local**, with the reason in the code: `q` is a controlled input, and
  a keystroke reaching the store is what `composerSlice` and its render-counting test exist to
  prevent. `picked` is dialog-scoped and must not survive a close.
- **The regression suite was rewritten, not deleted, and its docstring says it no longer
  reproduces the bug.** The shape it needed — effect, callback prop, unstable parent — is gone,
  so the honest claim is that it pins the guarantees the bug violated against the
  implementation that replaced them. It still uses a re-rendering parent, because a static one
  could not tell the difference. Deleting it would have lost that; leaving the old docstring
  would have overclaimed.

## Verified

- `npm run verify` clean: oxlint under `--deny-warnings`, Prettier, `tsc --noEmit`, and
  **95 tests across 11 files** (was 94).
- The three claims above that contradicted something I had said were each re-checked by hand
  before being written down — `plugins: [react()]`, `babel-plugin-react-compiler` absent from
  `package.json`, `signal` absent from `chatApi.ts`, and 30 declarations in 12 files.
- New behaviour covered: a repeated term is served from the query cache rather than refetched,
  which the hand-rolled version could not do.
- **Not verified in a browser.** The dialog was not opened against a running stack after this
  change. Everything here is unit-tested and typechecked only, which is exactly the gap that
  has bitten this repo before.
- **Under fake timers, RTK Query needs the promise chain drained**, not just the debounce timer
  advanced: `advanceTimersByTimeAsync` issues the request, but the fulfilled action and its
  re-render land a few microtasks later. Both suites' helpers do this now. `findBy*` is not a
  workaround — it fights fake timers and hangs for its full timeout.

## Known issues / follow-ups

- **Bucket 2 (#58)** — do not move `ThreadList`'s `bell` or `Composer`'s `anchor` into slices;
  they hold `HTMLElement`s, which `composerSlice.ts:13-15` already forbids in the `File` case
  on serializability grounds.
- **Bucket 3 (#58)** — auth still bypasses RTK Query entirely (**#29**), and collapsing
  `chat-service` into `fetchBaseQuery` means first deciding what happens to the six mocked
  features the seam exists to hide.
- **Forwarding `api.signal`** in the 10 `queryFn`s is cheap, orthogonal, and unstarted.
