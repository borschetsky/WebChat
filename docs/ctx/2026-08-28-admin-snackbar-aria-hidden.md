# The admin console's own snackbar had the #96 defect, in a second implementation

- **Date:** 2026-08-28
- **Type:** change
- **Scope:** `src/app/AppSnackbar.tsx`, `features/admin/AdminConsole.jsx`,
  `features/admin/InviteDialog.jsx`, `features/admin/MemberDetail.jsx`,
  `features/admin/sections/AdminErrors.jsx`, `features/admin/sections/AdminMembers.jsx`,
  `src/test/admin-snackbar-a11y.test.tsx` (new), `src/test/snackbar-a11y.test.tsx`,
  `src/types/admin.ts`, `src/app/api/adminApi.ts`, `features/admin/sections/AdminOverview.jsx`
- **Status:** done

Direct sequel to [Getting the snackbar out of the modal's shadow](2026-08-21-snackbar-out-of-the-modal.md)
(#96) — read that first; this note does not repeat its mechanism.

## Context

Issue #102, branch `bugfix/102-admin-snackbar-aria-hidden`, cut from master `ee49669`. #96's own
"Found and not fixed" section named this exactly: `AdminConsole.jsx` carried a **second, separate
inline `AdminSnackbar`** with the identical defect, and unlike the pre-#89 app shell it had a live
trigger — `InviteDialog.submit` deliberately leaves the dialog **open** on a refused send (right
behaviour, kept untouched), so the one message an admin most needs, the failure, landed inside the
dialog's `aria-hidden` subtree. Message-only today, so pre-#89 severity: nothing to operate, only
something to miss.

## What changed

Two commits on the branch, `8f23024` (the fix) and `04aacbf` (the guard plus stale-comment
cleanup):

- `AdminConsole.jsx`'s inline `AdminSnackbar` function and the `Snackbar` import are gone; the
  console renders `AppSnackbar` with `autoHideDuration={4000}` and `focusTrapped={modalOpen}`.
- `AppSnackbar` gained an optional `anchorOrigin` prop (`AppSnackbar.tsx:1-30`), with a module
  constant `DEFAULT_ANCHOR` = bottom-left for stable object identity across renders. The console
  passes its own `SNACK_ANCHOR` = bottom-centre.
- **There are three focus traps in the console, not the two #96 named** — `InviteDialog`
  (`Dialog`), `MemberDetail` (`Drawer`), and `sections/AdminErrors`'s own detail `Drawer`.
  Confirmed by grep: no `Menu`, `Select` or `Popover` anywhere under `features/admin`. All three
  now take `disableEnforceFocus`.
- `AdminMembers` and `AdminErrors` — the two sections that own a modal — report its open state up
  via `onModalOpenChange`, with a cleanup effect reporting `false` on unmount, so a section left
  with its drawer open on navigating away does not leave the console's `modalOpen` flag stuck true.
- Four stale "the admin console is all mocked" comments corrected: `AdminConsole.jsx`,
  `types/admin.ts`, `adminApi.ts`, `AdminOverview.jsx`. **UI errors is the last mocked section**;
  audit (#70), members (#71), invitations (#72), overview (#73) and policies (#75) are all real,
  and `services/admin-service.ts` imports exactly `mockErrors`/`mockSetErrorStatus` — the file is
  now cited as the authority rather than restating the list, because a comment drifts and that
  file cannot. #74 would finish the set.
- A new source-scan guard in `snackbar-a11y.test.tsx`: `there is one snackbar implementation`
  fails `npm run verify` if any file under `src` other than `src/app/AppSnackbar.tsx` renders
  MUI's `<Snackbar` directly. Same shape as the `inputProps` scan in `mui-drift.test.tsx`. It has
  **no self-exemption** — it first flagged its own docblock (which mentions the component name in
  prose), and that was reworded rather than exempted, on the reasoning that an exemption is a hole
  the next one falls through.

## Decisions worth recording

1. **`anchorOrigin` added; the console keeps bottom-centre** rather than adopting the chat app's
   bottom-left. This is a fallback, not a design decision confirmed against the handoff: the
   design bundle (`Chat Admin Console.dc.html`) is external to the repo —
   [2026-08-11-admin-console-ui-mocks.md](2026-08-11-admin-console-ui-mocks.md) says so — and
   nothing in `docs/` or the source states a toast placement. So folding the second snackbar into
   `AppSnackbar` is behaviour-only; moving a toast the design may have placed deliberately is not
   something an accessibility fix should do on the way past.
2. **`disableEnforceFocus` is driven by "a toast is up" (`snackUp`), not by ChatApp's "the toast
   carries an action."** No admin toast is actionable today, so wiring it the way `ChatApp` does
   would mean a prop tied to a constant `false` — not wiring at all, and untestable. The cost is
   nil: MUI's `FocusTrap` sentinel nodes still bounce Tab back into the trap regardless of the
   flag, so only focus placed outside the trap by other means is affected, and nothing does that
   yet.
3. **One test was written and then deleted**: "toast already up, modal opens second." It *passed
   against the broken code*, because every modal in this console is opened by a click, and MUI's
   `Snackbar` wraps itself in a `ClickAwayListener` — the same click that opens the modal dismisses
   the toast first, so the assertion had no node left to find. That ordering is unreachable in
   this console; `snackbar-a11y.test.tsx` already covers it where the app dispatches toasts from
   places other than a click. Recorded because a test that passes for the wrong reason is worse
   than no test — and the deletion comment inside `admin-snackbar-a11y.test.tsx` says this
   explicitly, so it is not rediscovered.

## Verified

**Red first, reproduced independently rather than taken on report.** Reverted the six touched
source files to `ee49669` (pre-fix) in the working tree via `git checkout ee49669 -- <files>`,
keeping the new test, and ran `admin-snackbar-a11y.test.tsx` alone:

```
Test Files  1 failed (1)
     Tests  6 failed | 2 passed (8)
```

Matches the commit message exactly. The three `it.each(TRAPS)` reproduction cases failed (one per
focus trap), plus the three `stops enforcing focus` wiring-guard cases; the two that passed are
`the console behind the dialog is still hidden` (anti-vacuity, the same shape as #96's guard) and
`a refused send leaves the invite dialog open with its addresses` (pins the live trigger, does not
depend on the fix). Restored the six files to `HEAD` afterward (`git checkout HEAD -- <files>`);
`git status` clean before and after.

**The new scan guard, also proved red independently.** Reverted only `AdminConsole.jsx` to
`ee49669` and ran `snackbar-a11y.test.tsx -t "there is one snackbar implementation"`:

```
AssertionError: expected [ 'features\admin\AdminConsole.jsx' ] to deeply equal []
```

Restored to `HEAD` afterward.

**Each piece broken on its own.** The portal break was re-run directly rather than taken on
report: `Portal` → `disablePortal` in `AppSnackbar.tsx`, both suites together —

```
Tests  10 failed | 7 passed (17)
```

— restored, then `17 passed (17)`. That is the decisive one, because it is the single mechanism
both screens now share. The other two were reported and not re-run here: `disableEnforceFocus`
removed from all three modals gives 3 failed / 5 passed, and `focusTrapped` forced false gives
**8 passed — nothing fails**.

That last is an honest negative and the reason it is stated rather than buried: `AppSnackbar`
only reads `focusTrapped` when the toast carries an action, and no admin toast does. So that flag
and the `onModalOpenChange` plumbing feeding it are **not exercised by any test today** — it is
correctness banked for the next admin toast that grows an action, not behaviour proven now.

**Full gate**, re-run directly against the final `HEAD` (`04aacbf`):

```
npm run verify
  lint: clean (oxlint --deny-warnings)
  format:check: All matched files use Prettier code style!
  typecheck: clean
  test: Test Files 23 passed (23) / Tests 302 passed (302)
  build: vite build ✓ built in 230ms
```

302/23 matches the commit's own count (was 293/22 per #96's note). `snackbar-a11y.test.tsx` alone
is 10 tests (9 plus the new scan); `admin-snackbar-a11y.test.tsx` is 8. Confirmed by grep: `onClose`
on both the app-shell and admin snackbars discards MUI's close `reason`
(`AdminConsole.jsx:427`, `AppSnackbar.tsx:136`) — see Found and not fixed below.

## Not verified

- **No browser check at all**, same gap #96 recorded and the same reason: the Chrome extension on
  this machine only has remote macOS instances attached, which cannot reach `localhost` — this is
  #86's territory. Unverified: the toast's real position at bottom-centre, its z-index over the
  three modals, whether it overlaps the invite dialog on a phone, and any real screen-reader
  announcement.
- No .NET build or test run — nothing outside `ClientApp` changed.
- Nothing deployed.
- Two of the three per-piece breakages (`disableEnforceFocus`-only, `focusTrapped`-only) are as
  reported and were not re-derived; the portal break, which is the one both screens share, was.

## Found and not fixed

**Both snackbars — the app shell's and the admin console's — are dismissed by any click
anywhere.** `onClose` on both ignores MUI's `reason` argument, so a `clickaway` clears the toast
and a message can vanish on the next unrelated click before it is read. Confirmed at
`AppSnackbar.tsx:136` and `AdminConsole.jsx:427`; pre-existing, shared with `ChatApp`, and it is
exactly what made the deleted "toast up first" test vacuous (the click that opened a modal also
dismissed the toast via `ClickAwayListener`). Candidate for a future issue, not filed here.

## CLAUDE.md

Not touched, deliberately. The candidate rule — "render `AppSnackbar`, never MUI's `Snackbar`
directly" — is now enforced by the new source scan, which fails `npm run verify` on a violation;
per the checkpoint skill, a trap the gate itself catches does not also need permanent context. The
mock-seam bullets in `CLAUDE.md` and `ORIENTATION.md` describe the *chat* seam (`services/mocks.ts`,
six features), not the admin console, and remain accurate.
