# Invitations

- **Date:** 2026-08-13
- **Type:** change
- **Scope:** `WebChat.Data/Invitation.cs`, `WebChat.Data/ViewModels/AdminInvitationViewModel.cs`, `WebChat.Connection/Migrations/20260812185236_AddInvitations.cs`, `WebChat.Connection/WebChatContext.cs`, `WebChat.Services/Email/{InvitationTokenService,InvitationEmail,EmailOptions}.cs`, `WebChat.Services/Email/Templates/InviteToWorkspace.html`, `WebChat.Services/{IInvitationService,InvitationService}.cs`, `WebChat/Controllers/{AdminController,InvitationsController}.cs`, `WebChat/Startup.cs`, `WebChat.Tests/Admin/InvitationServiceTests.cs`, client `types/admin.ts`, `services/{admin-service.ts,admin-mocks.ts,api-service.js}`, `app/api/adminApi.ts`, `features/admin/{InviteDialog.jsx,sections/AdminInvitations.jsx}`, `features/auth/AcceptInvite.jsx`, `app/App.jsx`
- **Status:** done

## Context

Issue #72, slice 3 of 6 turning the mocked admin console into real functionality (splits
#64, follows #70's audit log and #71's account statuses). Branch `feature/72-invitations`.
Turns the mocked Invitations panel into real invite/resend/revoke against the database and
adds the invitee-facing side: an anonymous inspect endpoint and an authenticated redeem
endpoint, plus a landing page at `/invite`.

## Two decisions the repo owner made explicitly

Both were put to the owner directly rather than assumed, and both went the way the
research note recommended — the first against `SPEC-groups-and-admin.md`, which specifies
extending as moving the deadline without a new link:

1. **Extend rotates the token and resends — one operation, two labels, not two
   operations.** The 30-day cap bounds how long a mailed secret stays live (sat in an
   inbox, passed a scanner, possibly archived); silently moving the deadline extends
   exactly that exposure, invisibly to the invitee. The trap that forces extend and resend
   together: if you rotate you must re-send, or clicking "extend" to help somebody has just
   broken the link they already hold. There is no `extendInvite` anywhere in the codebase —
   `adminApi.ts:103` and `admin-service.ts:129` both say why in a comment; the UI has one
   "Resend" button.
2. **Bearer links, not address-bound.** Whoever opens the link joins — `Invitation.cs:9-14`
   states this is deliberate, since invitations get forwarded and an address-bound link
   would lock out someone who registers with a different address for no visible reason.
   Compensated by single-use redemption (the conditional `UPDATE` below), revocation the
   redemption path checks, and `RedeemedByUserId` plus an audit entry naming who *actually*
   redeemed rather than who was invited.

## Server

- `Invitation.cs` (`WebChat.Data/Invitation.cs:24-94`) — `Email`, `TokenHash`, `SentAtUtc`,
  `ExpiresAtUtc`, `InvitedByUserId`, `Role`, `PendingUserId`, `RedeemedAtUtc`,
  `RedeemedByUserId`, `RevokedAtUtc`, plus `IsOpen(nowUtc)`.
- Migration `20260812185236_AddInvitations` — unique index on `TokenHash` (the token is
  never stored, so the hash *is* the lookup key), plus non-unique indexes on `Email` and
  `PendingUserId`.
- `InvitationTokenService` (`WebChat.Services/Email/InvitationTokenService.cs`) —
  subclasses `EmailConfirmationTokenService` with a 30-day lifetime, the same precedent
  `PasswordResetTokenService` set. Same mechanics: 256-bit CSPRNG, SHA-256 hash-only
  storage, constant-time compare, base64url. `EmailOptions.InvitationLifetimeDays = 30`.
- `InvitationEmail.cs` + `Templates/InviteToWorkspace.html` (copied from
  `ResetPassword.html`, new copy, registered as an `EmailResource` in the csproj). **No
  `{{Username}}` token**, unlike the other two templates: this writes to an address that
  may belong to nobody, so there is no name to greet them by that would not be invented —
  the inviter's name carries the personal part, which is also what makes the mail credible
  rather than phishy.
