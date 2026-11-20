# Entra users could not send: the client read its user id from localStorage

- **Date:** 2026-11-20
- **Type:** change (bug fix)
- **Scope:** `WebChat/WebChat/ClientApp/src/services/adapters.ts`, `src/app/store.ts`, `src/test/session-user-id.test.ts`; `CLAUDE.md` auth bullet
- **Status:** done on branch `hotfix/entra-sender-id` (commit `e7ada99`). Not pushed or merged; production (chat.vtechsolutions.site) does not have the fix.

## Context
Found during the Azure SignalR spike: a second (password) user messaged an Entra user. Delivery to the Entra user worked, but their replies failed. `POST api/hey/send` answered 400 (`application/problem+json`, the automatic `[ApiController]` validation) and the client showed "Not sent" on every retry. Password users were unaffected.

## What I found
- `currentUserId()` in `adapters.ts` used to read the id from localStorage `user-data`. `authSlice` writes that key for local (password) sessions only (`authSlice.ts:5`). External sessions are deliberately never persisted there, because MSAL's cache restores them (phase 3 decision, see [2026-11-17-entra-id-client.md](2026-11-17-entra-id-client.md)). So the function returned `null` for every Entra user.
- `chat-service` `sendMessage` therefore posted `senderId: null`, and `MessageViewModel.SenderId` is `[Required]` (`WebChat.Data/ViewModels/MessageViewModel.cs:12-13`), so the request was refused with a 400.
- The same `null` was the default `meId` for the adapters `toThread`, `toGroup`, `toMessage` and two more (defaults at `adapters.ts:65,142,155,186,221,294`), and for `MessageList`'s render. That is 9 call sites. For Entra users "own message", opponent and member attribution were wrong as well as sending. The send 400 was only the loudest symptom.
- Audit: a grep for `localStorage`/`sessionStorage` `getItem` in non-test `src` found only `authSlice`'s startup hydration (legitimate) and `ThemeModeProvider`. Request tokens are always passed explicitly via `auth-header.ts`. No other reader of the stale key.

## What changed
- `adapters.ts:51-57`: a module-level `sessionUserId` with `setCurrentUserId()`. `currentUserId()` returns it.
- `store.ts:20-30`: `makeStore` calls `setCurrentUserId(auth.user?.id ?? null)` immediately and on every `store.subscribe` change, so sign-in, token renewal, rehydration and sign-out all land without each action remembering to.
- `src/test/session-user-id.test.ts` (3 tests): an external id is visible with nothing in localStorage; it follows sign-out; `sendMessage` posts `senderId: 'u-ext'` and marks the message own.
- `CLAUDE.md` auth bullet: localStorage `user-data` holds password sessions only, and the user id must come from the store.

## Decisions and trade-offs
- **Mirror the id into adapters instead of importing the store there.** The store imports the API slices, which import the adapters, so importing the store would be a cycle.
- **Sync on every store change rather than in specific actions.** `tokenRefreshed` is deliberately not `signedIn`, and rehydration has its own path. A per-action sync would miss one.
- Rejected: writing external sessions to localStorage. It would undo the phase 3 decision and could hold a stale token against MSAL's cache.

## Verified
- Test proved failing first against the unfixed code: `expected null to be 'u-ext'`, and `sendMessageToApi` not called with `senderId: 'u-ext'`.
- `npm run verify` passed (lint, format, typecheck, 349 tests, build).
- A second `verify` run failed one unrelated test, a pre-existing timing flake. `avatar-remove.test.tsx` "is reachable from the avatar menu and calls the endpoint" (`findByText('Test User')`, 1s timeout) failed, and once `snackbar-a11y` "a message-only snackbar is not inside an aria-hidden subtree" did too. On master's own code `avatar-remove` failed 1 run in 3, so the flake predates this change. Not fixed here.
- Not verified: a browser re-test of sending as an Entra user with the fix. The local stack was not running at commit time. Nothing deployed.

## Known issues / follow-ups
Both are separate, pre-existing, and NOT fixed on this branch.
1. **SECURITY: send does not bind the sender or check membership.** `HeyController.SendMessage` (`HeyController.cs:51-66`) passes the request body to `MessageService.AddMessage`, which maps and stores `message.SenderId` from the body (`MessageService.cs:26-31`). Nothing checks that the caller is a participant of `ThreadId`. Any authenticated user can post into any thread attributed to anyone. Only the response and the hub echo take `SenderId` from the token (`HeyController.cs:63-66`). This is the same class as #99 (an id in a request body deciding which row is written). Take the id from `User.Identity.Name` and check membership.
2. **MSAL v5 silent renewal after the 24h SPA refresh token expires fails.** It raises `BrowserAuthError` `timed_out` / `redirect_bridge_timeout`, because the app has no redirect-bridge page (`@azure/msal-browser/redirect-bridge`, `broadcastResponseToMainFrame`). `resume()` reports that as an error rather than returning null. The stale cached account then sends `login_hint` and Entra answers "We couldn't sign you in". Reported, not reproduced or checked in this pass.
