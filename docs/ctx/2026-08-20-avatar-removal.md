# Removing an avatar, and why Undo forced a soft delete

- **Date:** 2026-08-20
- **Type:** change
- **Scope:** `WebChat.Data/{User.cs,AvatarVisibility.cs}`, migration
  `20260820191845_AddAvatarRemovedAt`, `WebChat.Services/{IUserService,UserService}`,
  `MappingService`, `ThreadService`, `MessageService`, `MemberAdminService`,
  `Controllers/{AvatarsController,ConversationsController}.cs`,
  `ClientApp/src/features/settings/{SettingsDrawer.jsx,AvatarCropDialog.tsx}`,
  `features/ui/uiSlice.ts`, `app/ChatApp.jsx`, `services/{api-service,index}.js`,
  `WebChat.Tests/Avatars/*`, `src/test/avatar-remove.test.tsx`
- **Status:** done

## Context

Issue #89, branch `feature/89-remove-avatar`. Completes the avatar arc: [#84](2026-08-18-avatar-crop.md)
cropped, [#92](2026-08-19-mobile-crop-dialog.md) fixed it on a phone,
[#88](2026-08-20-avatar-recrop.md) stored the original and added Adjust crop, and this adds the
third item the handoff always drew.

#84 and #88 both shipped with Remove deliberately absent, pinned by tests, because no endpoint
could clear an avatar. Those tests are now **rewritten to assert its presence** rather than
deleted — the pin did its job.

## Why this could not be a delete

The handoff: *"**Remove photo** — red, last, separated. No confirm dialog; instead snackbar with
working **Undo** that restores the photo AND its crop parameters."*

Undo restoring the crop is what decides the design, and one fact closes it: **the server cannot
re-derive a crop.** Cropping has been client-side since #84. So any design that destroys the
derived object on the button press makes Undo either impossible or a forced re-upload — the
exact failure Adjust crop exists to prevent.

Hence a **soft delete**: one nullable `AvatarRemovedAt`. While set, every read path reports no
avatar; `AvatarFileName`, `AvatarOriginalFileName` and the four crop columns are retained
untouched. Undo clears the marker, which restores the photo and its framing *exactly* rather
than approximately. Soft delete is already idiomatic here — `BaseEntity` carries
`isDeleted`/`DeletedOn`.

**Undo never accepts a filename from the client.** `restore` takes no parameters at all. A
client-supplied key would let anyone point their avatar at any object in the bucket, including
another user's original — the thing #88 built the `originals/` prefix to prevent. Verified
adversarially: posting `{"avatarFileName":"originals/…"}` to `restore` returns the caller's own
key and ignores the body.

**The orphan bound is unchanged and deliberate.** #88's rule already deletes the old crop and
old original on the next upload, and `SetAvatar` clears the marker — so a pending removal is
disposed of by the next photo. The residue is "removed and never uploaded again", which #20's
recommended one-off sweep covers. No sweep built here.

## Decisions worth knowing

1. **The drawer closes on removal**, and this is not cosmetic. The app's single `Snackbar`
   renders inline, not through a portal, and the drawer is a MUI modal that marks the rest of
   the document `aria-hidden`. With the drawer open, "UNDO" is mouse-clickable but invisible to
   a screen reader and unreachable by keyboard. Confirmed in a browser on the pre-existing case:
   "Profile updated" raised from the open drawer sits inside `aria-hidden="true"`. Filed as
   **#96**; closing the drawer is the smallest correct fix here, and a one-line revert once #96
   lands.
2. **The menu now appears whenever there is a photo**, reversing #88's decision 5 (menu only
   when Adjust is available). Keeping that gate would have made Remove unreachable for exactly
   the pre-#88 accounts — an admin-console-unreachable repeat (#82).
3. **Remove in the crop dialog is driven by an `onRemove` prop, not by whether a source exists**
   — someone cropping their first photo has nothing to remove.
4. **Re-crop and `GET avatars/original` are refused while a removal is pending.** Otherwise
   Adjust would be a second, undocumented un-remove with a *different* crop.
5. **Double-press tolerance.** `restore` answers 200 when nothing was removed but a photo
   exists, and 409 only when there is nothing at all to restore — so pressing Undo twice is not
   a failure.
6. **No adapter change.** The server already sends `avatarFileName: null` and `PresenceAvatar`
   falls back to initials, so `adapters.ts`/`dto.ts`/`models.ts` are untouched — deliberately,
   and worth stating because that seam is the one CLAUDE.md warns about.

## The four questions #89 asked

1. **Read path copes with no avatar** — `PresenceAvatar.tsx:35` falls through to `initials(name)`.
   Confirmed, and in a browser the page rendered **zero `<img>` elements** after removal.
2. **Idempotent** — removing twice is 200 and does not move the timestamp; removing when there
   was never a photo is 200 with `restorable: false`. Both re-checked over the real API.
3. **The presigned-URL cache is a non-issue here, and that is a finding, not an assumption.**
   `CachingAvatarUrlProvider` keys purely on file name and a removal writes no new key — so
   unlike #88 there is nothing to go stale: the profile says `null`, so nothing requests the key
   at all. The honest trade is asserted rather than hidden: the retained object *stays signable
   by anyone already holding its Guid*, which is exactly why Undo is instant and often
   cache-warm.
4. **Undo after the window** — the button lives only in the snackbar; once gone there is no UI
   path back and the marker persists. A late call gets 200 or a worded 409, never a 500.

## Verified

Re-run independently of the implementing agent:

- `dotnet build WebChat.sln --no-incremental -warnaserror` — **0 warnings**;
  `dotnet test WebChat.Tests` — **318 passed, 2 skipped, 320 total** (was 292/2/294).
- `npm run verify` — **284 tests across 21 files** (was 271/20). `AvatarCropDialog` 16.35 kB gzip.
- **Migration applied to real PostgreSQL** — the agent could not check this;
  `AvatarRemovedAt` is `timestamp with time zone`, nullable, as the UTC rule requires.
- **In a browser at 390 px**: three-item menu with Remove red, third, after a divider; removal
  closes the drawer, drops the avatar to initials, and raises "Profile photo removed / UNDO"
  with the Undo **not** inside an `aria-hidden` subtree; Undo restores the photo and the crop to
  the digit; the crop dialog footer carries Remove / Cancel / Save photo; no console errors.
- **Over the real API**: profile reports `avatarFileName: null`, `hasOriginalPhoto: false`,
  `avatarCrop: null` while removed; `GET original` 404s while removed; restore returns the
  caller's own key and **ignores an injected one**.
- **#88's round-trip fixed point survives** — adjust-and-save untouched still leaves
  `{25.390625, 6.25, 49.21875, 87.5}` unchanged. #92's `fullScreen` / square stage / fitting
  circle also intact.

`vite build` earned its keep again: `@mui/icons-material/DeleteOutline` **does not exist** (the
exports are `Delete`, `DeleteOutlined`, `DeleteOutlineOutlined`) — the same class of bug as
`MailOutline`, caught only because `build` is in `verify`.

## Not verified

Removal seen from a *second* user's session — the read-path gating is covered by ten server
tests (nine of which fail when the gates are reverted) but no second browser was signed in. A
real phone or touch device. Firefox and Safari. Keyboard/AT operation of Undo by an actual
screen reader; the `aria-hidden` reasoning is measured, the assistive-technology behaviour is
inferred from it.

## Found and not fixed

- **#96** — snackbars raised while the settings drawer is open are `aria-hidden`. Pre-existing,
  reproduced in a browser, and the reason decision 1 exists.
- **#94** — `UsersController.UpdateProfile` broadcasts the client-supplied `ProfileViewModel`,
  including `Email`, to `Clients.All`. Still open, untouched.
- An admin clearing *another* member's photo is out of scope; the console now merely respects a
  member's own removal.
