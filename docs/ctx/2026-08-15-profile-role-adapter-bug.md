# The admin console was unreachable from a browser for five slices — `toProfile` dropped `role`

- **Date:** 2026-08-15
- **Type:** change
- **Scope:** `ClientApp/src/services/adapters.ts`, `src/types/dto.ts`, `src/types/models.ts`, `src/services/adapters.test.ts`; readers at `SettingsDrawer.jsx:200`, `App.jsx:364`
- **Status:** done

## Context

Issue #82 / PR #82 (`faea54e`), "Carry the workspace role through the profile adapter." The
owner asked why he still had no admin link after being promoted to workspace owner. The
admin console (#64, shipped across five slices: #70 audit log, #71 members, #72 invitations,
#73 overview, #75 policies) had been unreachable from a browser **since it was first built in
#68** — not broken, unreachable. The server side worked correctly for the entire time.

## What I found

- `/users/getprofile` has always sent `role`, read fresh from the database on every call:
  `UsersController.GetProfile` (`WebChat/WebChat/Controllers/UsersController.cs:37`) →
  `UserService.GetUserProfile` → `MappingService.MapUserModelRoProfileViewModel`, which does
  `Role = model.Role` at `WebChat/WebChat.Services/Helpers/MappingService.cs:95`.
- The client threw it away. `toProfile` in `adapters.ts` (pre-fix) mapped `id`, `name`,
  `email`, `avatarFileName`, `color` and never mentioned `role`. Neither `ProfileDto`
  (`src/types/dto.ts`) nor `Profile` (`src/types/models.ts`) declared the field either, so
  there was nothing for `tsc` to complain about — `profile.role` was `undefined` for every
  user, always.
- Both readers fail closed on `undefined`, and both live in `.jsx`, where nothing
  type-checks a property that does not exist:
  - `SettingsDrawer.jsx:200` — `isAdminRole(profile?.role)` gates the "Workspace" section
    that holds the admin console link, so the link never rendered for anyone.
  - `App.jsx:364` — `if (!profile || !isAdminRole(profile.role)) return <Navigate to="/dashboard" replace />;`,
    the `/admin` route guard, so even typing the URL bounced an owner to `/dashboard`.
- Same blind spot named in the `inputProps` note from the day before (`3d347de`, see
  `docs/ctx/2026-08-14-policies.md`): the components that matter for this class of bug are
  `.jsx`, so the type system never sees the missing property. There it cost an accessible
  name on a `Switch`; here it cost an entire feature area, invisibly, across five merged
  slices — because every one of those slices was verified against the API, not against the
  browser.
- `BootstrapAdmins.PromoteAsync` (`WebChat/WebChat.Services/BootstrapAdmins.cs`) has no
  `SecurityStamp` reference at all (confirmed by grep) — it deliberately does not rotate the
  stamp on promotion, consistent with the existing CLAUDE.md note that role is read from the
  database per request rather than carried in the JWT, so a promotion needs a reload, not a
  re-login.
- `PrepDB.MigrateDatabaseAsync` calls `BootstrapAdmins.PromoteAsync` at
  `WebChat/WebChat/Seed/PrepDB.cs:48`, after `MigrateAsync` so the `Role` column exists — this
  is the code path that actually promoted the account being tested, and it logged
  `Promoted wod.moshkin@gmail.com from member to workspace owner via Admin:BootstrapOwners`
  correctly. The bootstrap promotion was never the problem; the adapter was.

## What changed

- `ProfileDto.role?: string | null` added (`src/types/dto.ts:26`), documented as optional
  because a server predating #68 omits it.
- `Profile.role: string | null` added (`src/types/models.ts:167`), documented as "as the
  server currently holds it — not as the token claimed at sign-in."
- `toProfile` now maps `role: vm.role ?? null` (`adapters.ts:239`). A roleless body maps to
  `null` rather than a guess — `isAdminRole` reads `null` as "not an admin," the safe
  direction for a permission check.
- Two tests added to `adapters.test.ts`: "carries the workspace role through" and "degrades a
  roleless profile to null rather than inventing a role." Both were run against the pre-fix
  code and failed as expected (`expected undefined to be 'owner'`,
  `expected undefined to be null`) before the fix landed.
- `CLAUDE.md` gained a bullet in the same session, merged separately as `c9905e2` (PR #83):
  records that `adapters.ts` maps DTOs field by field and a field it does not name is
  dropped silently; that adding a field to a view model means editing the DTO, the model
  *and* the adapter, and testing the adapter; and that a feature working over `curl` but not
  in the app should make you suspect this seam first.
- Unrelated CLAUDE.md bullet also merged same evening, `def0b61` (PR #81, issue #17
  already tracked it): "Merging to master does not deploy" — the live app was created from a
  plain `git:` clone source, so `.do/app.yaml`'s `deploy_on_push: true` describes an
  integration it does not have. Found while deploying #75; not otherwise related to the
  profile-role bug.

## Decisions and trade-offs

- **`null` on missing role, not a default like `'member'`.** A guessed role that happens to
  be wrong is a privilege question; a missing role should deny, not assume. This is why the
  fix maps to `null` and leans on `isAdminRole` already treating anything non-admin as
  denied, rather than inventing a fallback value.
- **No change to the server.** The DTO the API sends was already correct and complete; only
  the client-side chain (type declarations + mapping function) was fixed. Nothing on
  `MappingService` or `UsersController` needed touching.

## Verified

- Read `adapters.ts` before and after: `role: vm.role ?? null` present at line 239 of the
  current file, with the comment explaining it is "load-bearing, and it was missing for five
  slices."
- Read `dto.ts:25-26` and `models.ts:164-167` — both declare `role`, matching the diff in
  `faea54e`.
- Grepped `SettingsDrawer.jsx` and `App.jsx` and confirmed the exact cited lines:
  `SettingsDrawer.jsx:200` (`isAdminRole(profile?.role)`) and `App.jsx:364`
  (`if (!profile || !isAdminRole(profile.role)) return <Navigate to="/dashboard" replace />;`).
- Confirmed the server chain: `UsersController.cs:37` (`GetProfile`),
  `MappingService.cs:95` (`Role = model.Role`).
- Confirmed `PrepDB.cs:48` calls `BootstrapAdmins.PromoteAsync` after migration, and that
  `BootstrapAdmins.cs` never references `SecurityStamp`.
- Re-ran the client suite directly: `npm run test -- --run` → 188 passed, 16 files (was 186
  per the 2026-08-14 note). Did not independently re-run `npm run verify` in full during this
  pass; the PR's own CI (job `client`) is what gated the merge.
- Confirmed via `gh pr view 82` that PR #82 is merged, +41/-0, matching the local diff of
  `faea54e`.
- Confirmed via `gh issue view` that #86 (admin console browser QA), #74 (UI errors), #84
  (avatar cropper) and #85 (registration 500 after SMTP timeout) are all open, and that #86's
  body already names this bug as the example of the gap it tracks.
- **Not independently re-verified:** the live production behavior (owner sees the link and
  can reach `/admin` in a real deployed browser). Taken as reported — no browser QA pass has
  been run on the admin console at any point since #68, which is precisely what #86 tracks.
  The commit message and PR description are the source for the "found by the owner pasting a
  raw API response" story; not something a note-writer can re-derive from the repo.

## Known issues / follow-ups

- **#86 — no browser QA pass has ever been run on the admin console.** Open since before this
  bug; this bug is the reason it now has teeth as an example rather than a hypothetical risk.
  Carried in every admin-console note since #68.
- **#74 — UI error ingestion**, blocked on a Sentry-vs-hand-rolled decision. Pre-existing,
  unrelated to this fix.
- **#84 — avatar cropper (pan/zoom before upload)**, researched but not built. Pre-existing.
- **#85 — registration can 500 after a 152s SMTP timeout**, undiagnosed. Pre-existing.
- **The `.jsx`/type-checking blind spot itself is not closed.** This fix and the `inputProps`
  fix the day before are two instances of the same class (untyped `.jsx` files reading
  properties or props that TypeScript never checks); nothing was added to catch a *future*
  instance automatically the way `mui-drift.test.tsx` now scans for the `inputProps` pattern.
  A grep-based regression guard for "adapter output field referenced in `.jsx` but absent
  from the model type" was not attempted and would likely be difficult to write generically.
