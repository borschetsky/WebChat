# Group roles and the permission map: the model, and a sentinel I built and removed

- **Date:** 2026-08-10
- **Type:** change
- **Scope:** `WebChat.Data/GroupRole.cs` (new), `Thread.cs`, `ThreadParticipant.cs`,
  `WebChat.Services/GroupPermissions.cs` (new), a migration,
  `WebChat.Tests/Threads/GroupPermissionTests.cs` (new), `ORIENTATION.md`. Issue #63, first
  slice.
- **Status:** partial when written — model, rules and migration only. The endpoints, system
  messages and UI this note's "Known issues / follow-ups" listed as missing landed the next
  day; see
  [`2026-08-11-group-roles-endpoints-ui.md`](2026-08-11-group-roles-endpoints-ui.md).

## Context

`SPEC-groups-and-admin.md` §2 introduces per-conversation roles. Nothing of it existed:
`ThreadParticipant` had no role column at all.

## What I found

**The spec's rules divide cleanly into two kinds**, and conflating them would have been the
easy mistake. Three actions are *configurable* through the permission map (rename, invite,
remove). Three are *not*, and must not be, because the state they would allow is unrecoverable
through the UI:

- the **owner cannot be removed** — an ownerless group has nobody who can transfer ownership;
- **only the owner** transfers ownership or edits the map — otherwise an owner can hand away
  the ability to take the group back;
- **nobody is promoted straight to owner** — ownership moves by transfer, which demotes the
  previous owner in the same transaction, and a direct promote is the one path to two owners.

**`everyone` means every *member*, not every user.** A caller with no membership row is refused
even at that level, which is the entire point of the membership table.

**`Thread.OwnerId` is what made the backfill a fact rather than a guess.** It was kept during
the #37 participants migration specifically so a rollback could reconstruct membership; here it
is the only record of who created each thread, and therefore who becomes owner.

## What changed

- `GroupRole` (`owner`/`admin`/`member`) and `PermissionLevel` (`owner`/`admins`/`everyone`) as
  string constants — the values cross the wire to a TypeScript client with no enum to bind to.
- `ThreadParticipant.GRole`; `Thread.PermRename`/`PermInvite`/`PermRemove`; `Thread.Version`.
- `GroupPermissions` — pure static logic, no I/O.
- Migration adds the columns **and backfills**: each thread's `OwnerId` becomes `owner`,
  everyone else `member`, permissions default to `admins`.

## Decisions and trade-offs

- **The rules live apart from the fetching.** The previous authorization check in this repo was
  both wrong and hard to test precisely because the decision and the loading were tangled, and
  it was the only thing between a user and someone else's messages. Separated, every role is
  tested against every permission level without a database.
- **An unrecognised level denies rather than defaults.** A typo in the database should close a
  door, not open one.
- **Three columns, not a JSON blob.** These are read on every authorization check; a queryable
  column costs nothing now and something real to retrofit.
- **`Version` is a plain `int`, not EF's `xmin`/`[Timestamp]`**, because the client has to echo
  it back in `If-Match`.

### The sentinel: built on instruction, removed on evidence

`Message.SenderId` is a non-nullable FK, so system messages need an author. Asked how to
proceed, the repo owner said to pick a sentinel user and document it — so I built one: a fixed
GUID `…00000000da7a`, seeded by the migration, with the reasoning written up.

The handoff revision that landed hours later answers the question directly and the other way:

> Use the **actor's real user id**. Every system message this product generates has a human
> actor […] "Maya renamed the group" is authored by Maya. **No sentinel needed.** […] not a
> nullable FK, **not a magic zero id**.

A magic zero id is exactly what I had built. It was removed along with its seeding **before the
migration was ever applied**, so no database ever carried the row. The spec's answer is also
simply better: attributable rather than anonymous, and it needs no exclusion filter in every
query that lists users — a cost my own note had already flagged as real.

Worth keeping as a pattern: a decision made under uncertainty and authorised by the owner is
still worth revisiting the moment the authority arrives, rather than defending because it was
sanctioned.

## Verified

- `dotnet build --no-incremental -warnaserror` — **0 warnings**; **103 tests** pass (was 76),
  16 of them new and covering every role against every permission level, both non-configurable
  rules, the non-member case, and the invalid-level case.
- **Against the running database, after applying the migration:** every group has exactly
  **one** owner, **zero** ownerless groups, **zero** null permission columns, and **zero**
  sentinel users — the last confirming the removal reached the schema.
- **Not verified: any of it through an endpoint or a UI.** `GroupPermissions` is not yet called
  by anything. Nothing enforces these rules at runtime; this slice is the model and the
  decision function only.

## Known issues / follow-ups

- **The five mutations are unimplemented** — rename, add, remove, set role, transfer. The wire
  contract (`SPEC-group-wire-contract.md`) specifies them under
  `/api/conversations/{groupId}` with `If-Match` and `409 VERSION_CONFLICT`.
- **System messages are unimplemented.** Per the spec they are real stored rows with
  `type: 'system'`, `systemKind`, structured `systemData` and `body: null` — the client renders
  the sentence, so nothing is frozen in one language.
- **`Version` is never incremented yet**, because nothing mutates a group. It must move on
  every metadata change or `If-Match` is decorative.
- Direct threads get `GRole = 'member'` for both participants. Meaningless there, and nothing
  reads it — but it is a value in a column, so worth knowing before someone infers meaning.
