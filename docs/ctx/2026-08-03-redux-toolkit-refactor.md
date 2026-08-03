# Redux Toolkit + RTK Query refactor of the client

- **Date:** 2026-08-03
- **Type:** change
- **Scope:** `WebChat/WebChat/ClientApp` — `app/`, `features/`, `services/`
- **Status:** Phases 2–3 done; 4–6 outstanding

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

- **Phase 4** moves SignalR into RTK listener middleware; the hub handlers still live in
  `ChatApp` and close over `threads`, which is why they are rebuilt on every thread change.
- **Phase 5** — `react-virtuoso` virtualization plus memo/selector work. `MessageRow` is
  already memoized, but the payoff only lands once subscriptions are selector-driven.
- **Phase 6** — tests, now unblocked by Node 24. The first tests should cover the two bug
  classes this work produced: MUI prop/API drift and the DTO adapters.
- `api-service` is still untyped JS. It sits behind `chat-service`, so it leaks `any` at
  one boundary only, but it is the last unconverted file in `services/`.
