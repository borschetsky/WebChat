# Profile update finally enforces the uniqueness rule register has always had

- **Date:** 2026-08-31
- **Type:** change
- **Scope:** `WebChat.Services/UserQueries.cs`, `UserService.cs`, `IUserService.cs`,
  `WebChat/Controllers/UsersController.cs`, `AuthController.cs`,
  `WebChat/Controllers/UniquenessProblem.cs` (new),
  `WebChat.Connection/UserUniqueIndexes.cs` (new), migration
  `20260831163827_AddUserUniqueIndexes`, `WebChat.Tests/Users/ProfileUniquenessTests.cs` (new),
  `WebChat.Tests/Users/UserUniqueIndexTests.cs` (new)
- **Status:** done

## Context

Issue #100, filed as a direct consequence of fixing #99 (`docs/ctx/2026-08-21-profile-update-identity-and-broadcast.md`):
re-running the #99 attack against the fixed build no longer let an attacker overwrite the
victim's row, but the attacker's *own* row could still be renamed into `victim94`, leaving two
rows with one username. `register` has always called `isUsernameUniq`/`isEmailUniq`
(`AuthController.cs:114-116`); `POST api/users/update` called neither, and no unique index
existed at the database level either — the rule held at the front door and nowhere else.
Branch `bugfix/100-profile-update-uniqueness`.

## What I found

- **The gap was two-layered, not one.** Nothing stopped a service-level bug from reintroducing
  duplicates even if the availability check were perfect — only a database constraint makes
  "one account per identifier" an invariant rather than a convention that some future code path
  forgets to consult (`UserUniqueIndexes.cs:6-8`).
- **The indexes have to be functional (`lower()`), not plain**, because every lookup in
  `UserQueries` — sign-in, password reset, both availability checks — already compares
  case-insensitively. A plain unique index would be *looser* than the code that reads the
  table: it would happily store `Victim94` beside `victim94`, which sign-in, password reset and
  every member list already treat as one person (`UserUniqueIndexes.cs:10-19`). `citext` was
  considered and rejected: it needs an extension and changes comparison semantics on the
  columns everywhere, where `lower()` is smaller, reversible, and already what the LINQ emits.
- **Deliberately not partial.** Neither a soft-deleted row nor an unconfirmed one is excluded
  from either index, because no lookup excludes them either — a name released by an index
  filter would still resolve a sign-in (`UserUniqueIndexes.cs:21-23`).
- **A null username does not collide with another null**, in both PostgreSQL and SQLite (both
  treat NULLs in a unique index as distinct) — confirmed by
  `UserUniqueIndexTests.Accounts_with_no_username_do_not_collide`. Correct here: registration
  refuses an empty username, so the only nulls that exist are legacy rows.

## What changed

- **`UserQueries.IsEmailAvailable`/`IsUsernameAvailable`** (`UserQueries.cs:71-95`) gained an
  optional `exceptUserId`, used by `UserService.UpdateProfile` but not by register. The
  exclusion branches in C# (`Others()`, `UserQueries.cs:109-110`) as
  `string.IsNullOrEmpty(exceptUserId) ? users : users.Where(...)` rather than folding
  `(exceptUserId == null || u.Id != exceptUserId)` into the predicate, so the SQL register has
  always issued is unchanged and no provider has to be trusted to fold a constant away.
  `Others()` deliberately does **not** exclude soft-deleted rows, matching every existing
  lookup.
- **`UserService.UpdateProfile`** now checks email availability before username (`UserService.cs:58-66`),
  matching register's order — a request colliding on both names the address, because that is
  the identifier a reset link is delivered to.
