# Workspace roles, and a bootstrap that creates the first admin

- **Date:** 2026-08-11
- **Type:** change
- **Scope:** `WebChat.Data/WorkspaceRole.cs`, `WebChat.Data/User.cs`,
  `WebChat.Data/ViewModels/ProfileViewModel.cs`, `WebChat.Services/BootstrapAdmins.cs`,
  `WebChat.Services/UserService.cs`, `WebChat.Services/Helpers/MappingService.cs`,
  `WebChat/Startup.cs`, `WebChat/Seed/PrepDB.cs`, migration
  `20260810223323_AddWorkspaceRole`, `WebChat.Tests/Auth/WorkspaceRoleTests.cs`,
  `WebChat/.env.example`, `WebChat/docker-compose.yml`
- **Status:** done (commit `6419ee0`, branch `feature/67-workspace-roles`, pushed, no PR yet)

## Context
Issue #67 — the first slice split off #64 (the admin console). The console can only be
opened by an owner, and until this change there was no workspace-level role at all: no
column, no claim, no check, and therefore no way to make anyone one.

## What changed
- `WorkspaceRole` (`WebChat.Data/WorkspaceRole.cs`) — string constants `Owner`/`Admin`/
  `Member`, mirroring `GroupRole` for the same reason: the values cross the wire to a
  TypeScript client with no enum. `IsValid` and `CanAdminister(role)` (owner or admin) live
  on the type.
- `User.Role` (`User.cs:28-40`) — `[Required] [MaxLength(20)]`, default `WorkspaceRole.Member`.
  Migration `20260810223323_AddWorkspaceRole` adds it `NOT NULL` and backfills every existing
  row with an explicit `UPDATE ... WHERE "Role" IS NULL OR "Role" = ''` — the scaffolded
  default was an empty string, not a valid role, so the SQL backfill is deliberate, not
  belt-and-suspenders.
