# Directory-search infinite request loop in ComposeDialog

- **Date:** 2026-08-04
- **Type:** change
- **Scope:** `WebChat/WebChat/ClientApp/src/features/threads/ComposeDialog.jsx`,
  `WebChat/WebChat/ClientApp/src/app/ChatApp.jsx`,
  `WebChat/WebChat/ClientApp/src/test/compose-search.test.tsx`
- **Status:** done (fix + regression test on `master`; not yet exercised in the deployed app)

## Context

Found by a human, not by the test suite, in the freshly deployed production app at
`https://webchat-edbgd.ondigitalocean.app`. Opening "New conversation" and typing a name
issued `/api/users/search` endlessly — the network panel showed dozens of identical
`search?name=test2` requests, the spinner never stopped, and no result was ever rendered,
even though every request returned HTTP 200 with the correct user
(`{id: "701f6296-...", username: "test2", isOnline: true, avatarFileName: null}`). A working
API paired with a UI that never settles. Fixed on branch `fix/compose-search-loop`,
commit `4640633`.

## What I found

The loop needed **both** of these, confirmed by reading the pre-fix diff
(`git show 4640633 -- .../ComposeDialog.jsx`):

1. `ComposeDialog`'s search effect listed the `onSearch` prop in its dependency array:
   `}, [q, open, onSearch]);` (pre-fix).
2. `ChatApp.jsx` passed an inline arrow around an RTK Query lazy trigger:
   `onSearch={(t) => triggerDirectory(t).unwrap()}`, where `triggerDirectory` comes from
   `useLazySearchDirectoryQuery()` (`ChatApp.jsx:79` for the hook).

