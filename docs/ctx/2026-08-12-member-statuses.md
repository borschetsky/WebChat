# Members and the four account statuses

- **Date:** 2026-08-12
- **Type:** change
- **Scope:** `WebChat.Data/AccountStatus.cs`, `WebChat.Data/User.cs`, `WebChat.Data/ViewModels/AdminMemberViewModel.cs`, `WebChat.Data/MessageType.cs` (`SystemKind.MemberDeactivated`), `WebChat.Connection/Migrations/20260812171402_AddAccountStatus.cs`, `WebChat.Hub/Interfaces/IConnectionAborter.cs`, `WebChat.Hub/ConnectionMapper/ConnectionAborter.cs`, `WebChat.Hub/ChatHub.cs`, `WebChat.Services/{IMemberAdminService,MemberAdminService}.cs`, `WebChat/Controllers/{AdminController,AuthController}.cs`, `WebChat/Startup.cs`, `WebChat.Tests/{Admin/{MemberAdminTests,AccountStatusAuthTests},Hubs/ConnectionAborterTests,Auth/RegistrationStatusTests}.cs`, client `types/admin.ts`, `services/{admin-service.ts,admin-mocks.ts,api-service.js}`, `app/api/adminApi.ts`, `features/admin/{adminErrors.ts,auditSentence.ts,MemberDetail.jsx,sections/AdminMembers.jsx}`
- **Status:** done

## Context

Issue #71, slice 2 of 6 turning the mocked admin console into real functionality (splits
#64, follows #70's audit log). Branch `feature/71-member-statuses`. Gives every account a
real status (active/pending/blocked/deactivated), wires block/deactivate/role-change to
real data, and — the load-bearing finding of the slice — makes ending a session actually
end the live SignalR connection, not just the ability to present a new token. Two CLAUDE.md
bullets already cover the login-refusal codes and "ending a user's sessions takes two
things, and the stamp is only one of them"; this note doesn't repeat either, only points at
them.

## What I found