- **`UserService.CreateUser` now sets `Role = WorkspaceRole.Member` explicitly** at
  registration (`UserService.cs`, comment cites #63 by name) rather than relying on the
  column default. This pairing — backfill *and* fix the write path in the same commit — is
  the load-bearing lesson from #63: that migration backfilled `GRole` on existing threads
  while `ThreadService.AddParticipants` still wrote the column default, and the backfill hid
  it so completely that every group created after the migration had no owner (see
  `2026-08-11-group-roles-endpoints-ui.md`). A backfill alone is half a change.
- `BootstrapAdmins.PromoteAsync` (`WebChat.Services/BootstrapAdmins.cs`) — reads
  `Admin:BootstrapOwners` (a config *list*, e.g. `Admin__BootstrapOwners__0=...`), and for
  each configured address: skips if no such user, skips with a warning if unconfirmed,
  skips if already owner, otherwise promotes and logs. Called from `WebChat/Seed/PrepDB.cs`
  after `MigrateAsync`, so the `Role` column exists by the time it runs.
- `ProfileViewModel.Role` and `MappingService`'s user→profile map now carry the role, so
  `GET /api/users/getprofile` returns it (`"role":"owner"` etc.) for the settings drawer to
  read.
- `Startup.cs`, `OnTokenValidated` (around line 214-247) — the handler already re-loads the
  user row on every authenticated request to compare `SecurityStamp` (added 2026-08-05 for
  JWT revocation). It now also selects `Role` in the same query and adds a
  `ClaimTypes.Role` claim to the principal from it. A comment in that block spells out: if
  this database read is ever removed for performance, whoever removes it inherits the
  decision below.
- `.env.example` documents `ADMIN_BOOTSTRAP_OWNER`; `docker-compose.yml` maps it to
  `Admin__BootstrapOwners__0` with a comment noting deliberately no `:?` — an unset value
  just means no admin console, not a failed boot.

## Decisions and trade-offs
- **Config-driven promotion, not the alternatives.** Manual SQL works once, is
  unrepeatable, and leaves no record of *why* someone is an owner — and reaching a managed
  database on App Platform means doing it from a laptop. Seeding a user in a migration bakes
  a person into schema history and can't differ per environment. "First registered user
  wins" is a real hole while registration stays open: on a fresh deployment, whoever reaches
  `/register` first owns the workspace.
- **Confirmed addresses only.** Promoting an unconfirmed one would let anyone who learns a
  configured address register it and inherit the workspace — the exact attack the list
  exists to prevent.
- **An address with no account yet is not an error**, just logged and skipped. Configuring
  before the person registers is a supported order of events; they get promoted on the next
  boot after they confirm.
- **The role is deliberately NOT carried in the JWT.** Tokens live seven days
  (`jwtLifeSpan`), so a demoted admin would keep their powers for up to a week if the role
  travelled with the token. The textbook fix — rotating `SecurityStamp` — is the
  password-reset path and would sign the user out of every device over a mere change of
  role. Instead the role rides on the `OnTokenValidated` read that already happens on every
  request for stamp revocation, so it costs one extra selected column, and demotion takes
  effect on the very next request. This is the central decision of the note; see the comment
  in `Startup.cs` for the exact wording that ties it to that database read.
- **`BootstrapAdmins` was moved from `WebChat/Seed/` (the host project) into
  `WebChat.Services`** because `WebChat.Tests` did not reference the host project — logic
  that needs a test could not live there.

  > **No longer true as of #70** (2026-08-11). `WebChat.Tests` now references
  > `WebChat.csproj` and takes `Microsoft.AspNetCore.Mvc.Testing`, so host code *is*
  > testable — see `2026-08-11-admin-api-and-audit-log.md`. The constraint was never a hard
  > one; nobody had tried. `BootstrapAdmins` stays in `WebChat.Services` regardless, because
  > it is service logic and a unit test beats booting a host. What changes is that
  > `SystemDataJson` and anything else host-side is no longer untestable by definition.
- No security-stamp rotation on promotion — same reasoning as the JWT decision above; the
  role is live on the next request regardless.

## The escalation boundary (the reason this note exists)
`SPEC-groups-and-admin.md` §2 (external design handoff document, not checked into this
repo — cited the same way earlier group-role notes cite it) states a workspace Admin has no
authority inside a group they do not administer; this is what stops the admin console being
a backdoor into private conversations. `GroupPermissions.Can` takes only a group role and a
`Thread` — it cannot see `User.Role` even if a caller wanted it to. A new test,
`WorkspaceRoleTests.The_workspace_owner_gets_no_authority_inside_a_group`
(`WebChat.Tests/Auth/WorkspaceRoleTests.cs:157-188`), pins this: a user who is a workspace
`Owner` but only a group `Member` gets none of `Rename`/`SetPermissions`/
`TransferOwnership` on that thread. Its closing assertion is deliberately the place to
argue if `GroupPermissions`'s signature ever grows a `User` parameter.

`docs/ctx/ORIENTATION.md`'s "Group authorization — two axes, not one" section
(around line 126) was written before this role existed in code, already asserting group
roles must stay independent of "any workspace role" — this commit is what makes that
concrete, and ORIENTATION was updated in the same pass as this note to cite the real types
and the pinning test.

## Verified
- `WebChat.Tests/Auth/WorkspaceRoleTests.cs` has 8 `[Fact]`s, read directly: address
  promotion, idempotent re-run, case-insensitive match, unconfirmed-address refusal,
  no-account is not an error, only the configured address is touched, empty configuration
  promotes nobody, and the escalation-boundary test above.
- Commit message states: 0 warnings, 133 .NET tests (up from 125 before this commit per the
  prior note's count), 8 new.
- **Against the running docker stack, both branches** (per commit message, not
  independently re-run by this note): registering the configured address unconfirmed →
  boot logs "registered but unconfirmed; not promoting"; confirming and restarting →
  "Promoted … from member to workspace owner via Admin:BootstrapOwners"; restarting again →
  no second promotion, exactly one owner and 49 backfilled members. `/api/users/getprofile`
  returns `"role":"owner"`.

## Known issues / follow-ups
- **Production still needs `Admin__BootstrapOwners__0=wod.moshkin@gmail.com` set by hand**
  in the DigitalOcean App Platform console. Deliberately not done via
  `doctl apps update --spec`, which replaces the whole spec and would overwrite live
  JWT/R2/SMTP secrets. `.do/app.yaml` still carries 6 `REPLACE_ME` placeholders (pre-existing,
  not introduced here).
- Local value lives in `WebChat/.env` (gitignored, not committed).
- Nothing yet demotes or promotes a user through a UI — that is #64, and only the admin
  console *shell* landed for it so far (see the companion note on commit `e9d493b`).
- No PR opened yet for `feature/67-workspace-roles`.
