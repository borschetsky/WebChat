# The admin audit log: an append-only table, and the first real admin endpoint

- **Date:** 2026-08-11
- **Type:** change
- **Scope:** `WebChat.Data/AuditEntry.cs`, `WebChat.Data/AuditAction.cs`,
  `WebChat.Services/IAuditService.cs`, `WebChat.Services/AuditService.cs`,
  `WebChat.Connection/WebChatContext.cs`, migration `20260811205323_AddAuditLog`,
  `WebChat/Controllers/AdminController.cs`, `WebChat/SystemDataJson.cs`, `WebChat/Startup.cs`,
  `WebChat.Tests/Admin/*`, `WebChat.Tests/Auth/UserNameLookupTests.cs`,
  `WebChat.Tests/WebChat.Tests.csproj`; client: `types/admin.ts`,
  `features/admin/auditSentence.ts` (new), `lib/date-time-format.ts`,
  `features/admin/AuditRow.jsx`, `MemberDetail.jsx`, `sections/AdminMembers.jsx`,
  `sections/AdminInvitations.jsx`, `sections/AdminErrors.jsx`, `sections/AdminOverview.jsx`,
  `services/api-service.js`, `services/admin-service.ts`, `app/api/adminApi.ts`,
  `services/admin-mocks.ts`, `features/admin/AdminIcon.jsx`, `package.json`
- **Status:** done, with one build-breaking issue found during verification — see below

## Context

