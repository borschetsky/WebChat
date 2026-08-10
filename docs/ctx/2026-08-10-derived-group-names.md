# Group names stopped being snapshotted

- **Date:** 2026-08-10
- **Type:** change
- **Scope:** `WebChat.Data/Thread.cs`, `ViewModels/CreateGroupViewModel.cs`,
  `Controllers/HeyController.cs`, a migration, `WebChat.Tests/Threads/GroupNamingTests.cs`;
  client `features/threads/groupName.ts`, `services/adapters.ts`, `ComposeDialog.jsx`,
  `app/ChatApp.jsx`. Issue #62. Supersedes the naming decision in
  [2026-08-07-modeless-compose-flow.md](2026-08-07-modeless-compose-flow.md).
- **Status:** done, verified against the running stack

## Context

The 2026-08-10 handoff added `SPEC-groups-and-admin.md`, which contradicted what #43 shipped —
and the contradicted behaviour was live in production.

## What I found

**The spec names our behaviour as the bug.** I had recorded the staleness as a *known cost*:

> Known cost: the name freezes at creation. Add a seventh member and the "+2" is permanently
> wrong.

The spec:

> Do **not** snapshot the string at creation — it goes stale silently and users report it as a
> bug.

Same behaviour, opposite verdict. Worth remembering as a pattern: a cost I accepted and wrote
down was the thing the designer had specifically decided against.

**A null check cannot replace the flag.** "Unnamed" and "named" are not distinguishable by
`Name IS NULL` alone once someone renames a group *to exactly its derived title* — without
`Named`, that group would silently start re-deriving and change the next time a member left.
Hence a boolean rather than the cheaper-looking null test.

**The format was wrong too.** Ours showed two first names then `+N`; the spec shows **three**,
so a three-member group reads "Maya, Tomás, Priya" and not "Maya, Tomás +1".

**The name field comes back, with different semantics.** #43 deleted it because the then-current
handoff had none. The spec reinstates it as *optional*, revealed at 2+ selections, with the
auto-name as its **placeholder** — so a blank submit is the expected path, not an error state.

## What changed

- `Thread.Name` may be null for a group; `Thread.Named` records whether anyone chose it.
- `CreateGroupViewModel.Name` is no longer `[Required]`; `StringLength(60)` still applies when
  a name is given.
- `creategroup` stores `null` for blank input and sets `Named` accordingly.
- Migration `ThreadNamedFlag` adds the column **and backfills** — see below.
- `autoGroupName` replaces `deriveGroupName`: three names then `+N`, verbatim from the spec.
- `toThread` derives the title when the server sends none, so it follows membership.
- `ComposeDialog` regains the optional field with placeholder semantics; `ChatApp` passes the
  typed name straight through instead of deriving one to send.

## Decisions and trade-offs

- **The backfill marks every existing named group as `Named`.** We cannot tell, after the
  fact, which stored names somebody chose and which the old code snapshotted. Guessing wrong
  is destructive in one direction only — treating a chosen name as derived would silently
  rewrite it later — so the safe reading is "leave what people already see alone". The cost is
  that groups created by the old code keep a stale title until someone renames them.
- **Direct threads are untouched** by the backfill: they are titled after the other person, so
  `Named` means nothing for them.
- **The client derives, not the server.** The server already sends `members` with every thread,
  so deriving on read costs nothing extra; doing it server-side would mean building the string
  per request for every thread in the list.

## Verified

- **Against the running stack, before and after the migration.** Eight existing groups, all
  named, all still named afterwards (`Named = t`), and **zero** direct threads wrongly marked.
  That is the check that matters: without the backfill every group would have retitled itself
  on deploy — the same failure this change exists to prevent, pointed the other way.
- `POST creategroup` with `"name": ""` → stored `(null)`, `Named = f`. With a name → stored,
  `Named = t`. Both 200.
- **In the browser**: a three-member unnamed group renders as `demoteal, demoorange, i47av1` —
  three first names, where the old code would have shown two and `+1`.
- `dotnet build --no-incremental -warnaserror` 0 warnings, **76 .NET tests**; client
  `npm run verify` clean, **99 tests**.
- **Not verified: removing a member and watching the title change.** There is no remove-member
  feature yet — it arrives with the roles work (#63). The adapter-level test covers it by
  mapping the same thread with one member fewer, which is the mechanism but not the journey.

## Known issues / follow-ups

- **Groups created by the old code keep their snapshotted names**, marked `Named = true`. They
  will not self-correct; renaming is the only way out, and that is deliberate.
- `ThreadDto` has no `named` field — the client infers "named" from the name being present,
  which is sufficient today because the server only sends a name when one was chosen. If the
  server ever sends a derived name, this breaks.
- **#63** (roles) and **#64** (admin console) carry the rest of the spec. Neither is started.