- `WebChat.Data/AccountStatus.cs` — string constants (`Active`/`Pending`/`Blocked`/
  `Deactivated`, same reasoning as `WorkspaceRole`/`GroupRole` — cross the wire, and are
  stored, so an enum's integer would make the column unreadable without the code) plus
  `IsValid`, `CanSignIn` (active only) and `EndsSessions` (blocked or deactivated), the last
  named specifically so a caller can't implement one and forget the other.
- `User.Status:58` is `[Required][MaxLength(20)]` with **deliberately no property
  initializer**, unlike `User.Role:40` (`= WorkspaceRole.Member`). The comment on it and on
  the migration both spell out why: an initializer would let the test proving
  `UserService.CreateUser` names the status pass whether or not the write path was ever
  touched — the exact shape of the #63 bug, where a backfill hid that new rows still took
  the column default. `RegistrationStatusTests` (3 `[Fact]`s) exists to catch a missing
  write there.
- Migration `20260812171402_AddAccountStatus.cs` — column default `AccountStatus.Active`
  (not the EF-generated empty string, which matches no constant, so `CanSignIn` would
  refuse every pre-existing account), plus an explicit backfill `UPDATE`. Its own comment
  states plainly that the backfill is "the dangerous half" — it leaves the data looking
  correct everywhere anyone would check, which is exactly what hid #63 for as long as it
  did; the write-path test is what actually matters.
- `Startup.cs:220` extends the projection `OnTokenValidated` already reads (`SecurityStamp`,
  `Role`) to add `Status`, so it costs one more column on a query that already has to
  happen; `Startup.cs:240` fails the token for any non-active status.
- `AuthController.cs:82-92` — login answers 403 `account_deactivated` / `account_blocked`
  distinctly, checked after the password (same probing concern as the existing
  `email_not_confirmed` code; see CLAUDE.md).

### The SignalR finding

`WebChat.Hub/Interfaces/IConnectionAborter.cs` + `ConnectionMapper/ConnectionAborter.cs` —
a singleton registry of live `HubCallerContext` per user, `Track`ed in
`ChatHub.OnConnectedAsync`, `Forget`ten in `OnDisconnectedAsync` (which also runs after an
abort), `AbortAll(userId)` returning the count closed. This is the mechanism behind the new
CLAUDE.md bullet on ending sessions — see there for the "why rotating the stamp alone does
nothing to an open socket" reasoning; not repeated here.

Facts worth keeping past that bullet:

- Deliberately **separate** from `IConnectionMapping<T>` (connection *ids*, enough to
  address via `IHubContext`, not enough to close). Aborting needs the context object
  itself — a heavier thing to hold, worth naming what for.
- `AbortAll` (`ConnectionAborter.cs:57-80`) copies the contexts out and **releases the lock
  before aborting**: `Abort()` drives `OnDisconnectedAsync` → `Forget`, which takes the same
  lock; aborting inside the lock deadlocks when the disconnect runs synchronously.
- Process-local, like `ConnectionMapping<T>` — fine with the one instance `.do/app.yaml`
  runs today; behind a backplane this becomes the local half of a broadcast, and the class's
  own doc comment says the failure would be **silent**: blocking would appear to work and
  disconnect nobody on another node.
- `ChatHub`'s constructor took a third dependency (`ChatHub.cs:15,20,24`); `ChatHubTests`
  and `HubFakes.FakeCallerContext` were updated accordingly — the fake's `Abort()`
  (`HubFakes.cs:114`) now records into an `Aborted` flag instead of throwing, since aborting
  is now something the app does on purpose.

### Members service and endpoints

- `WebChat.Services/IMemberAdminService.cs` + `MemberAdminService.cs`,
  `WebChat.Data/ViewModels/AdminMemberViewModel.cs`, three endpoints on `AdminController`:
  `GET /api/admin/members` (`AdminController.cs:80-81`), `POST /api/admin/members/status`
  (bulk, `:88-95`), `POST /api/admin/members/{id}/role` (`:106-113`).
- **Four guards, each with its own reasoning in-code and each tested:**
  - `MemberAdminService.cs:90` — an actor cannot target themself; checked before anything
    is written so a bulk call containing the actor is refused *whole*, not half-applied.
  - `WouldStrandTheWorkspace` (`:220-230`) — the last owner who can sign in cannot be
    blocked or demoted, checked **across the whole batch**: two owners each individually
    safe to block would otherwise each pass a per-account check and still strand the
    workspace.
  - `SetRoleAsync` (`:161-167`) — only an owner may appoint or remove administrators,
    checked on **both** the new role and the target's current role
    (`WorkspaceRole.CanAdminister(role) || WorkspaceRole.CanAdminister(target.Role)`),
    because checking only the new role would let an admin demote the owner and take the
    workspace.
- Blocking (`AccountStatus.EndsSessions`, `:116-125`) rotates `SecurityStamp` **and** calls
  `IConnectionAborter.AbortAll`; the count lands in the audit detail as `connectionsClosed`
  — named for what it measures, since a JWT can't be counted once issued.
- Blocking leaves group membership alone (a suspension; unblocking has to be able to put
  things back). Deactivation (`RemoveFromEveryGroup`, `:242-286`) empties it.
- Deactivation writes `SystemKind.MemberDeactivated` (`MessageType.cs:31-40`), a new kind
  deliberately distinct from `MemberRemoved`: a removal names an actor with authority *in
  that group*, and a workspace administrator has none there — "Maya removed Ben" would
  assert authority the spec withholds. `MemberAdminTests` asserts `MemberRemoved` is never
  written by this path.
- Deactivating a **group owner** hands ownership on first (`:255-276`) — an existing group
  admin, else the longest-standing member — because an ownerless group can't be renamed,
  managed or transferred: #63's bug arrived at from the other direction. Direct threads are
  left intact.
- **A bug a test caught, per `MemberAdminService.cs:267-272`'s own comment:** ownership is
  stored twice — `ThreadParticipant.GRole` (what `GroupPermissions` reads) and
  `Thread.OwnerId` (what the thread's mapping exposes). `GroupService.TransferOwnership`
  sets both; the comment records that the first version here set only the participant role,
  which a fixture failure caught, and the code now sets both explicitly.
- Every mutation calls `IAuditService.Record` in the same transaction (one `SaveChangesAsync`
  covers status changes, group departures, system messages and audit rows together, per the
  comment at `:140-143`) — one entry per account so a search for a person finds everything
  done to them. A refused action and a no-op status change both write nothing; both tested.

### Client

- `types/admin.ts` — `AdminRoleLabel` (`'Owner'|'Admin'|'Member'|'Guest'`) became `AdminRole`
  (`'owner'|'admin'|'member'`, the wire values) with a `ROLE_LABEL` map for display. `Guest`
  is called out in-file as fiction the seam couldn't absorb — nothing in this app has a
  permission tier by that name. `AdminMember` dropped `mfa` (no second factor exists at
  all) and renamed `sessions` to `connections`; gained `avatarFileName` and
  `emailConfirmed`.
- `services/admin-service.ts` — a shared `listOf` helper (`:46-47`) replaces ad-hoc
  unwrapping; `loadMembers` is real, `loadOverview` composes the real member list through
  the still-fixture `mockOverview`.
- `admin-mocks.ts:28` states in comment that the `MEMBERS` fixture is gone; `mockOverview`
  now counts the real members list rather than its own fixture — kept in the same slice
  because Overview and Members are one click apart, and a stat card claiming more people
  than the table lists would read as a product bug rather than unfinished work.
- `features/admin/adminErrors.ts` (new) — `errorMessage` prefers the server's own message,
  falling back to a map keyed by the refusal codes `AdminController.Refuse` emits
  (`self_action`, `last_owner`, `owner_only`, `not_found`, `invalid_status`,
  `invalid_role`), plus a 403-with-no-body fallback. `AdminMembers.jsx` and `MemberDetail`
  branch on `result.error` instead of announcing success unconditionally.
- `AdminMembers.jsx:50-53` — the bulk bar **keeps the selection** on a refusal (comment:
  the fix is to deselect the offending row, which is impossible once the selection is
  already cleared).
- `auditSentence.ts:104-110` — reads `connectionsClosed` (not the old mock field
  `sessionsEnded`) and renders "no live connections" for zero rather than nothing, since
  zero is the ordinary case for an already-disconnected target.

## Decisions and trade-offs

- No initializer on `User.Status`, at the cost (per the code's own comment) of eight
  existing test fixtures having to start naming a status explicitly, because a missing one
  is now a hard insert failure — the same trade `Role`'s initializer avoided, made
  deliberately the other way this time so the write path can't hide behind a default.
- `ConnectionAborter` kept separate from `ConnectionMapping<T>` rather than extending it,
  because addressing and aborting need different-weight objects (a string id vs. the live
  context) — folding them would make every `IConnectionMapping` consumer pay for holding
  contexts it never needs.
- Blocking rotates the stamp *and* aborts connections rather than either alone — the audit
  detail is named `connectionsClosed`, not "sessions ended", because the design mock's "4
  sessions ended" was never a number a server could produce (a JWT isn't counted once
  issued).
- Deactivation is a distinct `SystemKind` from `MemberRemoved` rather than reusing it, so
  the audience of a group's history is never told an administrator acted with authority
  they don't have in that group.

## Verified

- `dotnet build WebChat.sln --no-incremental -warnaserror`: **Build succeeded, 0 Warning(s),
  0 Error(s)** — re-run directly in this pass, output read rather than grepped.
- `dotnet test WebChat.Tests`: **180 passed, 2 skipped** (the 2 skips are the pre-existing
  live-SMTP integration tests) — re-run directly. Confirmed the new file counts by counting
  `[Fact]`/`[Theory]`+`[InlineData]` cases: `MemberAdminTests.cs` 20 facts + 2 + 2 theory
  cases = 24; `ConnectionAborterTests.cs` 5; `AccountStatusAuthTests.cs` 2 facts + 2 theory
  cases = 4; `RegistrationStatusTests.cs` 3.
- `npm run verify`: re-run directly — lint/format clean, typecheck clean, **153 client tests
  passed (14 files)**, `vite build` succeeded.
- `dotnet ef migrations list`: confirms `20260812171402_AddAccountStatus` is the 11th
  migration in sequence, after `20260811205323_AddAuditLog` (#70) — checked against a local
  database with everything but the initial migration still pending, so this confirms
  ordering, not application.
- **Not independently re-verified in this note-writing pass:** the live docker-compose
  checks reported by the implementing session — 52 existing users backfilled to `active`,
  `GET /api/admin/members` against real Postgres, self-block refused with `self_action`, a
  blocked user's live token going 200→401, and the SignalR socket closing at the moment of
  block with `connectionsClosed: 1` in the audit entry. These are consistent with the code
  read above (the audit detail key, the refusal codes, the token check in
  `Startup.OnTokenValidated`) but were not re-run live here.

## Known issues / follow-ups

- `AdminMemberViewModel.LastActiveUtc` is derived from the newest message a user sent — the
  app records no general activity timestamp, so a member who reads constantly and never
  writes looks idle. Stated in the view model's own comment (`AdminMemberViewModel.cs:39`).
- `ConnectionAborter` is process-local; see the SignalR finding above and the CLAUDE.md
  bullet — becomes the local half of a broadcast, silently, if a second instance is ever
  added without a backplane.
- Undo is not implemented in the members UI. Per the #64 plan, it should be the inverse
  mutation writing its own audit entry, never a server-side undo — not built yet.
- Invitations, UI errors and policies remain fixtures (#72, #74, #75 respectively).
  Overview is half real: the four stat cards count live members; the 14-day chart is still
  fixture, deferred to #73.
- No React-level test drives `AdminMembers` or `MemberDetail`; `adminErrors.ts` and
  `auditSentence.ts` are tested as pure functions only.
- No visual pass on the console — carried forward from #68, still owed.
