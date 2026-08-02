# MUI redesign of the chat client

- **Date:** 2026-08-03
- **Type:** change
- **Scope:** `WebChat/WebChat/ClientApp` (whole `src/` tree)
- **Status:** done, with visual verification outstanding

## Context

A design handoff (`design_handoff_chat_mui`, delivered as a zip) redesigns the chat client
onto MUI. It ships a README of tokens and screen specs, an interactive HTML reference, and
a 700-line runnable React + MUI implementation built against fixture data. The task was to
port it into the real app, on the latest MUI, mocking anything the backend cannot support.

The README's closing line points at a `CLAUDE.md` in the handoff folder as "the task brief
(order of work, ground rules, definition of done)". **That file is not in the zip.** The
phase order below is a reconstruction from the README; if the brief surfaces, it should win.

## What I found

**Three of the client's seven dependencies were dead.** `@material-ui/core` and
`@material-ui/icons` had zero imports anywhere in `src` - the only reference was a
`<script>` tag in `index.html` that was already inside an HTML comment - and `sudo`, a Node
process-elevation package, had no business in a browser bundle. This collapsed the
estimate: the feared "Material-UI v3 to v5 migration" did not exist. An earlier note called
that the largest remaining work item; it was wrong.

**The handoff targets MUI v6.1; latest is v9.2.** The portability risk was whether v9's
`createTheme` would keep the handoff's non-standard keys - `theme.custom` and the extra
`palette.background.*` entries the entire design leans on. Verified: they survive, as does
`alpha()`. That was the single largest unknown and it is settled.

**Backend coverage is roughly two thirds.** Real: auth, thread list, messages, send,
in-thread search, directory search, thread creation, profile, avatar upload, presence
(binary), typing. Absent: group threads, unread counts, read receipts, reactions,
reply/quote, message attachments, notifications, and the design's `away` presence state.

**The old `Dashboard` leaked SignalR subscriptions.** It called `connection.on(...)` for
eight hub events and never called `off(...)`, so every remount stacked another
subscription and each message fired once per mount.

**The hub echoes your own message back to you.** `HeyController` sends to
`[senderId, receiverId]`, so the REST response and the `ReciveMessage` event are the same
message - it must be deduped on id or it renders twice.

## What changed

Five commits on `feature/mui-redesign`:

| Phase | Commit | Content |
|---|---|---|
| 0 | `0d0fe83` | MUI v9.2 + emotion; `theme.js` ported verbatim from the handoff tokens |
| 1 | `66dcad5` | Data seam: `adapters.js`, `mocks.js`, `chat-service.js` |
| 2 | `0b22f2e` | `ThemeModeProvider`, `AppShell`, `PresenceAvatar`, appearance controls |
| 3 | `c01bbc9` | Every screen ported onto MUI and the real API; `useChatConnection` |
| 4 | `34e826b` | Unread counts, notifications popover, honest empty states, mock disclosure |
| 5 | *(this)* | Legacy components and stylesheets deleted |

**Architecture.** Components never touch `api-service` or `mocks` directly - everything
goes through `chat-service`, so a real feature and a mocked one are indistinguishable at
the call site. When a backend arrives, only `chat-service` and `mocks` change.

**Deleted in Phase 5:** 3 screens, 13 component folders, 15 stylesheets, the `hoc`
directory, and `default-image-service`. All twelve class components are gone; the client is
function components with hooks throughout.

## Decisions and trade-offs

**Removed handoff features that cannot work, rather than rendering dead controls.** No
"Continue with SSO" (no SSO exists), no "New group" button (a `Thread` has one
`OponentId`, so it could not create anything), and three of the five appearance switches -
desktop notifications, read receipts, quiet hours - are omitted rather than shown as
toggles that silently do nothing.

**Read receipts are gated on presence.** The design shows "Read by …" under the last own
message. Returning that unconditionally was the most actively misleading thing the mock
layer did: it contradicted the offline presence dot two rows above. It now renders only
when the other person shows as online.

**Groups get an explanatory empty state, not fabricated threads.** Inventing group
conversations would produce rows that break when clicked, since no such thread exists
server-side. The filter says groups need server support and drops the "Start a
conversation" button.

**Added a `MockDisclosure` panel** in the settings drawer listing all seven unbacked
features and the endpoint each needs. The redesign is visually complete while a third of
its interactions are fake; without this, demoing it reads as a finished product.

**react-router stays on v5.** The class-to-hooks conversion removed the blocker (v6+ has no
`withRouter`, and `useNavigate` cannot be called from a class), so v7 is now a cheap
follow-up - but it is a separate change.

**Vite stays on 6.x**, because Vite 8 needs Node ≥ 20.19 and the host is on 18.18.

## Verified

- **Phase 1, 24 assertions** over live `getthreads` / `getmessages` / `thread-search` /
  `users-search` / `getprofile` payloads: ordering, own-message detection, day tagging,
  search filtering, presence mapping, mocked fields defaulting.
- **Phase 3, 27 assertions** over `chat-service` against a live API and LocalDB: profile
  round-trip, directory search, thread creation including the duplicate path returning
  `existed=true` with the same id, send, quote and attachment via the mock layer, message
  load, in-thread search, reaction toggle on then off.
- **Phase 4, 26 assertions** over the mock layer: unread bump/clear/mark-all, receipts
  suppressed offline and present online, reaction add/coexist/remove-at-zero, attachment
  size formatting in KB and MB, quote truncation at 120 chars.
- **Phase 5, 14 regression assertions** after deleting the legacy tree - all still pass.
- **Production serving**: with `ASPNETCORE_ENVIRONMENT=Production`, the ASP.NET host serves
  the built SPA from `ClientApp/dist` - `<title>WebChat</title>`, hashed bundle resolving at
  617,107 bytes, `/dashboard` deep-link falling back to index for client routing, and
  `/api/hey/getthreads` still answering 401 alongside.
- **Build** clean at 1073 modules. CSS fell from 13.95 kB to **0.03 kB** as the legacy
  stylesheets left the graph. `npm audit` remains at 0.

**Not verified: anything visual.** No browser tooling was available in this session -
`claude-in-chrome` is listed but the Skill tool reports it unknown, and no
`mcp__claude-in-chrome__*` tools exist. Every assertion above is on data flow and markup
generation, not on how it looks. An SSR harness was attempted in Phase 2 and abandoned:
emotion needs a real style cache and the DOM shims were growing larger than the code under
test. **Someone needs to open the app and look at it.**

## Known issues / follow-ups

- **Bundle is 194 kB gzip** (was 124 before MUI) and Vite warns past its 500 kB chunk
  limit. Route-level code splitting is the obvious fix; not urgent.
- **`away` presence is unreachable.** The design has three presence states, the server
  knows connected/disconnected. The `away` colour token exists and nothing can produce it.
- **The thread-list search only matches name and preview text.** The handoff searched full
  message bodies, which would need either a server endpoint across threads or loading every
  thread's messages up front.
- **Unread counts are session-scoped by design**, so a reload silently clears them. The
  disclosure panel says so.
- **`react-router-dom` v5 → v7** is now unblocked.
- The missing handoff `CLAUDE.md` should be reconciled against this plan if it turns up.