Calling the lazy trigger updates RTK Query state, which re-renders `ChatApp`, which mints a
new `onSearch` identity, which re-runs the effect (because it's in the deps), which calls
`onSearch` again. Self-sustaining — no state ever converges.

Results never appeared for a related, second reason: every effect re-run's cleanup set
`cancelled = true` before its own promise resolved, so the in-flight request's `setPeople`
call was discarded moments before it would have committed. The list stayed empty regardless
of how many requests succeeded.

The key generalisable fact: **a parent that does not re-render keeps one stable callback
identity and the loop does not occur.** This is why the bug only manifests with a stateful
caller (RTK Query hook) and is invisible to a naive test with a static harness — see
Verified below.

## What changed

- `ChatApp.jsx:116-119` now wraps the trigger:
  `const handleSearchDirectory = useCallback((term) => triggerDirectory(term).unwrap(), [triggerDirectory])`.
  RTK Query lazy triggers are themselves referentially stable, so this identity never changes
  across renders. Passed at `ChatApp.jsx:272` as `onSearch={handleSearchDirectory}`.
- `ComposeDialog.jsx:29-30` holds the callback in a ref
  (`const search = useRef(onSearch); useEffect(() => { search.current = onSearch; }, [onSearch]);`)
  and the search effect (`ComposeDialog.jsx:32-51`) now depends only on `[q, open]`, calling
  `search.current(term)` instead of `onSearch(term)` directly.

Both ends were changed deliberately, not redundantly: the `ChatApp` fix removes the actual
cause (an unstable identity feeding an effect dependency), and the `ComposeDialog` fix means
the component's correctness no longer depends on every future caller remembering to memoize
its callback — an inline arrow passed by some future caller cannot reintroduce this loop.
**Do not "simplify" one of these away** — that is the point of doing both, per the commit
message and the in-code comment at `ComposeDialog.jsx:23-28`.

## Decisions and trade-offs

- Fix at the boundary (ref in the child) *and* at the source (`useCallback` in the parent),
  rather than either alone. Rejected: fixing only `ChatApp` would leave `ComposeDialog`
  fragile to any future caller passing an inline arrow; fixing only `ComposeDialog` would
  leave the "effect deps include a callback prop" footgun live elsewhere.
- Regression test (`compose-search.test.tsx`) uses a `Harness` parent that calls `setTick`
  after every search and passes a fresh inline arrow each render, standing in for the RTK
  Query state update that produced the loop in production. A harness without that
  self-re-render is not a valid regression guard for this bug — see Verified.

## Verified

- `npx vitest run` from `WebChat/WebChat/ClientApp`: **60/60 passing across 7 files** on
  the fixed code (includes the 4 new tests in `compose-search.test.tsx`).
- Confirmed the test actually fails against the pre-fix implementation: checked out
  `ComposeDialog.jsx` as of `4640633~1` (`git show 4640633~1:....ComposeDialog.jsx`), ran
  `npx vitest run src/test/compose-search.test.tsx`, and got **2 of 4 failing**:
  - `issues one request per term...`: `expected "vi.fn()" to be called 1 times, but got 2 times`
  - `searches again when the term changes, and only then`: `expected [ 'ab', 'abc', 'abc' ] to deeply equal [ 'ab', 'abc' ]`

  Then reverted the working tree back to the fixed version (`git checkout --`). This
  reproduces an *extra-call* signature (2 instead of 1), not a full runaway — the test
  harness's own re-render cycle damps where production's apparently didn't. That's sufficient
  as a deterministic guard, but do not read the test as reproducing the literal "dozens of
  requests" seen in production.
- Author-reported (not independently re-verified by this note): an earlier version of the
  test used a `Harness` with no state, so it never re-rendered and the inline arrow it passed
  kept a stable identity — that version passed against the buggy code and was discarded for
  proving nothing.
- **Not verified: the fix in the deployed app.** `https://webchat-edbgd.ondigitalocean.app`
  was still running commit `f86e1d2` as of this note (autodeploy is off — the app's source is
  a public git clone because GitHub OAuth would not authorise for the new DigitalOcean team).
  Redeploy is manual: `doctl apps create-deployment 7337e1b0-3696-44f8-9462-df84a75c5bab`.

## Known issues / follow-ups

- Grepped the client for the same bug shape — an effect whose dependency array includes a
  callback prop (`\}, \[.*\bon[A-Z]\w*\b.*\]\);`) and, separately, inline-arrow props
  generally (`on[A-Z][A-Za-z]*=\{\([^)]*\) =>`). One other match for the first pattern:
  `ChatApp.jsx:92` — `useEffect(() => { if (threadsFailed) onSignOut(); }, [threadsFailed, onSignOut]);`.
  This one is **benign, not another instance of the bug**: `onSignOut` is `signOut` from
  `App.jsx:30`, which is itself wrapped in `useCallback` and therefore stable across renders,
  so the effect never spuriously re-fires. Every other inline-arrow prop found feeds an event
  handler (`onClick`/`onChange`/`onSubmit`), which only fires on user interaction and never
  re-runs an effect. So the bug class is currently contained, but note that the dependency-array
  grep alone gives false positives — confirming safety also requires checking that the prop's
  origin is stable (`useCallback` or otherwise referentially fixed), not just that it exists.
- This was the first real bug found in the deployed app, and a human clicking found it, not
  the test suite — 56 tests were passing while the primary "start a conversation" flow was
  completely broken. Cited (by the author, not independently corroborated here) as the
  motivation for broader UI-flow test coverage being discussed.

## Update — 2026-08-10

**Both halves of the fix described above are gone, and so is the bug they fixed.**
Superseded by [2026-08-10-compose-search-rtk-query.md](2026-08-10-compose-search-rtk-query.md)
(issue #58).

`ComposeDialog` now calls `useSearchDirectoryQuery` itself. There is no effect, no `onSearch`
prop, no ref holding it, and no `handleSearchDirectory`/`useCallback` in `ChatApp` — so the
mechanism recorded here has nothing left to act on. The loop cannot re-form rather than being
prevented from forming.

What remains true and worth keeping is the *diagnosis*: an unstable callback identity crossing
a component boundary, listed in an effect's dependencies, is a loop. That is why the debounce
that replaced the effect returns a **value** and not a callback.

The regression suite still exists and still uses a re-rendering parent, but its docstring now
says plainly that it no longer reproduces the bug — it pins the guarantees the bug violated
against the implementation that replaced it.
