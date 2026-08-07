# Group threads got their members' faces

- **Date:** 2026-08-07
- **Type:** change
- **Scope:** `ClientApp/src/components/AvatarStack.tsx` (new),
  `features/threads/ThreadListItem.tsx`, `src/test/avatar-stack.test.tsx` (new).
- **Status:** done

## Context

A group row in the thread list drew a single avatar built from the thread's name, so every
group looked like a person. The design handoff was updated twice during this work, and the
second revision changed the approach rather than the details — worth recording, because the
first version is now wrong and looks plausible.

## What I found

**The handoff moved from a hand-rolled scatter to MUI's `AvatarGroup`.** The first revision
positioned up to three tiles absolutely, alternating top and bottom (`left: i * step`,
`top: i % 2 === 0 ? 0 : size - cell`), with a `+N` tile appended. The second builds on
`AvatarGroup` with a tight negative overlap and adds a `variant`: `tight` for the thread list
and header (62% faces, −55% overlap) and `row` for roomier contexts (78%, −30%). Both were
implemented here; the scatter version and its tests were replaced wholesale.

**`slotProps.additionalAvatar` does not exist in MUI v9.** The handoff passes it alongside
`surplus`, and it is a **type error**, not a harmless extra — `tsc` rejects it. This is the
second time in one day that the handoff has been a MUI major behind on slot names; the first
was `Checkbox`'s `inputProps` in the compose dialog, which v9 drops *silently*, leaving a
control with no accessible name. The pattern to remember is that the handoff predates v9, and
which failure you get is luck: a type error if the slot was removed, silence if it was
renamed.

**`AvatarGroup` gives up a face slot once the total overflows `max`.** With `max={3}` and six
members it draws two faces and a `+4`, not three and a `+3`. The first `aria-label` said
"and 3 more" beside a tile reading "+4" — caught by a test, not by reading.

**`fallbackName` wins over a lone member's name**, which the handoff specifies and I had
assumed the other way round. Also caught by a test.

## What changed

- `AvatarStack` on `AvatarGroup`, overriding geometry only: cell and overlap derived from
  `size`, `2px` rings in the surface colour, `flex: 'none'`, so a group occupies the same box
  a single avatar does and the list keeps a straight left edge.
- Fewer than two members falls back to a plain `PresenceAvatar` — a group whose members have
  not loaded lands there too, and should not render as a stack of one.
- `ThreadListItem` picks the stack for `t.group` and keeps `PresenceAvatar` otherwise.

## Decisions and trade-offs

- **Colour from the member id via `avatarColor`, not the handoff's name length.** The
  handoff's fixtures key colour off `name.length` consistently, and this app hashes the id
  everywhere else. Following the handoff would give one person a different colour in the
  stack than on their own avatar, which reads as a bug.
- **Dropped the handoff's `filter((m) => m.name !== 'test')`.** That strips its fixture's own
  user; the server already sends everyone but the caller.
- **`role="img"` with a member-naming label**, or the row announces a pile of loose initials.
  That trips `jsx-a11y/prefer-tag-over-role`, which wants an `<img>` where there is no image
  to point one at — disabled **for the file** with the reason, deliberately not for the line,
  because Prettier has already detached a line-addressed suppression once in this repo.

## Verified

- `npm run lint` clean under `--deny-warnings`, `tsc --noEmit` clean, **69 tests** across 8
  files, 8 of them new and covering the geometry at both densities, both variants, the
  surplus, and both fallbacks.
- The geometry assertions are on computed pixel values (`cell = round(size * 0.62)`,
  `overlap = -round(cell * 0.55)`) rather than on class names, so a change to the design maths
  fails rather than passing quietly.
- **Not verified in a browser.** No group with real member avatars was rendered on screen —
  and see below for why that would not have shown much yet.

## Known issues / follow-ups

- **Every face is initials today, whatever the members have uploaded — issue #47.**
  `GET getthreads` returns `avatarFileName` for every member, and `toThread`'s member mapping
  discards it, so `AvatarStack` has no filename to pass. The component is ready for it; the
  data is thrown away one layer earlier. Found while auditing the bug class behind #45, not
  by looking at the stack.
- The `row` variant is implemented and untested in situ — nothing uses it yet. It exists
  because the handoff defines it, not because a caller asked.
