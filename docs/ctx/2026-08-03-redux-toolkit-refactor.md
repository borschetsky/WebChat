# Redux Toolkit + RTK Query refactor of the client

- **Date:** 2026-08-03
- **Type:** change
- **Scope:** `WebChat/WebChat/ClientApp` — `app/`, `features/`, `services/`, `theme/`, `test/`
- **Status:** done — Phases 2–6 complete (Phase 6 was the last of the planned 0–6 phases)

## Context

A measured analysis of the redesigned client found: `ChatApp.jsx` at 371 lines with **19
`useState`**, `ConversationPane` taking **27 props**, **zero `React.memo`**, and **zero
tests**. The composer `draft` lived in `ChatApp`, so every keystroke re-rendered
`ChatApp` → `ConversationPane` → every unmemoized `MessageRow`.

Two decisions were taken up front: **RTK Query over the existing `chat-service`** rather
than `fetchBaseQuery`, so the mock seam survives; and **full TypeScript conversion** during
the refactor rather than after.

## What changed

**Phase 2 — slices (`3176f8a`).** `app/store.ts`, `app/hooks.ts` (typed
`useAppDispatch`/`useAppSelector` via `.withTypes`), and three slices: `authSlice`,
`uiSlice`, `composerSlice`. `ChatApp` went **19 `useState` → 7**.

**Phase 3 — RTK Query.** `app/api/chatApi.ts` uses `fakeBaseQuery()` with a per-endpoint
`queryFn` delegating to `chat-service`. Nine endpoints, three tag types, and
`createEntityAdapter` for messages so a SignalR arrival or an optimistic send is an O(1)
upsert. `ChatApp`'s remaining local state is only the typing indicator and the mocked
unread overlay — nothing on the server backs either.

## Decisions and trade-offs

**`fakeBaseQuery` + `queryFn`, not `fetchBaseQuery`.** `chat-service` already owns URLs,
auth headers, DTO adaptation *and* the mock seam. Routing through it keeps mocked features
indistinguishable from real ones at the call site, and means a feature gaining a backend is
still a change to `chat-service` + `mocks` alone.

**The token is read inside each `queryFn` via `api.getState()`**, so no component threads it
through as an argument.

**`ChatApp` must not subscribe to the draft.** The obvious way to send a message is for the
parent to read the draft — but subscribing to it in `ChatApp` reintroduces exactly the
re-render `composerSlice` exists to remove. So `Composer` passes its contents up in the
`onSend` payload. This is the single least obvious constraint in the refactor and is easy
to undo by accident.

**`File` objects are kept out of the store.** They are not serializable and would trip
RTK's serializability check and break time-travel debugging. The slice holds
`{ key, name, size }`; the `File` lives in a module-level `Map`, fetched by key at send
time and released on `composerCleared`.

**Thread selection is one action.** `threadSelected` also closes in-thread search, clears
the term and switches the mobile pane — previously four `setState` calls that could
interleave.

**A failed message keeps its row.** `onQueryStarted` inserts a placeholder with
`status: 'sending'`; on success it swaps in the server message, on failure it keeps the row
as `'failed'` so the text is not lost, and `MessageStatus` offers Retry. This is the
handoff brief's *"no optimistic-send failure state — add a retry affordance"*. The read
receipt is suppressed on any message carrying a status: a failed message has not been
delivered, so a receipt would be a lie.

## What the conversion surfaced

**TypeScript earned its place at the seam.** RTK Query would not typecheck because
`chat-service` was still untyped JS and inferred `presence: string` rather than the
`Presence` union. That forced `services/adapters`, `services/mocks` and
`services/chat-service` to TypeScript — which is precisely where DTO/view-model shape bugs
live.

**More MUI v6→v9 drift.** `@mui/icons-material/ErrorOutline` does not exist in v9; it ships
as `ErrorOutlineOutlined`. Same class as the earlier `Stack` `gap`/`alignItems` props being
silently dropped. Assume any icon or prop taken from the v6-era handoff needs checking
against the installed version.

**A bug I introduced and caught by reading the diff:** `useChatConnection` was called twice
in `ChatApp` — once bare, once destructuring `invoke` — which would have opened **two
SignalR hub connections**. No tool flagged it; the build and typecheck were both clean.

## Verified

