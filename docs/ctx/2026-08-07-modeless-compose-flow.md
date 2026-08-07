# Modeless compose flow, and the group name that stopped being typed

- **Date:** 2026-08-07
- **Type:** change
- **Scope:** `ClientApp/src/features/threads/ComposeDialog.jsx`,
  `features/threads/groupName.ts` (new), `app/ChatApp.jsx`, `src/test/compose-group.test.tsx`
  and `src/test/group-name.test.ts` (new), `CLAUDE.md`, `ORIENTATION.md`. Issue #43.
- **Status:** done, except for browser verification (see Verified)

## Context

#37 shipped group conversations, but the compose dialog built for it was not the one the
design handoff draws. The handoff (`HANDOFF-ALL-IN-ONE.md`, its `ComposeDialog` at lines
1070-1148 and `startGroupWith` at 518-534) describes a **modeless** dialog; what shipped had
two modes behind a toggle. #43 recorded the delta and left two decisions open. The
instruction "implement the handoff pixel-perfect" settled both.

## What I found

**`App:PublicUrl`-style single-valued config was not the constraint here — the group name
was.** `CreateGroupViewModel.Name` is `[Required]` with `StringLength(60, MinimumLength = 1)`,
while the handoff draws no name field at all. The name has to come from somewhere, and
deriving it client-side is the only option that needs no server change.

**The minimum group size follows from the name, and the server argues the opposite case.**
`CreateGroupViewModel.cs:16-17` deliberately permits a single other member, and says why:

> One member is enough. A group of two is a legitimate thing to want and is not the same as
> a direct thread: **it has a name**, and more people can be added to it.

That rationale is conditional on there being a typed name. Once the name is derived from the
members, a two-person group is indistinguishable from a direct thread — which is why the
handoff requires two. **The server still accepts one; the client now refuses to send it.**
The API was left alone deliberately (see Decisions).

**MUI v9 drops `inputProps` silently.** The handoff labels its row checkbox with
`inputProps={{ 'aria-label': ... }}`. Ported verbatim, the rendered `<input type="checkbox">`
carried **no `aria-label` at all** — no warning, no error, no console message. It surfaced
only because the new test queried `getByLabelText`, which failed with *"Unable to find a
label with the text of: Select Maya Rodriguez"*. `slotProps={{ input: {...} }}` is the v9
spelling, and it is what `PresenceAvatar.tsx:44` and the dialog's own `slotProps.paper`
already use. This is the same family as the `Stack` prop-dropping bug that `theme.d.ts`'s
drift test guards, and it is now a CLAUDE.md bullet because the handoff is treated as
authoritative and will be ported from again.

**The handoff's dialog assumes a local fixture array.** It filters `DIRECTORY` in render, so
it has no loading state and no pre-search state. This one queries `/api/users/search`, so the
debounce, the spinner and the "Start typing a name." prompt had to survive the rewrite. Take
the handoff's layout; do not take its data assumptions.

## What changed

- **`ComposeDialog.jsx` rebuilt modeless.** One list. Each row has a checkbox (selects for a
  group) and a chat-bubble `IconButton` (opens a direct message, with `stopPropagation` so it
  does not also tick the row). Removed: the mode toggle, the `isGroup` state, the group-name
  `TextField`, and the `groupName` state. Added: first-name `Chip`s with a 24px avatar, and
  the footer's live count (`No one selected` / `1 selected · pick one more for a group` /
  `N selected`). Layout values are the handoff's — `py: 1` rows at `borderRadius: 2.5` with
  `background.selected`, 38px avatars, `py: 4.5` empty states, `gap: 1` actions.
- **`groupName.ts` is new**: `deriveGroupName` builds `Maya, Tomás +2` from the members. It
  clamps to 60 characters, because exceeding `StringLength(60)` returns a 400 that reaches
  the user only as "Could not create that group."
- **`ChatApp.jsx`**: `handleStartGroup(members)` — no longer `(name, members)` — derives the
  name and reports `Group created with N people`, the handoff's wording.