- `IInvitationService`/`InvitationService`; `AdminInvitationViewModel`.
- `AdminController` gained `GET/POST /api/admin/invitations`, `POST .../{id}/resend`,
  `POST .../{id}/revoke`; sending and resending are rate-limited by the existing
  `EmailSendPolicy`.
- **`InvitationsController` is a separate controller on purpose** — `AdminController`
  carries a class-level `[Authorize(Roles = owner,admin)]` and the person opening an
  invitation is by definition neither, usually not signed in at all. `GET
  /api/invitations/{token}` is `[AllowAnonymous]` and returns only the invited address,
  role and expiry; `POST /api/invitations/{token}/redeem` is `[Authorize]`.

## Decisions inside the implementation worth recording

- **The pending `User` row is created at invite time**, not at redemption
  (`InvitationService.cs:119-147`). That is what makes "revoking deactivates the pending
  account immediately" expressible and what puts an invited person in the members table
  before they have ever signed in. `EmailConfirmed = true` on it: the invitation reaching
  their inbox already proved the address, and asking again would be asking them to prove it
  twice.
- **Inviting an address that already has a usable account is skipped, not fatal**
  (`InvitationService.cs:111-115`). An admin pasting ten addresses from a spreadsheet
  cannot be expected to have deduped against the workspace first; nine invitations beats
  zero and an error. A *pending* address is different — that is a resend in all but name,
  so it gets a fresh token.
- **Re-inviting a pending address supersedes the outstanding invitation**
  (`InvitationService.cs:149-156`). Two live links to one pending account would mean revoke
  could not honestly claim to have closed it.
- **Owner cannot be invited into** (`InvitationService.cs:70-75`) — an invitation cannot
  hand over the workspace.
- **An expired invitation can still be resent** (`InvitationService.cs:203-209`) — that is
  how an admin revives one for somebody on leave; a redeemed or revoked one cannot.
- **Redemption never lowers an existing role** (`InvitationService.cs:332-338`) — an owner
  who opens a member invitation is not demoted by it.
- **The inspect endpoint returns the same answer for "no such token" and "no longer
  usable"** (`InvitationsController.cs:49-59`), so it cannot become an oracle for whether a
  guessed token ever existed; neither case leaves the invitee anything different to do.
- The client landing page (`features/auth/AcceptInvite.jsx`, route `/invite`) **inspects
  before asking anyone to sign in** — a stranger needs to see which workspace is asking, at
  what address, before deciding whether to register; a bare sign-in form would be
  indistinguishable from a phishing page. Redeeming needs a session, so the flow is inspect
  → register or sign in → redeem. Creating the account on that page instead would mean a
  second registration path with its own validation, uniqueness and password rules to keep
  in step. It is **statically imported** in `App.jsx` alongside the other auth screens
  (`AuthScreen`, `CheckYourEmail`, `ConfirmEmail`, `ForgotPassword`, `ResetPassword`) rather
  than lazily like `ChatApp`/`AdminConsole`: it is the first page an invited stranger sees,
  and a failed chunk fetch would leave them looking at nothing.

## The race, and the bug it caused

`RedeemAsync` (`InvitationService.cs:296-358`) claims the invitation with **one conditional
`UPDATE`** (raw SQL via `ExecuteSqlInterpolatedAsync`) whose `WHERE` re-checks not-redeemed,
not-revoked and not-expired; the affected-row count decides. A read-then-write lets a
double-clicked link — the ordinary way this happens — redeem twice. EF's change tracker
cannot express "update only if the row still looks like this" without an explicit
concurrency token, and adding one would be a second mechanism for a single statement.

**That conditional update caused a real bug, caught by a test.**
`A_redeemed_invitation_cannot_be_revoked` failed, and not because the check was missing:
the raw UPDATE goes around the change tracker, so the tracked copy still read as open and
revoke acted on stale data. Invisible in production, where each request gets its own scoped
context — it would have waited for the first caller that did both in one scope. Fixed with
an explicit `ctx.Entry(invitation).ReloadAsync()` after the claim
(`InvitationService.cs:327`).

