# Group conversations

- **Date:** 2026-08-05
- **Type:** change
- **Scope:** `WebChat.Data/ThreadParticipant.cs` (new), `Thread.cs`, `WebChat.Connection/WebChatContext.cs`,
  migration `20260805181210_AddThreadParticipants`, `WebChat.Services/ThreadQueries.cs` (new),
  `ThreadService.cs`, `IThreadService.cs`, `Helpers/Validator.cs`,
  `WebChat/Controllers/HeyController.cs`, `ViewModels/CreateGroupViewModel.cs` (new),
  `ThreadViewModel.cs`, `WebChat.Tests/Threads/ThreadAccessTests.cs` (new); client
  `services/adapters.ts`, `services/mocks.ts`, `features/threads/ComposeDialog.jsx`,
  `app/api/chatApi.ts`, `app/ChatApp.jsx`. PR #38, issue #37, commits `59f4ee7` (membership
  model) and `2bd5acd` (group creation + UI).
- **Status:** done

## Context
`Thread` had exactly `OwnerId` and `OponentId`, capping every conversation at two people and
leaving the "New group" affordance in the design handoff with nothing to create. This work
replaces the two-column model with a `ThreadParticipant` membership table and wires group
creation through the API and the compose dialog. It is also **the first mocked feature to
become real** since the MUI redesign — `MOCK_FEATURES` in `services/mocks.ts` drops from
seven entries to six (confirmed: `mocks.ts:17-24` now lists six, with a comment at
`mocks.ts:115-118` recording that `mockThreadIsGroup`/`mockThreadMembers` are gone and
`adapters.ts` now reads `isGroup`/`members` straight off the server payload).

## What I found
The authorization check this replaced — `Validator.DoesUserBelongToCurentThread`, originally
`thread.OwnerId == userId || thread.OponentId == userId` against a thread fetched with
`FirstOrDefault` — had two independent faults, not one: it was hard-limited to two people,
**and** it dereferenced a thread that might be null, so an invented thread id in the URL threw
a `NullReferenceException` — a 500 raised by the authorization check itself, from a value the
caller supplies. This is why the work started there: it is the only thing standing between a
user and someone else's messages. Tests (`WebChat.Tests/Threads/ThreadAccessTests.cs`) were
written first and confirmed to fail to compile, since `ThreadQueries` did not yet exist.

`ThreadQueries.IsParticipant` (`WebChat.Services/ThreadQueries.cs:29-37`) is deliberately
total: null/blank thread id or user id returns `false` rather than throwing, and it takes an
`IQueryable<ThreadParticipant>` so the tests exercise the real EF expression (against SQLite
in-memory) rather than a copy written in the test file — the same shape as `UserQueries`
elsewhere in the codebase.