- **`ProfileUpdate`/`ProfileUpdateOutcome`** (`IUserService.cs:185-226`) replaced a nullable
  return with four endings: `NoSuchUser` (401), `EmailTaken`/`UsernameTaken` (400, nothing
  written), `Updated` (carries the `ProfileBroadcastViewModel` built from the entity after
  `SaveChanges`, per #94). Collapsing the two new refusals into null would have made the
  controller answer 401 to someone whose only mistake was picking a taken name.
- **`UniquenessProblem`** (new, `Controllers/UniquenessProblem.cs`) is two factories —
  `EmailTaken()` → `{ email = "..." }`, `UsernameTaken()` → `{ username = "..." }` — used by
  both `AuthController.Post` (register) and `UsersController.UpdateProfile`, so the client has
  one wire shape for both endpoints. Anonymous types compare structurally, so
  `ProfileUniquenessTests` asserts against the factory rather than a retyped literal.
- **`UserUniqueIndexes`** (new, `WebChat.Connection/UserUniqueIndexes.cs`) holds the two index
  names and the raw `CREATE UNIQUE INDEX ... lower(...)` / `DROP INDEX` strings as constants,
  plus `ApplyTo(DbContext)` which executes the create statements directly. Migration
  `20260831163827_AddUserUniqueIndexes.Up` calls into the same constants rather than a retyped
  copy, so the migration and the test suite both execute the DDL that actually ships.
- **The migration refuses rather than half-applying.** `AddUserUniqueIndexes.RefuseIfDuplicatesExist`
  runs first, inside the same transaction, as a PL/pgSQL `DO` block: it builds a temp table of
  every `(field, lower(value))` group with `count(*) > 1` across both `Username` and `Email`,
  and if any exist, `RAISE EXCEPTION` naming up to 20 colliding identifiers with the offending
  account ids, plus a `HINT` (not `DETAIL` — see below) carrying the two queries an operator
  would run to see the rest. Three options are recorded in the file's docblock and the choice
  explained: let index creation fail on its own (only names the *first* duplicate, not the
  rest), auto-repair the data (rejected — a migration should not silently rebrand one of two
  real people, or merge their messages), or refuse and say exactly what's in the way (chosen).
  **`HINT`, not `DETAIL`, deliberately**: the file's comment records that a first version put
  the report in `DETAIL`, and a run against real data with duplicates came back saying
  "Detail redacted as it may contain sensitive data" — Npgsql strips `DETAIL` by default and
  this app's connection string does not opt back in, so the diagnostic the whole preflight
  exists to produce was silently deleted. `HINT` is not redacted. Because `PrepDB.MigrateDatabaseAsync`
  runs in `Program.Main` before the host starts, a refusal here means the app does not boot —
  the failing instance never becomes healthy and the previous release keeps serving, which is
  judged the right way round.
- **`CLAUDE.md`'s existing "Uniqueness has the same shape of gap" bullet was rewritten in place**
  (already staged as part of this work, `git diff CLAUDE.md`) rather than left describing the
  now-fixed gap; the new text names the two-layer fix, the `lower()` reasoning, and the race
  condition below.

## Decisions and trade-offs

- **Two layers, not one.** Rejected: service check alone (a bug in a future code path could
  reintroduce duplicates with the availability check simply not called) or index alone (every
  save of an unchanged profile would 500 on a raw constraint violation with no field named).
- **`exceptUserId` excludes by id, not by comparing old vs. new values**, so the exclusion is a
  single extra term on the same query shape register already issues, not a second code path.
- **Not partial indexes.** A `WHERE` clause excluding soft-deleted or unconfirmed rows was
  considered and rejected, because it would let a released identifier still resolve a sign-in —
  the same reasoning `Others()` uses for not excluding soft-deleted rows from the service check.
- **Refuse rather than auto-repair on migration.** Explicitly rejected merging or renaming
  colliding accounts automatically: those are two real people, and picking a winner or moving
  messages between them is not a decision a migration takes unattended.

## Verified

- `dotnet build WebChat.sln -c Release`: 0 warnings, 0 errors.
- `dotnet test WebChat.Tests -c Release`: **385 passed, 2 skipped, 387 total** (the two skips
  are the pre-existing `SmtpEmailSenderIntegrationTests`, unrelated). The task summary this
  note was drafted from cited 379; the actual run is 385 — recorded as verified rather than
  reconciling the discrepancy, since the higher, freshly-run number is the trustworthy one.
- Read all nine `ProfileUniquenessTests` (a real `UserService` + `UsersController` over an
  in-memory SQLite `WebChatContext`, no mocking of the row-level claim under test):
  `Renaming_into_an_existing_username_is_refused` and `Taking_an_existing_email_address_is_refused`
  reproduce the reported attack and assert neither row moved; two case-variant tests
  (`ViCtIm94`, `Victim94@Example.COM`) prove the check is case-insensitive like every lookup;
  `A_refused_save_broadcasts_nothing` asserts the hub fake received zero sends on a refusal;
  `Saving_an_unchanged_profile_still_succeeds` and `Recapitalising_your_own_username_still_succeeds`
  are the `exceptUserId` guards — they pass against the *unfixed* availability-check logic only
  if the exclusion is present, and are named as guarding against "the obvious wrong fix";
  `Renaming_to_an_unused_username_still_succeeds` is the plain positive case; and
  `A_request_colliding_on_both_reports_the_email` pins the email-before-username order.
  `UserUniqueIndexTests` (6 more, not in the original file list but in scope as new/untracked)
  separately exercises `UserUniqueIndexes.ApplyTo` against SQLite: duplicates present →
  `ApplyTo` throws; clean table → succeeds; case-variant username/email each refused post-index;
  null usernames don't collide; and one integration test proving the service check and the
  index agree (a taken name is a 400 via the controller, not a raw exception).
  `UserUniqueIndexTests.cs:26-32` documents explicitly that SQLite cannot exercise the
  migration's PL/pgSQL preflight — that part is "checked by hand against a real PostgreSQL
  instead," per the comment; this note did not independently re-verify that claim.

## Known issues / follow-ups

- **The check races the write, and that path is unhandled.** `UserService.UpdateProfile`
  (`UserService.cs:58-71`) checks availability, then writes, with no transaction or retry
  spanning the gap. Two concurrent updates can both pass the availability check for the same
  identifier; the loser then violates the unique index on `SaveChanges()` and raises an
  unhandled `DbUpdateException` — confirmed by reading the method: there is no try/catch
  anywhere in it. The data stays correct (the index is exactly what prevents the duplicate from
  landing), but the caller gets a 500 instead of a 400 naming the field. Handling it needs
  provider-specific detection (Npgsql SQLSTATE `23505` vs. SQLite's own violation exception) and
  its own tests; deliberately not folded into this change. Worth a ticket before it is hit in
  production.
- **Not verified: the migration has never run against the production database.** The
  `RefuseIfDuplicatesExist` preflight could legitimately fire there if duplicate accounts exist
  from before register-time checks were made case-insensitive (`docs/ctx/2026-08-05-login-identity-and-password-reset.md`).
  Worth checking `SELECT lower("Username"), count(*) FROM "User" GROUP BY 1 HAVING count(*) > 1`
  (and the same for email) against production before deploying this migration.
- **Not verified: nothing here was exercised in a browser.** All verification is at the
  service/controller/SQLite level; no docker-compose or live-PostgreSQL pass was run for this
  change.