- **30 store assertions**: thread-selection reset, filters, overlays, snackbar, the full
  draft/reply/attachment lifecycle including file release, localStorage round-trip on
  sign-in and sign-out, and **cross-slice isolation while typing** — dispatching
  `draftChanged` leaves the `ui` and `auth` slice references identical, so nothing
  subscribed to them re-renders.
- `tsc --noEmit` clean; `vite build` clean at 1078 modules.

**Not verified: anything in a browser.** No browser tooling has been available for this
entire session. The optimistic-send and retry path, and the entity-adapter ordering, are
compile-verified only. Someone needs to send a message with the API stopped and confirm the
failed row and Retry behave as intended.

## Known issues / follow-ups

- ~~**Phase 4** moves SignalR into RTK listener middleware...~~ Done — see Update below.
- **Phase 5** — `react-virtuoso` virtualization plus memo/selector work. `MessageRow` is
  already memoized, but the payoff only lands once subscriptions are selector-driven.
- **Phase 6** — tests, now unblocked by Node 24. The first tests should cover the two bug
  classes this work produced: MUI prop/API drift and the DTO adapters.
- `api-service` is still untyped JS. It sits behind `chat-service`, so it leaks `any` at
  one boundary only, but it is the last unconverted file in `services/`.

## Update — 2026-08-03: Phase 4

### Context

Phase 4 (`680f8ae`, "move SignalR into listener middleware") does exactly what the Phase 3
follow-up flagged: the hub connection moves out of a `ChatApp` hook into an RTK
`createListenerMiddleware`, removing the last non-selector-driven state from the component.
Immediately before it, `0bb9e78` fixed a real hydration bug found by finally running the app
under the newly-unblocked test stack.

### What changed

**Bug fix first (`0bb9e78`).** `authSlice`'s `initialState` called `readStoredUser()` at
*module scope*, so `localStorage` was read once for the module's lifetime and no second
store could ever get a different session (`src/features/auth/authSlice.ts`). Hydration
moved into `makeStore`'s `preloadedState` (`src/app/store.ts`), read once per store instead
of once per process. Found because 2 of 3 new smoke tests rendered the sign-in screen
despite a session in `localStorage` — `tsc --noEmit` and `vite build` were clean the whole
time, so this class of fault is invisible to the build and only showed up once the app was
actually rendered. This is the first session in which rendering the app was possible at all
(Node 24 unblocked the test stack).

Test infra added in the same commit: `vitest.config.ts`, `src/test/setup.ts` (shims
`matchMedia` and `scrollIntoView`, absent from jsdom, needed by MUI's `useMediaQuery` and the
message list), `src/test/smoke.test.tsx` (3 tests). `makeStore` is exported so a test can
build an isolated store.

**Realtime middleware (`680f8ae`).** New `src/features/realtime/realtimeSlice.ts` and
`src/features/realtime/signalrMiddleware.ts`; `src/features/realtime/useChatConnection.js`
deleted. Verified: the deleted hook is gone from the tree and the two new files exist as
described.

- `realtimeSlice.ts:14-21` — `RealtimeState` holds `status` (connection state), `live`
  (`Record<threadId, Partial<Thread>>` overlay of hub-derived patches: presence, `isTyping`,
  message preview/time, `avatarFileName`, `name`), `unread` (still `// MOCK`, per
  `realtimeSlice.ts:17`), and `typingIn`.
- `signalrMiddleware.ts:23` creates one `createListenerMiddleware()` instance; the
  connection itself is a module-level `let connection` (`:27`), not slice state, since a
  `HubConnection` isn't serializable.
- Two listeners (`:143`, `:152`): one matches `signedIn` **or** `realtimeStarted` (the latter
  dispatched at boot when a session was restored from storage) and opens the connection; the
  other matches `signedOut` and tears down.
- `connect()` (`:47-140`) registers eight `c.on(...)` handlers, all reading current state via
  `getState()`/`chatApi.endpoints.getThreads.select()(getState())` (`threadsOf()`, `:60-61`)
  rather than closing over anything — this is what removes the old rebuild-on-every-thread-
  change problem, since the handler closure itself never needs rebuilding.
- `teardown()` (`:36-45`) explicitly `c.off()`s all eight event names before `c.stop()` —
  the deleted hook never did this, a leak now fixed structurally rather than patched.
- `invokeHub()` (`:30-34`) is exported for the two outbound calls (`OnTyping`/`OnStopTyping`)
  and is fire-and-forget (`.catch(() => {})`), used from `ChatApp.jsx:112-123`. This is the
  one place `ChatApp` still touches anything hub-related — it imports `invokeHub`, not
  `@microsoft/signalr` itself, and holds no hub-derived state.