Issue #70, the first of six slices splitting #64 (turning the mocked admin console from #68
into real functionality; the ordering and rationale live in
[the implementation plan](2026-08-11-admin-console-implementation-plan.md)). Audit log first
because block/unblock (the next slice, #71) is only defensible with one to write to. Branch
`feature/70-audit-log`, on top of #67's workspace roles (`WorkspaceRole`, `User.Role`).

## What changed

**Server.** `AuditEntry` (`WebChat/WebChat.Data/AuditEntry.cs:22`) — `Id`, `ActorId`,
`Action`, `TargetType`, `TargetId` (nullable), `DetailJson`, `OccurredAtUtc`. Deliberately
**not** a `BaseEntity`: that base carries `ModifiedOn`, `isDeleted`, `DeletedOn` — the three
columns an append-only log must never have. `ActorId` is **not** a foreign key: an audit row
must outlive the account it names, and a cascade would erase history while a restrict would
block an offboarding. `AuditAction.cs` is string constants (`block`, `unblock`, `deactivate`,
`activate`, `role`, `invite`, `policy`, `login`), the same reasoning as `GroupRole`/
`WorkspaceRole` — the values cross the wire to TypeScript with no enum to bind to, and are
stored, so an enum's integer would make the table unreadable without the code.

`AuditService` (`WebChat/WebChat.Services/AuditService.cs`): `Record(...)` **adds to the
caller's `DbContext` but does not call `SaveChangesAsync`** — the caller's own save commits
the action and its audit entry together or neither; calling save inside `Record` would make
the two independently failable. `RecentAsync(before, limit)` is keyset-paginated on
`OccurredAtUtc` descending (strict `<`, no id tie-break — see Decisions), page size clamped
to `MaxPageSize = 200`. `WebChatContext.cs:28` adds `DbSet<AuditEntry>` and a descending
index on `OccurredAtUtc` at `WebChatContext.cs:35-36`.

Migration `20260811205323_AddAuditLog.cs` creates the table, the index, and — via raw SQL —
a `BEFORE UPDATE OR DELETE` trigger (`webchat_audit_is_append_only()`) that raises. `REVOKE
UPDATE, DELETE` was rejected: the app connects to DO managed Postgres as the table's *owner*,
and an owner can grant itself back what it revoked, so only a trigger holds. `Down` drops the
function separately from the table, since dropping a table drops its triggers but leaves the
function behind.

`AdminController.cs` (new): `[Authorize(Roles = WorkspaceRole.Owner + "," +
WorkspaceRole.Admin)]`, `GET /api/admin/audit?before=&limit=`. The controller resolves names
for the ids inside `DetailJson` via `SystemDataJson.NamesFor`, then additionally resolves the
actor and target ids itself (`AdminController.cs:81-98`) — `NamesFor` only walks the ids
*inside* the detail object, not the entry's own `ActorId`/`TargetId`. `SystemDataJson.cs`
gained a public `Data(string json)` (`SystemDataJson.cs:78`) returning the parsed `JToken` (or
null) for a caller building its own wire shape, reusing the same Newtonsoft-`JToken` choice
`Expand` already makes so the JSON round-trips unchanged. `Startup.cs:280` registers
`IAuditService` as transient.

**Client.** `types/admin.ts` — `AdminAudit` became facts (`kind`, `actorId`, `targetType`,
`targetId`, `data`, `names`, `occurredAtUtc`) instead of a pre-rendered `text`/`meta`/`time`;
every other display string in the file became an instant (`AdminMember.lastActiveUtc`/
`joinedUtc`, `AdminInvite.sentAtUtc`/`expiresAtUtc`, `AdminError.firstSeenUtc`/
`lastSeenUtc`); `AdminOverview.recentAudit` was removed. `features/admin/auditSentence.ts`
(new) exports `auditSentence()` and `auditMeta()`, deliberately mirroring
`features/messages/systemMessage.ts` rather than sharing code with it — the vocabularies are
unrelated, one about a group and one about the workspace. An unknown `kind` renders `''`, so a
client a deploy behind the server shows a gap rather than a lie. `lib/date-time-format.ts`
gained `getRelativeTime`, `getAbsoluteDate`, `getDaysUntil` (lines 53, 75, 89).
`sections/AdminOverview.jsx`'s "Recent admin activity" now calls `useGetAuditQuery({ limit: 6
})` for real. `services/api-service.js:139` adds `getAuditLog`; `services/admin-service.ts`'s
`loadAudit` is real; `app/api/adminApi.ts` gained a `tokenOf` helper matching `chatApi.ts`'s
and `getAudit` takes an argument. `services/admin-mocks.ts` — the `AUDIT` fixture and
`mockAudit` are deleted; remaining fixture timestamps use new `minutesAgo`/`hoursAgo`/
`daysAgo`/`inDays` offset helpers; `mockSendInvites` no longer appends an audit entry, since a
mock invitation cannot produce a real audit row and a fabricated one among genuine rows
defeats the log's point.

**Test harness (new capability).** `WebChat.Tests.csproj` now references `WebChat.csproj`
directly and `Microsoft.AspNetCore.Mvc.Testing` 10.0.10. `WebChat.Tests/Admin/
AdminApiFactory.cs` boots the real host in memory over SQLite. The belief recorded in #67's
note — that the test project could not reference the host, which is why `BootstrapAdmins` was
moved out of `Program.cs` and why `SystemDataJson` went untested in #63 — was never actually
true; nobody had tried the reference. Host code is testable now; see the #67 note (already
amended) for the prior belief.

## What I found (traps worth the time they cost)

1. **`HttpClient` strips `Authorization` across a redirect, and `UseHttpsRedirection` causes
   one.** Every authenticated call in the harness came back `401` with a bare
   `WWW-Authenticate: Bearer`, no detail — while calling `IAuthenticationService
   .AuthenticateAsync` directly with the identical token succeeded, which is what made it
   confusing. Cause: the client addressed `http://localhost`, got a 307, followed it back to
   the same test server, and `HttpClient` dropped `Authorization` on the scheme change exactly
   as designed — the retried request was anonymous, so the handler had nothing to complain
   about. Fixed by addressing `https://localhost` via `WebApplicationFactoryClientOptions
   .BaseAddress` (`AdminApiFactory.cs:158-159`, documented in the class's own XML comment).

2. **An unmatched path falls through to `UseSpa` and answers `200` with `index.html`.** A test
   asserting only `StatusCode == OK` would have passed before `/api/admin/audit` existed;
   `AdminAuthorizationTests.cs:33-44` now also asserts `Content-Type: application/json`, and
   says why in its own doc comment. Related: running the factory in `Development` makes
   `UseSpa` proxy to a Vite dev server that isn't running, so an unmatched route sits in the
   proxy's retry loop for over a minute before a 502 — a two-minute test for "this route
   doesn't exist." The factory uses `Testing` instead (`AdminApiFactory.cs:69`), at the cost of
   supplying the two settings `Startup.ValidateRequiredConfiguration` insists on outside
   Development.

   **Note for the next reader:** the class's own top-of-file doc comment (`AdminApiFactory.cs`
   lines 39-41) still says *"Development environment, because `ValidateRequiredConfiguration`
   returns early there"* — the opposite of what the code and the inline comment at line 60 say
   and do. Stale prose inside the same file as the correct explanation; trust the code and the
   inline comment, not that paragraph.

