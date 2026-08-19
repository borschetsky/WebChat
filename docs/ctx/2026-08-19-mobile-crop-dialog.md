# The crop dialog on a phone

- **Date:** 2026-08-19
- **Type:** fix
- **Scope:** `ClientApp/src/features/settings/AvatarCropDialog.tsx`,
  `src/test/avatar-crop.test.tsx`, `src/test/avatar-crop-flow.test.tsx`
- **Status:** done

## Context

Issue #92, branch `bugfix/92-mobile-crop-dialog`, commit `420410d`, PR #93. Follows
[the avatar crop](2026-08-18-avatar-crop.md) (#84), and fixes the one gap that note declared
unverified.

Reported by the owner from a real iPhone, hours after #84 reached production in deployment
`58ad99d6`: the cropper opens, but the circle's left and right edges are sliced flat and the
dialog floats as a small card instead of using the screen.

Before #84, picking a photo on a phone uploaded it. So this was a **regression on small
screens specifically**, shipped by a change whose own note listed "narrow viewport" first
under *Not verified*.

## What was wrong

Four links, each measured rather than reasoned about:

1. `AvatarCropDialog` never consulted the mobile breakpoint. It was the **only** `Dialog` in
   the app without one — `ComposeDialog` and `InviteDialog` both take `fullScreen={isMobile}`.
2. So the paper stayed a centred `width: 384, m: 3` card — 342.4 px inside a 390 px viewport.
3. The stage was `width: 320, maxWidth: '100%'` against an **unconditional** `height: 320`.
   The width collapsed; the height did not. The stage stopped being square at every viewport
   at or below 430.
4. `cropSize` was the **constant** `{ width: 280, height: 280 }`, so the circle never learned
   the stage had shrunk, and `overflow: hidden` sliced it.

| viewport | stage | circle | clipped per side |
|---|---|---|---|
| 430 | 318.4×320 | 280 | fits |
| 414 | 302.4×320 | 280 | fits |
| 390 (iPhone 14) | 278.4×320 | 280 | **0.8 px** |
| 375 (iPhone SE) | 263.2×320 | 280 | **8.4 px** |
| 360 (most Android) | 248×320 | 280 | **16 px** |
| 320 | 208×320 | 280 | **36 px** |

## What changed

Fixed at three points, because each is independently sufficient to bring it back and the
failure came from a contract between them:

- **`fullScreen` below `breakpoints.down('md')`.** This is the handoff's own rule, not an
  invention: *"Mobile: single-pane switch at `theme.breakpoints.down('md')`, back arrow in the
  chat header, **full-width Drawer/Dialog**."* Every paper style had to become conditional,
  not just the width — **`sx` beats the class MUI's `fullScreen` applies**, so leaving the
  margin and radius would have produced a "full screen" dialog still inset by 24 px with
  rounded corners over the status bar.
- **The stage is square by `aspect-ratio: 1 / 1`**, never by a fixed height.
- **`cropSize` is derived from the measured stage** by `cropSizeFor`, split out pure for the
  same reason `sourceRectFor` was. It keeps the handoff's 40 px surround while there is room
  and gives it up before letting the circle overflow, because a tight circle still shows the
  whole crop and a clipped one lies about where its edge is.

`fullScreen` alone fixes it down to about 344 px and no further, so the derived `cropSize` is
not belt-and-braces — at 320 px the stage is 256 and a pinned 280 would still overhang.

## The part that would have shipped looking applied and doing nothing

**A `useRef` object pointed inside a `Dialog` is `null` when the owning component's layout
effect runs.** The stage lives inside the portal `Modal` creates, and its children are not in
the DOM on the commit that mounts the component around them.

This was found by isolating it, not by reading docs:

```
// effect in the component that renders <Dialog>, ref on a Box inside it
render(<Outer />)   // => "effect, ref=NULL"
```

The failure mode is the dangerous one: the measuring code sees `null`, skips, `stageSide`
stays `0`, and `cropSizeFor` returns its 280 fallback **forever**. Every symptom of the
original bug survives, while the diff looks like a complete fix. A **callback ref** fixes it,
because it fires when the node actually attaches.

It was caught only because the test asserted the *measured value* rather than that the code
ran — the first three attempts to explain it (spy not installed, `Box` not forwarding refs,
React not re-rendering) were all wrong, and each was eliminated by a probe rather than by
argument. Now trap 10 in `ORIENTATION.md`.

## How this was verified, and why that needed a new technique

**`resize_window` cannot narrow the viewport.** It reports success, moves the OS window, and
leaves the tab reporting its old `innerWidth` — 2048 px throughout. That is why #84's browser
pass ran at desktop width and why this bug reached production.

The technique that does work, now a CLAUDE.md bullet: load the app into a **same-origin
iframe** sized to the device. An iframe has its own viewport and evaluates media queries
against it, so `useIsMobile()` and every `sx` breakpoint behave for real. Inject it into the
live page — `document.write` gives the outer document an **opaque origin** and locks you out
of `contentDocument`.

Verified with it, at 320/360/375/390/414/430: stage square, circle fits, `paperFullScreen`
present. At 1000 px the desktop frame is untouched — 384 paper, 320 stage, 280 circle, not
full screen.

Tests were written first and run against the unfixed code:

```
expected 280 to be less than or equal to 263    cropSize vs a 375px stage
expected 'auto' to be '1/1'                     stage squareness
expected '320px' to be 'auto'                   the fixed height
expected null not to be null                    paperFullScreen
```

`npm run verify` green — 233 tests across 19 files, was 223. Chunk 49.98 kB / 15.76 kB gzip,
up 0.26 kB.

**jsdom lays nothing out, so not one of those tests can see a clipped circle.** They pin the
links that are expressible without layout — the arithmetic, the breakpoint wiring, and the
fact that squareness no longer depends on the width being free to reach 320. The clipping
itself is proved only in a browser, before and after.

## Audit

All three `Dialog`s now take `fullScreen`. The only other `maxWidth: '100%'` is `AuthScreen`'s
Paper, which has no fixed height and so cannot exhibit this. Repeatable with
`grep -rn "<Dialog" src -A6` and `grep -rn -B2 -A2 "maxWidth: '100%'" src`.

## Not verified

A real phone — the owner reported it on one and has not yet re-checked. Pinch on a touch
device, Firefox and Safari. Whether the 44 px minimum hit target the handoff states for mobile
should apply to this dialog's 38 px buttons: deliberately left out to keep one defect per
branch, and worth a follow-up.

**Deployed?** Not at the time of writing. Production is on `58ad99d6`, which contains the bug;
merging does not deploy (see CLAUDE.md), so this needs
`doctl apps create-deployment 7337e1b0-3696-44f8-9462-df84a75c5bab`.