- `store.ts:31` — `getDefault().prepend(realtimeMiddleware.middleware).concat(chatApi.middleware)`.
  Prepending puts the realtime listener ahead of the RTK Query middleware in the dispatch
  chain, so a hub event's cache patch (`chatApi.util.updateQueryData`/`invalidateTags`) is
  applied before an in-flight query's own update, avoiding a race.
- `ChatApp.jsx:96-98` — `decorated = threads.map(t => ({ ...t, ...(live[t.id] ?? {}),
  unread: unread[t.id] ?? 0 }))`, memoized on `[threads, live, unread]`. This is the merge
  point: RTK Query's `threads` (server truth) layered with the realtime overlay and the mock
  unread counts, computed once per render instead of on every hub event forcing a thread-list
  refetch.
- Confirmed via `grep -c useState src/app/ChatApp.jsx` → `0`; file is 261 lines (was 371 pre-
  Phase-2, per the original note).

### Decisions and trade-offs

- **Overlay, not cache invalidation.** A presence flip or typing indicator patches
  `realtimeSlice.live` rather than invalidating the `Threads` RTK Query tag, specifically to
  avoid a network-shaped refetch for what is a local, hub-pushed patch. The trade-off: `live`
  can now diverge from server truth if a patch is dropped, since nothing ever reconciles it
  back to the server picture except a fresh thread fetch invalidating the base list (the
  overlay itself is never cleared on refetch except via `realtimeReset` on sign-out).
- **Handlers read `getState()` at call time, not closure-captured state** — the direct fix
  for the Phase 3 follow-up item; this is what makes the connection safe to create exactly
  once per session instead of once per render.
- **Module-level `connection` variable, not slice state.** A `HubConnection` object isn't
  serializable, so keeping it out of Redux state avoids the same class of problem the
  Phase 2/3 note already flagged for `File` objects in the composer slice.

### Verified

- `npx vitest run` → 1 file, 3 tests passing (matches commit message).
- `npx tsc --noEmit` → clean, no output.
- `npx vite build` → clean, **1079 modules transformed** (matches commit message; up from
  1078 pre-Phase-4 per the prior note, consistent with the two new realtime files).
- Read `signalrMiddleware.ts` and `realtimeSlice.ts` in full; confirmed prepend/concat
  ordering in `store.ts:31`; confirmed `useChatConnection.js` is deleted from the tree;
  confirmed `ChatApp.jsx` has zero `useState` and imports `invokeHub` (not `@microsoft/signalr`
  directly) for the two outbound typing calls.
- `src/test/smoke.test.tsx` mocks `@microsoft/signalr` (`:9`) and `@/services/chat-service`
  (`:28`, with a comment noting every API call goes through it) — confirmed the middleware
  runs for real in tests with only the socket faked, not the app's own SignalR usage.

**Not verified: the realtime path against a live hub.** No two-browser session, no manual
presence/typing round trip since the middleware rewrite. This remains the main outstanding
risk noted for this phase — the smoke tests exercise middleware wiring, not hub semantics.

### Known issues / follow-ups

- **Phase 5** — `react-virtuoso` virtualization plus memoize/selector-driven subscriptions
  — still outstanding, unchanged from the prior note.
- **Phase 6** — expand test coverage beyond the 3 smoke tests; realtime handler behavior
  (presence, typing, unread bump, avatar/profile broadcast) currently has no dedicated
  coverage beyond "the app renders and the middleware is wired."
- Manually verify the hub round trip (two sessions, one signs in/sends/types/goes offline)
  before relying on this phase in production — the automated coverage does not reach it.

## Update — 2026-08-03: Phase 5

### Context

Phase 5 (`169623c`, "make memoization effective and virtualize the message list") fixes a
finding worth stating plainly: **the `React.memo` wrapped around `MessageRow` back in Phase
1 was doing nothing.** `ChatApp` passed `onReact`/`onReply` as inline arrow functions and
redefined `handleRetry` on every render, so `React.memo` compared fresh function identities
every time and every row re-rendered regardless. Memoizing a component without stabilising
the callbacks handed to it is decorative, not a real optimization — this is an easy mistake
to reintroduce, e.g. by adding a new inline handler prop to a memoized row later.

### What changed