3. **EF Core 9+ pins the provider through `IDbContextOptionsConfiguration<TContext>`**, which
   survives removing `DbContextOptions<TContext>` alone. Swapping Npgsql for SQLite failed
   with an error naming both providers and pointing at `UseInternalServiceProvider` — not the
   actual cause. Fixed by also calling
   `RemoveAll<IDbContextOptionsConfiguration<WebChatContext>>()`
   (`AdminApiFactory.cs:74-88`).

4. **`UserService.GetUserNameById` was `FirstOrDefault(...).Username`** with no `?.` — a
   latent `NullReferenceException` for any id that doesn't resolve, uncaught until now because
   every prior caller passed an id taken from a thread's current members or a message's
   sender, which by construction exists. The audit log is the first caller for which a missing
   user is normal, not exceptional — the actor or target of an entry is often exactly the
   account that has since been deactivated. One such row 500'd the *entire* audit page, not
   just the row. Fixed to `?.Username` (`UserService.cs:263`), `GetUserIdByName` likewise
   (`UserService.cs:243`); `WebChat.Tests/Auth/UserNameLookupTests.cs` (3 tests) proves it, and
   per `fix-flow` the tests were run and seen to fail before the fix (per the summary this work
   was built from — not independently re-proven by me, since the fix is already applied on
   disk).

## A defect this work found in already-merged code

`features/admin/AdminIcon.jsx` imported `@mui/icons-material/MailOutline`, which does not
exist — the export is `MailOutlined`; the `MailOutline*` family is
`MailOutlineOutlined`/`Rounded`/`Sharp`. Confirmed fixed: `AdminIcon.jsx:8` now imports
`MailOutlined`, with a comment at lines 3-6 recording the correct export names. It passed
`npm run verify` and CI in #68 and broke only `docker compose build`/`dotnet publish`, because
`verify` did not run `vite build` and the Vite dev server resolves imports lazily — so the
admin console merged in #68 could not have been deployed at all. `npm run verify` now ends
with `npm run build` (`package.json:47`), confirmed by running it — build step completes in
~180 ms — so this class of defect is now caught by the gate CI runs.

## The finding that shaped the client work

`types/admin.ts`'s own header comment used to claim "making a section real is a change to
`services/admin-service.ts` and nothing else" and now says explicitly that this held for four
sections and failed for the audit log: the mocks stored *rendered* display strings —
`'2 h ago'`, `'Alice blocked Bob'` — which no server can send, since it doesn't know when the
page will be read and a stored sentence is frozen in the phrasing and language of whoever was
an admin that day. General lesson recorded in the file: *a mock that formats for display hides
work the seam cannot absorb.* The plan note predicted this and put the shape change in this
slice deliberately, once, rather than repeating it across all six.

## Decisions and trade-offs

- **`Record` does not save.** Independently failable action-and-record is the one state an
  audit log must not have (a recorded action that never happened, or an action with no
  record). The cost: every future caller must remember to call `SaveChangesAsync` itself, and
  nothing enforces that a call to `Record` is followed by a save.
- **`ActorId` is not a foreign key.** Rejected both FK behaviors: cascade delete would erase
  history when an account is removed, restrict would block deleting/offboarding an account
  that has ever acted. Consequence: `NamesFor` can resolve to nothing for a stale id, and the
  client's "someone" fallback is what covers that, in both `SystemDataJson` and
  `auditSentence.ts`.
- **A DB trigger, not a `REVOKE`, enforces append-only.** `REVOKE UPDATE, DELETE` doesn't hold
  against the table's owning role on DO managed Postgres, since an owner can grant itself back
  what it revoked. A trigger holds against anything the app, EF, or a console session does,
  including a well-intentioned manual fix of one row.
- **Keyset pagination with strict `<` and no id tie-break.** Two entries sharing
  `OccurredAtUtc` to the tick would drop one across a page boundary. Judged not worth a
  composite index at this table's scale; the failure mode is a missing row, not a duplicated
  one. Recorded in `AuditService.cs:60-63` and here so it reads as a decision, not an
  oversight.
