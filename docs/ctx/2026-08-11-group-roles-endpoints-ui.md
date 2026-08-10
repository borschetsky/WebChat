# Group roles land: endpoints, UI, and the owner-less group the migration hid

- **Date:** 2026-08-11
- **Type:** change
- **Scope:** Server — `WebChat.Services/GroupService.cs` + `IGroupService.cs` (new `Get`),
  `WebChat/Controllers/ConversationsController.cs` (new `GET`), `WebChat/SystemDataJson.cs`
  (new), `WebChat.Services/ThreadService.cs`, `WebChat.Data/ViewModels/{MessageViewModel,
  LastMessageViewModel}.cs`, `WebChat/Controllers/{ThreadController,HeyController}.cs`,
  `WebChat.Tests/Threads/GroupCreationRoleTests.cs` (new). Client —
  `src/app/api/chatApi.ts`, `src/services/{chat-service.ts,api-service.js,adapters.ts}`,
  `src/types/{dto.ts,models.ts}`, `src/features/threads/{GroupInfoDrawer.tsx,
  groupPermissions.ts}` (both new), `src/features/realtime/{signalrMiddleware.ts,
  groupEvents.ts}` (groupEvents new), `src/features/messages/{systemMessage.ts,
  SystemMessageRow.tsx}` (SystemMessageRow new) + `MessageList.tsx` + `ConversationPane.jsx`,
  `src/features/ui/uiSlice.ts`, `src/components/SectionLabel.tsx`, `src/app/ChatApp.jsx`,
  `src/test/{system-message.test.ts,group-permissions.test.ts}`. Second and final slice of
  issue #63.
- **Status:** done — endpoints, mutations, live events and the drawer UI are all wired and
  verified live; a few gaps are named below and left deliberately.

## Context

The first slice (`2026-08-10-group-roles-model.md`) built the role/permission model but
wired it to nothing — no endpoint read it, no mutation enforced it, no UI drew it. This
slice is `SPEC-groups-and-admin.md` §3-4 and `SPEC-group-wire-contract.md`: the five
mutations, the read endpoint the client needs to draw them, and the drawer itself.

## What changed

- `GET /api/conversations/{groupId}` (`ConversationsController.cs`) returns the wire
  contract's `Group` shape, refusing a non-member with the same `NOT_A_MEMBER` a mutation
  gives — so it is not usable as an oracle for which group ids exist. Members carry
  `avatarFileName` and `isOnline` beyond the contract's `Member` shape (`ConversationsController.cs:77,81`)
  so the drawer needs no cross-reference against `getthreads`, which excludes the caller and
  carries no roles — neither list is a superset of the other. Presence comes from
  `IConnectionMapping`, not a stored column.
- Six RTK Query operations in `chatApi.ts` (`getGroup` query + five mutations), all through
  `fakeBaseQuery`/`queryFn` so the chat-service seam holds, each carrying `If-Match`.
  Concurrency per spec §4: a `VERSION_CONFLICT` is retried **once** against the version the
  409 carried (`chatApi.ts:101` parses the conflict body), then the error surfaces — the UI
  decides a *surviving* conflict is not worth a snackbar
  (`groupErrorCode !== 'VERSION_CONFLICT'`), while a shared `onQueryStarted` still adopts the
  server's group into the cache via `chatApi.util.upsertQueryData('getGroup', ...)` on both
  success and a surviving conflict, and inserts the actor's own system message because the
  hub broadcast deliberately excludes the actor.
- `GroupInfoDrawer.tsx` (new) implements spec §3: no pencil for someone who cannot rename
  (static text plus a lock line from `perms.rename`), read-only value rows instead of
  disabled controls for non-owners, `'Everyone'` rendered dim rather than primary as the
  permissive default, the overflow button **absent** (not disabled) when the computed action
  list is empty, `'Transfer ownership before leaving'` for the owner.