- `src/app/ChatApp.jsx` — nine handlers wrapped in `useCallback`: `notify` (:86),
  `selectThread` (:103), `handleTyping` (:113), `handleSend` (:122), `handleRetry` (:131),
  `handleReact` (:141), `handleReply` (:146). `onReact`/`onReply` are passed as these stable
  references at the JSX call site (:238-239) instead of inline arrows. A code comment at
  :110-112 states the reason directly, for whoever edits this next.
- `src/features/threads/ThreadListItem.tsx` — **new**, extracted from `ThreadList`'s inline
  `.map()` and wrapped in `memo()` (:66). Previously a hub event patching one thread's
  presence re-rendered every row in the list. It binds its own click handler with
  `useCallback` (:24) so the parent (`ThreadList.jsx:119-127`) can pass one stable `onSelect`
  for every row rather than an arrow per row, which would defeat the memo the same way the
  `MessageRow` callbacks did.
- `src/features/messages/MessageList.tsx` — **new**, encapsulates both the loading-skeleton
  and message-rendering paths that previously lived inline in `ConversationPane`. Virtualizes
  with `react-virtuoso` `^4.18.11` (`package.json:18`) above `VIRTUALIZE_ABOVE = 200`
  messages (:15), per the handoff brief's "if threads can exceed ~200 messages." Below the
  threshold it renders plainly (:93-100) — Virtuoso's measurement pass and the
  scroll-anchoring behavior of variable-height rows cost more than they buy at that size. The
  `Virtuoso` instance is `key={threadId}` (:80) so scroll position and measurement caches do
  not leak between conversations, and uses `initialTopMostItemIndex={messages.length - 1}` +
  `followOutput="smooth"` (:84-85) to match the non-virtualized path's scroll-to-bottom
  behaviour.
- `src/features/messages/ConversationPane.jsx` — simplified: the inline message map and
  five-skeleton loading block were removed in favor of rendering `<MessageList ... />`
  (:114-124), passing `threadId={thread.id}` through for the virtualizer's remount key.

### The proof (previous phases asserted perf wins; this one measures)