- **`auditSentence.ts` mirrors `systemMessage.ts` rather than sharing code with it.** The two
  vocabularies (group actions vs. workspace admin actions) are unrelated; merging them would
  grow one switch statement with every case from both.
- **Testing environment for the in-memory host, not Development.** Trades two required config
  keys for avoiding `UseSpa`'s proxy-to-a-dead-dev-server retry loop.

## Verified

- `dotnet test WebChat.Tests`: **144 passed, 2 skipped** (146 total) — run directly and
  confirmed. New: `Admin/AdminAuthorizationTests.cs` (4 — a `[Theory]` with 2 cases plus 2
  `[Fact]`s), `Admin/AuditServiceTests.cs` (6), `Auth/UserNameLookupTests.cs` (3).
- `npm run verify` (lint, format:check, typecheck, vitest, vite build): all green, run
  directly. **152 tests across 14 test files**, confirmed by running it. New:
  `features/admin/auditSentence.test.ts` (12 tests) plus additions to
  `lib/date-time-format.test.ts`.
- Read and cross-checked every server and client file named above against the summary this
  note was built from; all facts as described matched the code on disk.
- **The docker-compose live verification (migration applied as the 10th; `INSERT` succeeded;
  `UPDATE`/`DELETE` refused by the trigger with the row surviving; `GET /api/admin/audit`
  returning 200 with names resolved and `null` for a gone actor; 403 for a member, 401
  anonymous) was reported to me and not independently re-run** — reproducing it costs standing
  up the full compose stack against real Postgres, which this pass did not do.

### A build failure this pass caught, and the check that let it through

**`dotnet build WebChat.sln --no-incremental -warnaserror` failed with 2 errors** — since
fixed in the same branch, but worth recording for how it survived a "green" build. It was
run, and the output was checked with `grep -cE "warning"`, which counted zero and was taken
as passing. The two problems were reported as **errors**, not warnings, so the grep was
blind to them, and no one checked the exit code or looked for `Build FAILED`. A verification
step that greps for one word is not a verification step.

Both were inside the new `WebChat.Tests/Admin/AuditServiceTests.cs`:

- `CS8625` at `AuditServiceTests.cs:36` — the test helper `Write(string action, string
  targetId, DateTime at, object detail = null)` defaults a non-nullable `object` parameter to
  `null`; the test project has `<Nullable>enable</Nullable>`
  (`WebChat.Tests.csproj`). Needs `object? detail = null`.
- `xUnit2013` at `AuditServiceTests.cs:100` — `Assert.Equal(1, (await
  this.audit.RecentAsync(null, 0)).Count)` trips the analyzer's "use `Assert.Single` instead
  of comparing `.Count`" rule.

Plain `dotnet build` (no `-warnaserror`) and `dotnet test` both succeed and report "0
Warning(s)" — the analyzer/nullable diagnostics only surface as build **errors** once
`-warnaserror` is passed, which is exactly what `.github/workflows/ci.yml`'s `api` job does
(`ci.yml:73`, `--configuration Release --no-restore --no-incremental -warnaserror`). **This
means CI would have failed on this branch.** Both lines were new in this slice's own test
file, so this was unfinished work in the diff rather than an inherited regression.

**Fixed:** `object? detail = null` at line 36, and `Assert.Single(...)` at line 100. A clean
`--no-incremental -warnaserror` build now succeeds, checked by reading the result rather
than by counting a word in it.

## Known issues / follow-ups

- **The append-only trigger cannot be unit-tested here.** It is PL/pgSQL installed by the
  migration; the suite runs on SQLite, which has neither PL/pgSQL nor the migration applied.
  `AuditServiceTests.cs`'s class doc comment says so; the only proof is the (reported, not
  re-run) manual Postgres check above.
- **Nothing yet writes an audit entry in production code** — `IAuditService.Record` has no
  callers outside the test suite. The first caller is #71 (member actions — block/unblock/
  deactivate/activate/role).
- **No retention or pruning is implemented**, only recommended in comments. The DO managed
  Postgres instance is capped at 512 MB total.
- No React-level test drives `AuditRow` or any other admin component; `auditSentence`/
  `auditMeta` are tested as pure functions only.
- No visual pass on the console — unchanged gap carried from #68.