- **Docs**: two stale claims corrected that this change did not cause (see below), plus the
  new `inputProps` bullet.

## Decisions and trade-offs

- **Derive the name client-side; leave the API alone.** Rejected making `Name` optional and
  deriving server-side on read. Deriving on read is *better* — the name would follow
  membership — but it touches the view model and the mapping layer, and the handoff gives no
  reason to think the name is meant to be live. **Known cost: the name freezes at creation.**
  Add a seventh member and the "+2" is permanently wrong. This is recorded in
  `groupName.ts`'s doc comment so it is not mistaken for an oversight.
- **Client enforces two, server still accepts one.** Rejected tightening
  `[MinLength(1)]` to 2 to match. The server's rule is defensible on its own terms and other
  clients may not derive names; a UI minimum is a UI decision. The divergence is deliberate
  and documented at both ends.
- **`showPresence={false}` on directory rows**, per the handoff, even though the real API
  supplies presence and the old dialog displayed it. Pixel-perfect was the instruction, and
  the handoff omits the dot here on purpose — the directory is not a presence view.
- **Left the search effect alone.** It is the one from
  `2026-08-04-compose-search-render-loop.md`; the `search` ref indirection and both
  `oxlint-disable-next-line rh/set-state-in-effect` suppressions were carried across
  unchanged. Restructuring it into derived state is still the right eventual fix and still
  does not belong in a layout change.

## Verified

- `npm run verify` clean: oxlint under `--deny-warnings`, `prettier --check`, `tsc --noEmit`,
  and **71 tests across 9 files** (was 61 across 7). Ten new: five in `compose-group.test.tsx`
  covering the absence of a mode toggle and name field, the two-person gate and its helper
  text, the picked people reaching the caller, the row button starting a direct message
  without ticking the row, and chip add/remove; five in `group-name.test.ts` covering
  derivation, the `+N` suffix, the 60-character clamp and the blank-name fallback.
- The pre-existing render-loop regression suite still passes unchanged.
- **Against the running compose stack**: registered and confirmed a user, then created a
  group through `POST /api/hey/creategroup` with a derived-style name. Postgres shows
  `ga10186, gb14271 | IsGroup=t | 3 participants` — the two picked plus the creator added
  server-side. The name format and the member payload are therefore confirmed against the
  real endpoint, not just against tests.
- **Not verified: the dialog was never opened in a browser.** The Chrome extension timed out
  twice on `tabs_context_mcp` and I stopped rather than retry-looping. So the layout is
  confirmed by unit test and by reading the handoff, **not by looking at it** — which is
  precisely the gap #43's "done when" names, and how #32's unreachable link shipped. The
  visual check is outstanding.
- Registration returned `emailSent: true` rather than logging the link, because `WebChat/.env`
  carries real Brevo credentials; the account was confirmed with a direct `UPDATE` instead.
  Worth knowing — the "link is in the log" shortcut in CLAUDE.md only applies without SMTP.

## Known issues / follow-ups

- **Two stale doc claims corrected here, both pre-existing and neither caused by this
  change.** CLAUDE.md said *seven* features are mocked and ORIENTATION.md listed groups among
  them; `mocks.ts` has held **six** since #37 made groups real. ORIENTATION's test count was
  also a version behind. Both are the drift the checkpoint skill exists to catch.
- **`types/models.ts:47` still documents `group` as "MOCK: no group threads exist - Thread has
  a single OponentId".** Untrue since #37. Left alone as out of scope for a layout change;
  it is a one-line fix.
- **`mocks.ts:11` refers to `api-service.js` / `adapters.js`**, both now `.ts`. Pre-existing,
  and the same JS→TS extension drift the checkpoint skill lists as a standard trap.
- The handoff's thread list has a third **Groups** filter tab; `ThreadList.jsx` still has only
  `all` and `unread`. Noted in #43 as adjacent, still not done.