`ThreadController.GetAllMessages` (`getmessages/{id}`, `ThreadController.cs:27-59`) still
returns `BadRequest` (400) for "no access to this thread," where 403 would be correct, and it
uses a **different message** for "no such thread" (`ThreadController.cs:36`) versus "not
yours" (`ThreadController.cs:40`) — which makes a thread-existence oracle available to anyone
who can guess an id. Both confirmed by reading the controller; **both pre-existing**, not
touched by this change (only the implementation behind `DoesUserBelongToCurentThread`
changed, not the controller's handling of its result).

## What changed
- New `ThreadParticipant` entity (`ThreadParticipant.cs`) — `ThreadId` + `UserId` + soft-delete
  fields from `BaseEntity`. `Thread` gains `Name` (nullable, null for a direct thread) and
  `IsGroup` (bool). `OponentId` is **kept**, marked `Legacy` in an XML comment
  (`Thread.cs:24-32`), read by nothing.
- Migration `AddThreadParticipants` (`20260805181210_AddThreadParticipants.cs`): adds the
  columns/table, then backfills participant rows from `OwnerId`/`OponentId` via raw SQL using
  `UNION` (not `UNION ALL`) so a thread whose owner equals its opponent doesn't get a
  duplicate row, filtered to `WHERE EXISTS (SELECT 1 FROM "User" ...)` so a thread pointing at
  a deleted account doesn't fail the whole migration on the participant→user foreign key.
- `ThreadQueries` (new): `IsParticipant` (authorization) and `ParticipantIds` (message
  delivery — everyone in the thread including the sender, not "the other person").
  `Validator.DoesUserBelongToCurentThread` now just calls `IsParticipant`
  (`Validator.cs:34-37`).
- `HeyController`: new `POST creategroup` (`HeyController.cs:170-226`) — separate endpoint
  from `createthread`, not a flag on it. `getthreads` (`HeyController.cs:108-160`) now derives
  members from `GetParticipantIds` instead of the `OwnerId`/`OponentId` pair, and still
  populates `OponentVM` for direct threads (`HeyController.cs:151-154`), guarded on
  `Members.Count > 0` rather than on `!IsGroup` alone.
- `ThreadService`: new `AddGroupThread` and `AddParticipants` (dedupes existing rows before
  inserting, so a repeat call can't create a double-recipient).
- Client: `ComposeDialog.jsx` gains a group mode (toggle via `GroupAddIcon`, collects a name
  and picks) that only creates on explicit submit, versus direct mode which starts a thread
  the instant someone is picked (`ComposeDialog.jsx:125-128`). Everything, including the mode
  flag, resets on dialog close (`ComposeDialog.jsx:75-79`). `adapters.ts` maps a group's
  `name`/`avatarFileName` from the thread itself rather than an opponent
  (`adapters.ts:45-47`), and gives members an empty `role: ''` rather than an invented one
  (`adapters.ts:62-69`).

## Decisions and trade-offs
- **`IsGroup` is a stored column, not derived from participant count** (`Thread.cs:37-42`).
  A two-person group is a different thing from a direct message — it has a name and can gain
  members — and deriving the flag from count would erase that distinction the moment a group
  dropped to two people.
- **`creategroup` is a separate endpoint, not a flag on `createthread`.** Rejected folding
  them: the payloads differ (single opponent vs. name + member list) and the
  duplicate-thread-detection rule applies only to direct threads. A combined method would have
  to branch on which half of its arguments were supplied before doing anything else.
- **The creator is added server-side**, never taken from the request body
  (`HeyController.cs:205-210`) — so a client cannot construct a group it isn't a member of,
  and therefore can't read one it has no right to. Member ids are checked to exist
  (`HeyController.cs:183-187`) before the thread row is written, so a typo'd id fails cleanly
  with a 400 instead of leaving a half-built group.
- **Duplicate-thread detection is limited to direct threads** (`HeyController.cs:243-247`,
  `t.IsGroup` excluded) — two people may legitimately share several separate groups.
- **`OponentVM` is populated by member count, not by `IsGroup`** — a direct thread whose other
  member was deleted has nobody to name, and indexing `Members[0]` unconditionally would fail
  the entire thread list rather than just that one row.
- **`OponentId` is kept, not dropped, in this migration.** The backfill derives participant
  rows from it; dropping the column in the same migration would leave a `Down()` rollback
  unable to reconstruct membership. A follow-up should drop it once this has run in
  production — recorded as an outstanding item below.
- **Client: a group is named after the thread and carries no avatar** — one member's picture
  would misrepresent the group. **Members get an empty `role`**, not an invented one like
  "Member," since the server has no such concept yet; inventing one would look like real data.

## Verified
- Against the running compose stack, with three real accounts: the migration backfill left
  3 threads with 6 participants and zero orphaned rows; a group of three appears in
  `getthreads` for every member with correct name/members and `oponentVM: null`; a message
  sent by one member is readable by all three; an outsider is refused; an unknown thread id no
  longer 500s (matches the fixed behavior `ThreadAccessTests.cs:140-148` asserts at the query
  level).
- `WebChat.Tests/Threads/ThreadAccessTests.cs` (9 test methods, read in full) exercises
  `ThreadQueries.IsParticipant`/`ParticipantIds` directly against a SQLite in-memory
  `WebChatContext`, covering: both members admitted, non-member refused, group of three
  admitted/non-member refused, membership in one thread not leaking into another, empty/
  whitespace/unknown/null thread id refused rather than throwing, null user refused.
- Commit messages report 49 API tests and 61 client tests passing, and a Release build with
  0 warnings; not independently re-run for this note.

## Known issues / follow-ups
- **Pre-existing, not new**: `getmessages` (`ThreadController.cs:27-59`) returns 400 rather
  than 403 for "no access," and distinguishes "no such thread" from "not yours" by message
  text — a thread-existence oracle. Worth its own ticket; unrelated to this change beyond
  reusing the same `Validator` method.
- `OponentId` on `Thread` should be dropped in a follow-up migration once
  `AddThreadParticipants` has run in production and the backfill is no longer needed as a
  rollback source.
- Out of scope, left for later: leaving a group, removing members, admin roles (`OwnerId` is
  retained on `Thread` as the natural place to hang these), and group avatars.
- Groups make end-to-end encryption materially harder than 1:1 threads — the O(n²) vs O(log n)
  key-fanout argument from issue #34 barely mattered for direct threads and now starts to.
  See `docs/research/2026-08-05-browser-e2ee-library.md` for the related research note (swept
  into commit `2bd5acd` incidentally via `git add -A` while a background agent was writing it
  — unrelated to groups, harmless, but not an intentional part of this change).
- **Not verified**: the group UI was never driven in a real browser. `ComposeDialog`'s group
  mode is covered by typecheck and unit tests only (including
  `test/compose-search.test.tsx:1`); the create-group flow was verified over HTTP directly,
  not by clicking through the dialog.