**One expectation reported by the implementing session was wrong, and the corrected
behaviour is better:** after a rotation the old token returns `NotFound`, not `NotOpen`.
Rotation *overwrites* the stored hash, so the previous secret is not marked closed — it is
gone; `FindAsync` (`InvitationService.cs:364-370`) simply finds nothing. The test suite
encodes this.

## Client

- `types/admin.ts` — `AdminInvite` gained `role`; its comments explain `sentAtUtc` moves on
  every resend (a resend mints a new token rather than re-mailing the old one) and
  `expiresAtUtc` bounds *this token's* life rather than the invitation's.
- `api-service.js`, `admin-service.ts`, `app/api/adminApi.ts` — invitations are real;
  `extendInvite` is gone, `resendInvite` replaces it. A `SendInvitesResult`-shaped envelope
  carries `invitations`, `skipped` and `failed`, because "already a member" and
  "invitation stored but mail failed" are different outcomes and only the second needs
  anybody to act.
- `InviteDialog` summarises those three outcomes rather than claiming "5 invitations sent",
  and stays open on a failure so a pasted list of twenty is not lost.
- The `INVITES` fixture and every invitation mock are deleted; `admin-mocks.ts` now carries
  only a comment noting invitations moved off it, plus the fixtures for the panels that are
  still mocked (UI errors, policies, 14-day overview chart).
- A lint finding worth recording: `oxlint`'s React Compiler rule `set-state-in-effect`
  rejected calling `setState` synchronously in an effect body for the missing-token case.
  Fixed by deciding it in the `useState` lazy initialiser (`AcceptInvite.jsx:29`) — the
  token comes from the URL and cannot change without remounting.

## Verified

- `dotnet build WebChat.sln --no-incremental -warnaserror`: **Build succeeded, 0
  warnings** — re-run directly in this pass.
- `dotnet test WebChat.Tests`: **198 passed, 2 skipped** (was 180 per #71's note) — re-run
  directly. New: `Admin/InvitationServiceTests.cs` (18 test methods).
- `npm run verify`: **153 client tests**, lint/format/typecheck/build all clean — re-run
  directly.
- The following live-stack and race checks are as reported by the implementing session and
  were not re-run in this pass, but are consistent with the code read above:
  - Against docker compose (12th migration applied): sending two addresses where one was
    already a member returned exactly one invitation with the other in `skipped`; the
    anonymous inspect endpoint returned address/role/expiry; an unknown token 404'd;
    redeem without a session 401'd.
  - **The race, proven concurrently rather than sequentially:** two `curl` redemptions of
    the same link fired in parallel returned **200 and 400**, with exactly **one** row
    claimed. The redeeming account was `plainmember@example.com` against an invitation
    addressed to `newperson@example.com` — the bearer-link behaviour, recorded in
    `RedeemedByUserId`.
  - **Rotation:** a planted token returned 200 from inspect, a resend was issued, and the
    same token then returned **404** — the previous link dead.
  - **Revocation:** revoking left the pending account `deactivated`, and the audit log
    showed the full `sent → resent → revoked` sequence for that address plus the
    `activate/redeemed` entry for the redemption.
  - Method note for the live checks: tokens are never stored, so verification planted a
    known `TokenHash` computed as uppercase-hex SHA-256 of a chosen string — the same
    transform `EmailConfirmationTokenService.Hash` applies.

## Known gaps — state plainly

- **Redemption grants workspace membership only. It joins no groups**, because the
  workspace has no concept of default groups. Somebody who accepts an invitation lands in a
  workspace with an empty conversation list until a member starts a thread with them.
- Registration through an invitation is the *ordinary* registration flow followed by a
  return to the link — the invitation does not pre-fill the address, and a registrant using
  a different address still redeems successfully because the link is bearer.
- No React-level test drives `AcceptInvite` or `AdminInvitations`.
- Nothing prunes redeemed or revoked invitations; the table only grows.
- UI errors and policies remain fixtures (#74, #75). Overview is still half real — stat
  cards from live members, 14-day chart still fixture (#73).
- No visual pass on the console, carried from #68.

## Related

`docs/ctx/ORIENTATION.md` already gained a paragraph on deactivation being the one place a
workspace action reaches into a group, from #71 — not repeated here.
