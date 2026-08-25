# Getting the snackbar out of the modal's shadow

- **Date:** 2026-08-21
- **Type:** fix
- **Scope:** `ClientApp/src/app/AppSnackbar.tsx` (new), `app/ChatApp.jsx`,
  `features/settings/SettingsDrawer.jsx`, `features/threads/{GroupInfoDrawer.tsx,ComposeDialog.jsx}`,
  `src/test/snackbar-a11y.test.tsx` (new), `src/test/avatar-remove.test.tsx`
- **Status:** done

## Context

Issue #96, branch `bugfix/96-snackbar-aria-hidden`, rebased onto `a861567` after #91 landed.

The app's single `Snackbar` rendered **inline** in `ChatApp`. `SettingsDrawer` is a MUI `Drawer`,
i.e. a modal, and MUI marks the rest of the document `aria-hidden="true"` while a modal is open —
so any toast raised from the drawer was visible and mouse-clickable but **invisible to a screen
reader and unreachable by keyboard**. Measured in a browser at 390 px: "Profile updated" raised
from the open drawer sat inside `aria-hidden="true"`.

Harmless while every toast was message-only — nothing in a message to *operate*. [#89](2026-08-20-avatar-removal.md)
made one actionable ("Profile photo removed / UNDO") and worked around this by closing the
drawer, which was right for that flow and not a general fix.

## What changed

`AppSnackbar` wraps the toast in a MUI `Portal`. Three further pieces, each proved necessary by
breaking it on its own rather than assumed:

| Removed | Result |
|---|---|
| `disableEnforceFocus` on the three modals | 3 tests fail — the focus trap drags focus back onto the drawer paper |
| the `MutationObserver` stripping `aria-hidden` | 1 test fails — `ariaHiddenSiblings` runs **once, at modal-open**, over the children `body` has *then*, so the portal alone only covers one of the two orders |
| the focus hand-off | the action is in the a11y tree and still not operable — `FocusTrap`'s sentinels send Tab back to the top of the trap **regardless of `disableEnforceFocus`**, so there is no tab path out to it |

That third one is the counter-intuitive part: `disableEnforceFocus` stops focus being *yanked
back*, but it does not create a tab route *out*. Hence the action takes focus, but only while a
modal is trapping — auto-focusing a toast is otherwise rude.

## Decisions

1. **#89's drawer-close is reverted.** Undo means "put me back where I was", and it cannot if
   pressing Remove already threw you out of settings. Worse, closing the drawer **silently
   discarded an unsaved display name or email**, because `SettingsDrawer` resets its fields in an
   effect keyed on `open`. #89's pinning test now asserts the opposite, and the comment that
   justified the close as an accessibility workaround is rewritten — a justification that is no
   longer true is worse than none.
2. **A focused toast pauses MUI's auto-hide timer** (resumes at half on blur), so an actionable
   toast waits for the user instead of expiring at 8 s. Right for the one control standing where
   a confirm dialog would be, but a visible behaviour change from #89. *This is also what made it
   awkward to photograph — see below.*
3. **`disableEnforceFocus` wired to all three modals**, not only the one that raises the only
   actionable toast today.
4. **The `aria-hidden` strip is a deliberate exemption** from the modal's hide-everything-else
   rule, scoped to this one root.
5. An `onKeyDown` Escape handler was written, then **deleted** on finding `useSnackbar` already
   closes on Escape from a document listener. The docblock says not to add one back.

## Verified

- Red first: **6 failed | 2 passed** against unmodified `a9e6498`. The two that passed are guards,
  and one of them — *"the app behind the drawer is still hidden"* — exists to prove jsdom really
  does reproduce MUI's sweep, so the reproduction is not vacuous.
- `npm run verify` — **293 tests across 22 files** (was 284/21).
- **In a browser at 390 px**, which is the whole point, since the drawer is full-width there and
  #89 used to close it so this arrangement had never been seen:
  - toast is a **direct child of `body`** (the portal worked);
  - Undo is **not** inside an `aria-hidden` subtree, and **has focus**;
  - `elementFromPoint` at the Undo's centre returns **the Undo button itself** — nothing overlays
    it. This is stronger evidence than a screenshot, which is what it replaced;
  - z-index 1400 against the drawer's 1200; rect `(8, 782) 374×54` fully inside a 390×844 viewport;
  - remove → avatar falls to initials, **drawer stays open**; Undo → photo back and crop unchanged
    to the digit; no console errors or warnings through the cycle.
- **No regressions**: #88's round-trip fixed point still leaves `{25.390625, 6.25, 49.21875, 87.5}`
  untouched after an untouched adjust-and-save, and #92 holds — `fullScreen` true, paper 390,
  stage 320×320, circle 280 fitting.

## Two things worth recording about the verification itself

**I nearly reported a false regression.** A check read `fullScreen: false`, which at 390 px would
have meant #92 was broken. It was my measurement error: the value was evaluated *after* clicking
Save, when the dialog had already closed, so `querySelector` found nothing. The geometry gave it
away — the stage measured 320.0, and a non-full-screen paper at 390 px produces 278.4. Re-measured
while the dialog was open: `fullScreen: true`.

**The toast could not be screenshotted**, because of decision 2: it holds focus while focused and
resumes its timer on blur, and every screenshot is a separate tool call arriving after the blur.
Freezing a clone and pinning by synthetic hover both failed. The hit-test above is what proves
reachability instead, and it proves more than a photograph would.

## Not verified

Real screen-reader announcement, and real Tab/Escape in Chrome by hand — the `aria-hidden` and
focus facts are measured, the assistive-technology behaviour is inferred from them. Desktop-width
appearance of the portalled toast. Nothing is deployed.

## Found and not fixed

**#102** — `AdminConsole.jsx` has a **second, separate inline `Snackbar`** with the identical
defect, and unlike the pre-#89 app shell it has a live trigger: `InviteDialog.submit` deliberately
leaves the dialog open on failure, so the admin's *error* message lands inside the dialog's
`aria-hidden` subtree. `MemberDetail` is a `Drawer` in the same console with the same exposure.
Message-only today. It should reuse `AppSnackbar` rather than portal a second copy — a divergent
second implementation is how these two drifted apart to begin with.

## An unexplained flake

On the first re-run of the suite after this work, **one test failed** that the implementing run had
green. It has not reproduced in 19 subsequent runs — 5 plain, 3 full `verify`, 10 focused on the
two touched files, and one with `node_modules/.vite` cleared. No explanation, and it is recorded
here rather than dismissed, so a future red CI on `snackbar-a11y.test.tsx` does not start from zero.