New `src/test/rerender.test.tsx` mocks `MessageBody` (a leaf inside `MessageRow`) with a
render counter (:14-20) — a faithful probe, since a `MessageRow` re-render always re-renders
its `MessageBody` child. Two assertions against 20 messages and `stableProps` built to mirror
exactly what `ChatApp` now passes (:49-57, comment: "Stable identities, exactly as ChatApp
now provides via `useCallback`"):

- mount renders each message body exactly once (`bodyRenders === messages.length`);
- five `fireEvent.change` keystrokes into the composer (via `screen.getByLabelText('Message
  Maya')`) produce **zero** additional message-body renders, because the draft lives in
  `composerSlice` and only `Composer` subscribes to it.

The test's own comment states the before-state: every keystroke previously re-rendered all
twenty rows.

### Decisions and trade-offs

- **200-message virtualization threshold, not "always virtualize."** Chosen to match the
  handoff brief's language exactly, and because plain rendering measurably avoids Virtuoso's
  overhead for the common case of a short thread — a threshold, not a magic number picked at
  random.
- **Bundle cost accepted, flagged for later.** Gzip size went from 208 kB to 260 kB per the
  commit message; `react-virtuoso` is most of the increase and only earns its weight in
  threads that actually exceed the threshold. Worth revisiting with a dynamic `import()` if
  long threads turn out to be rare in practice — not done in this phase.
- **`ThreadListItem` binds its own click handler** rather than having `ThreadList` build a
  per-row closure, for the same reason `ChatApp`'s handlers moved to `useCallback`: a
  memoized component is only as effective as the stability of what is passed into it.

### Verified

- `npx vitest run` → 5 tests passing across 2 files (`smoke.test.tsx`'s pre-existing 3 +
  `rerender.test.tsx`'s new 2), matching the commit message.
- `npx tsc --noEmit` → clean.
- `npx vite build` → clean, 1082 modules (up from 1079 pre-Phase-5, consistent with the two
  new files).
- Read `ChatApp.jsx`, `ThreadListItem.tsx`, `MessageList.tsx`, `ConversationPane.jsx`,
  `ThreadList.jsx` and `rerender.test.tsx` in full; confirmed the `useCallback` wrapping, the
  extraction, the virtualization threshold and keying, and that the test's `stableProps`
  match what `ChatApp` now actually passes.

**Not verified: anything in a real browser this session**, and **the realtime path has not
been round-tripped against a live hub since the Phase 4 middleware rewrite** (still needs two
browser windows as different users). Both remain the main outstanding risks, unchanged from
the Phase 4 update.

### Known issues / follow-ups

- **Phase 6** — the last phase. Expand test coverage beyond the current smoke (3) + rerender
  (2) tests. The stack (vitest 4, jsdom 30, RTL) is already in place from Phase 4; nothing
  further needs installing.
- Bundle-size trade-off above: consider a dynamic import for `react-virtuoso` if it turns out
  most threads never cross the 200-message threshold in practice.
- The live-hub manual round trip flagged in the Phase 4 update is still outstanding and still
  the biggest real-world risk in the stack — nothing in Phase 5 touched or reduced it.

## Update — 2026-08-03: Phase 6 (final)

### Context

Phase 6 (`15b8246`, "cover slices, adapters, date formatting and MUI drift") closes out the
7-phase (0-6) refactor with the first real test coverage of the client: 5 tests in 2 files
(`src/test/smoke.test.tsx`, `src/test/rerender.test.tsx`) become 56 tests in 6 files. Four
new suites, each aimed at a bug class this project actually hit rather than at coverage for
its own sake.

### What changed

- **`src/app/store.test.ts`** (18 tests) — reducer/selector coverage for all four slices.
  The load-bearing case is `store.test.ts:89-99`, `'leaves every other slice reference
  identical while typing'`: dispatching `draftChanged` must change only `state.composer`,
  or the memoized message rows from Phase 5 would re-render on every keystroke — this test
  is the automated proof of the Phase 5 rerender guarantee at the reducer level. Also covers
  the Phase-4 authSlice hydration regression directly (`store.test.ts:117-131`, `'hydrates
  per store, not once per module'`) and that `File` objects never enter the store
  (`store.test.ts:69-83`, via the module-level `Map` + `registerDraftFile`/`takeDraftFile`
  from the Phase 2/3 composer design).
- **`src/services/adapters.test.ts`** (18 tests) — the DTO -> view-model seam. Pins the
  backend's misspelled `oponentVM` field (`adapters.test.ts:16`), the `"No messages"` string
  sentinel the backend returns instead of an empty last message (`:43-48`), null
  opponent/null lastMessage survival (`:50-55`), a stable deterministic avatar colour
  (`:57-60`), out-of-order day-key sorting in `toMessageList` — object key order is not
  guaranteed for arbitrary string keys, so the adapter must sort rather than trust insertion
  order (`:95-113`) — `startsDay` tagging only the first message of each day (`:115-118`),
  `toLiveMessage` never tagging a day since a hub message has no day context (`:126-130`),
  and `currentUserId()` degrading to `null` rather than throwing on malformed `localStorage`
  (`:147-155`).
- **`src/lib/date-time-format.test.ts`** (15 tests) — regression suite for a real bug in the
  pre-refactor implementation: it compared `new Date().getDate()` with `new Date(iso)
  .getDate()`, i.e. day-of-month rather than a date. On the 3rd of a month, anything from the
  previous month gave `3 - 31 = -28`, matched no switch branch, and returned `undefined` — a
  blank timestamp in the thread list for every message older than two days. The test clock is
  fixed to `new Date(2026, 7, 3, 12, 0, 0)` specifically because the 3rd is where it bit
  (`date-time-format.test.ts:19`, `:35-41`). Also covers the 2-6 day range that the original's
  `case (numberOfDays > 1 && numberOfDays < 7)` — a boolean compared against a number inside a
  `switch` on a number — could never match (`:69-76`).
- **`src/test/mui-drift.test.tsx`** (10 tests) — guards the MUI v9 API-drift bug class that
  cost the most time in this project: `Stack gap` (the redesign), then
  `alignItems`/`justifyContent`/`textAlign`/`flexWrap`/`flex`, then
  `primaryTypographyProps`/`imgProps`, then `ErrorOutline` (Phase 3, noted in this file's
  Phase 3 section above). v9's `Stack` accepts no system props. The first draft of this test
  asserted the wrong thing, per its own comment (`mui-drift.test.tsx:8-16`): React 19 forwards
  **both** unknown props to the DOM as lowercase attributes — `gap="2"` and
  `alignitems="center"` both appear in the markup (`:38-39`). The only asymmetry is
  diagnostics — React warns for the camelCase one and says nothing about `gap` — which is why
  `gap` survived review while `alignItems` announced itself in the console. The committed test
  asserts the real failure mode instead: `getComputedStyle` shows the styles are simply not
  applied (`:32-33`), while both props land as junk DOM attributes anyway. The suite also pins
  the handoff theme tokens — custom palette background slots, the `custom` bag, `densityTokens`,
  `initials`, `avatarColor`, `PRESENCE` (`:55-75`) — and covers `PresenceAvatar` fallback-to-
  initials / uploaded-image / presence-dot opt-out behaviour, including that `presence="group"`
  opts out of the dot without a second prop (`:99-101`).
- **`src/theme/theme.d.ts`** — **new**, a MUI module augmentation declaring the handoff's
  extra `TypeBackground` slots (`chat`, `field`, `quote`, `selected`, `skeleton`) and the
  top-level `custom` bag on `Theme`/`ThemeOptions` (`theme.d.ts:12-37`). Its own comment states
  why `theme/tokens.js` was deliberately left as JS during the TypeScript conversion: without
  this augmentation, every `theme.custom.*` and `palette.background.chat` read is a type error.
  Those reads were previously untyped across the whole app; a future MUI major renaming a slot
  now fails `tsc` instead of silently rendering wrong.

### Decisions and trade-offs

- **Assert the actual failure mode, not the first hypothesis.** The `mui-drift` test's first
  draft would have asserted that `gap` and `alignItems` behave differently on the DOM (one
  present, one absent) — which is false under React 19. Corrected to assert what actually
  breaks the UI (computed styles unaffected) rather than a DOM-attribute difference that does
  not exist. Worth remembering next time a "React should warn about this" assumption is used
  as a test oracle.
- **Fixed system clock via `vi.setSystemTime`, pinned to the exact day the bug reproduced
  on** (`date-time-format.test.ts:19`) rather than a relative `new Date()` — makes the
  regression reproducible instead of only failing on the 3rd of whichever month CI happens to
  run on.
- **Theme augmentation lives in a separate `.d.ts`, not inline in `tokens.js`.** Keeps
  `tokens.js` as plain JS (unchanged from Phase 3's stated reason) while still typing every
  consumer of `theme.custom`/`palette.background.*` app-wide.

### Verified

- `npx vitest run` → **6 files, 56 tests passing** (matches the summary and the commit
  message).
- `npx tsc --noEmit` → clean, no output.
- `npx vite build` → clean, **1082 modules transformed**, `dist/assets/index-*.js` **825.54 kB
  raw / 260.34 kB gzip** (exact match to the reported figures). The build still emits the
  chunk-size warning above 500 kB — no code splitting yet, unchanged from the Phase 5 note's
  flagged follow-up.
- Read all four new test files and `theme.d.ts` in full; confirmed the specific line-level
  claims above (cross-slice isolation assertion, hydration-per-store test, `oponentVM`/`"No
  messages"` fixtures, the fixed-clock month-boundary case, the dead-switch-branch loop, and
  the `getComputedStyle`/`getAttribute` pair in `mui-drift.test.tsx`).
- `package.json` scripts confirmed: `test` -> `vitest run`, `test:watch` -> `vitest`,
  `typecheck` -> `tsc --noEmit`. Stack versions confirmed from `package.json`: vitest
  `^4.1.10`, jsdom `^30.0.1`, `@testing-library/react` `^16.3.2`.

**Not verified: anything in a real browser this session.** The SignalR realtime path has
still not been round-tripped against a live hub since the Phase 4 middleware rewrite (needs
two browser windows signed in as different users) — this has now carried unresolved across
Phases 4, 5 and 6. `src/features/realtime` has no dedicated hub-semantics test; the signalr
module is only mocked (never exercised for real) across the whole suite.

### Known issues / follow-ups

This closes the planned 0-6 phase list. Outstanding items carried forward, none introduced by
Phase 6:

- **Live-hub manual round trip** (two browser sessions, one signs in/sends/types/goes
  offline) — flagged since the Phase 4 update, still the single biggest unverified risk in the
  stack.
- **Bundle size / code splitting** — 260 kB gzip, `react-virtuoso` is most of the Phase 5
  increase; a dynamic `import()` was considered and deliberately deferred, not done here
  either.
- `api-service` is still untyped JS (flagged since the original Phase 3 note) — outside this
  phase's scope, since Phase 6 tested the seam (`adapters.ts`) rather than the HTTP layer
  beneath it.