- `groupPermissions.ts` (new) mirrors the server's `GroupPermissions` client-side, decision
  only (no I/O) — an unrecognised level denies, matching the server.
- `groupEvents.ts` (new) + `signalrMiddleware.ts`: version-gap detection (more than one
  version ahead of cache ⇒ refetch rather than apply a partial patch),
  `conversation.joined`/`removed` handled as distinct cases, and `onreconnected` invalidates
  `Threads`/`Group`/`Messages` because nothing is buffered while the socket is down.
- System messages made visible end to end: `SystemDataJson.cs` (new) centralizes both
  parsing stored `SystemData` JSON and resolving user ids to names
  (`NamesFor`/`NamesIn`, walking the `userId`/`userIds`/`fromUserId`/`toUserId` keys the
  spec's §2 schemas define) into a `systemNames` map sent alongside `systemData` — an
  object, not a string, on the wire. `MessageViewModel`/`LastMessageViewModel` gained
  `Type`/`SystemKind`/`SystemData`/`systemNames`; `LastMessageViewModel` also gained
  `Username`. `SystemMessageRow.tsx` (new) renders the resolved sentence; deliberately no
  `role="status"` because `ConversationPane.jsx:173-175` already wraps the list in
  `role="log" aria-live="polite"` and a nested live region would double-announce.
- `ThreadService.AddParticipants` (`ThreadService.cs:128`) gained an optional `ownerId`
  parameter so the creation path, not just the migration backfill, assigns `GroupRole.Owner`.
- `ThreadService.GetThreadMessages` (`ThreadService.cs:163`) no longer wraps the
  request-scoped, injected `DbContext` in `using (ctx)`.

## Bugs found — all three by running the app, not by tests

1. **Newly created groups had no owner.** The #63 migration backfilled `OwnerId` into
   `GRole` for *existing* threads, which made the model look correct against a database that
   already had groups and hid that the creation path still wrote every participant at the
   `ThreadParticipant.GRole` column default (`member`). Every group created after the
   migration violated the model's one invariant. Found by fetching a fresh group through the
   new `GET` and reading `gRole` on the creator. Fixed by threading an `ownerId` through
   `AddParticipants`; `GroupCreationRoleTests.cs` is the regression test, proven to fail
   before the fix ("Expected: owner / Actual: member") — confirmed present in the repo and
   passing now (`dotnet test WebChat.Tests`: 123 passed / 2 skipped / 125 total). General
   lesson worth keeping: a migration that backfills existing rows is only half the change —
   the write path needs the same rule, and a backfill that succeeds actively disguises the
   write path's absence.
2. **`getmessages` and the `getthreads` preview stripped system fields.**
   `MessageViewModel`/`LastMessageViewModel` had no `Type`/`SystemKind`/`SystemData`, so
   stored system rows arrived as ordinary messages with null text and rendered as blank gaps
   or "No messages yet". Fixed by projecting the fields and re-parsing the JSON in the host
   (`SystemDataJson.cs`) so all three routes (`getmessages`, `getthreads`, the new group
   `GET`) send one wire shape.
3. **Names in system messages degraded to "someone" the moment they mattered.** The client
   had resolved ids against the thread's *current* members, so "You removed Maya" became
   "You removed someone" the instant it was true, and every older message naming her
   degraded with her. Fixed by resolving ids to names server-side at *read* time into
   `systemNames`, not stored — preserving both spec goals: no frozen prose, and a renamed
   user shows their new name in old messages too.

## A latent bug this exposed (pre-existing, not new)

`ThreadService.GetThreadMessages` disposed the injected, request-scoped `DbContext` via
`using (ctx)`. Harmless for as long as nothing used the context afterwards in the same
request — the moment the controller resolved a display name after that call (needed for
`Username`/`systemNames`), every `getmessages` answered 500 `ObjectDisposedException`.
Removed; confirmed it was the only such site in the repo (grepped for `using (ctx)` across
`ThreadService.cs` — no other match). DI owns a scoped context's lifetime; "it has always
worked" only meant nothing had ever run after it in the same scope.

## Decisions and trade-offs

- Group endpoints return `text`, not the spec's `body`: `getmessages` already returns that
  field under that name and system messages arrive through the same route, so a second name
  for one field would mean the client reading a different key depending on the route.
- `Group` is a separate RTK Query cache entry from `Thread`, not extra fields merged onto
  it — `version` is a concurrency token, and one going stale silently in a list of forty
  cached thread rows is worse than not having it. `getGroup` is only subscribed while the
  drawer is open.
- `systemNames` is a sibling map, not names inlined into `systemData`, keeping `systemData`
  pure facts as the spec requires.
- `onGroupMutation`'s dispatch is typed structurally, not as `AppDispatch`: the store's type
  derives from this API's own reducer and middleware, so naming `AppDispatch` inside it made
  `chatApi` reference itself through the store and TypeScript gave up inferring either
  (TS2502/TS7022/TS7023 across `chatApi.ts` and the store).
- Search excludes system messages explicitly (`m.Type != MessageType.System`) rather than
  relying on `Text` being null, which happens to work today and would stop working the
  moment a system row gained text.

## Verified

- `dotnet build WebChat.sln --no-incremental -warnaserror`: 0 warnings. (Building only the
  `WebChat` project directly failed with `RAZORSDK1007`/`CS0006` reference-assembly errors —
  a stale-artifact ordering issue in a partial rebuild, not a real error; building the `.sln`
  resolved it cleanly.)
- `dotnet test WebChat.Tests`: 125 tests, 123 passed, 2 skipped (SMTP integration) —
  reproduced directly, matches the reported count.
- Client `npm run verify`: 132 tests across 13 files, lint/format/typecheck all clean —
  reproduced directly.
- Against the live docker stack via curl (per the handoff, not independently re-run here):
  every mutation and refusal path — `PERMISSION_DENIED` for a member renaming under
  `perms=admins`, `VERSION_CONFLICT` carrying the current group on a stale `If-Match`,
  `LAST_OWNER` when the owner tries to leave, a member successfully renaming once perms open
  to `'everyone'`, ownership transfer demoting the previous owner in the same transaction,
  then that ex-owner leaving.
- In a real browser across all three roles (owner/admin/member): owner sees the pencil,
  segmented permission controls and `'Transfer ownership before leaving'`; member sees
  static text, the lock line, read-only value rows and `'Leave group'`; the overflow button
  appeared only on rows with an available action, and its menu contained only `'Remove from
  group'` for a member once `perms.remove` was `'everyone'`. Removing a member updated the
  drawer, message list and thread preview together.
- Two cosmetic defects found and fixed in the browser: the conversation header read "1
  members" (counted `thread.members`, which excludes the viewer), and the drawer's rename
  control showed the browser's default button border.

## Known issues / follow-ups

- **Add-members has no UI yet.** The mutation and endpoint exist, but nothing in the drawer
  invites people, so `perms.invite` is currently unreachable from the client.
- **Audit entries (spec §1.7) are deferred to #64.**
- **No test drives `GroupInfoDrawer` through React** — covered only by the pure
  `groupPermissions`/`groupEvents` unit tests plus the manual browser pass.
- The retry-once conflict path and the version-gap refetch were unit-tested at the
  `applyGroupEvent` level and reasoned through, but never exercised against two genuinely
  concurrent clients.
- **Mobile treatment from spec §5** (bottom sheets for the role menu and rename, full-screen
  sheet) is not implemented; the drawer is the desktop layout at 100% width on mobile.

## Relationship to the first slice

This closes out `2026-08-10-group-roles-model.md`'s "Status: partial" and its "Known
issues / follow-ups" list: endpoints, the five mutations, system messages, and the UI all
now exist and are wired to the model built there. That note's status line has been updated
to point here rather than being rewritten. The direct-thread `GRole = 'member'` observation
and the general model decisions in that note are unaffected and still hold.
