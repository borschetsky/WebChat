# Group stacks got real faces: the adapter had been discarding member avatars

- **Date:** 2026-08-08
- **Type:** change
- **Scope:** `ClientApp/src/services/adapters.ts`, `types/models.ts`,
  `components/AvatarStack.tsx`, `services/adapters.test.ts`, `test/avatar-stack.test.tsx`.
  Issue #47.
- **Status:** done

## Context

`AvatarStack` shipped the day before and drew a group's members — but every face was
initials, whatever those people had uploaded. Found by auditing the bug class behind #45
rather than by anyone looking at the screen.

## What I found

**The server has always sent it.** `GET /api/hey/getthreads` returns `avatarFileName` on
every member, confirmed against the running stack:

```json
"members":[{"id":"d51682a2-…","username":"img4417","email":null,
            "avatarFileName":null,"isOnline":false,"isTyping":false}]
```

`toThread` mapped members to `{id, name, role, presence}` and dropped it; `ThreadMember`
never declared it. So the component had nothing to pass — **the data was thrown away one
layer before the thing that needed it**, which is precisely the shape of #45 one level over.

**`PresenceAvatar` was already the right component to reuse, and the reuse is not obvious.**
It resolves a filename to a URL and falls back to initials both when there is no file and
when the file 404s — an avatar row can outlive its object in R2. The non-obvious part is that
`AvatarGroup` counts and clones its children to produce the `+N` surplus, and the geometry
overrides target `.MuiAvatar-root`; with `showPresence={false}` `PresenceAvatar` returns a
bare `Avatar`, so it remains a direct child and both still apply. Had it wrapped the avatar
in a `Badge`, the surplus maths and the sizing would both have silently stopped working.

## What changed

- `ThreadMember.avatarFileName: string | null`.
- `toThread` carries it through with `?? null` — null, not undefined, because that is what
  the type promises and what the initials fallback keys off.
- `AvatarStack` renders `PresenceAvatar` per member instead of a bare `Avatar`, passing the
  filename and sizing it at `cell`.

## Verified

- **Both halves proved by breaking them**, separately, because they fail for different
  reasons:
  - Removing the `avatarFileName` line from `toThread` → the 2 new adapter tests fail. These
    reproduce the defect.
  - Reverting `AvatarStack` to its previous version → the 2 new component tests that expect
    an `<img>` fail. These pin the component half.
  - The third new component test (initials for a member with no avatar) passes either way and
    is a **guard**, not a reproduction.
- The 8 pre-existing `avatar-stack` tests — geometry at both densities, both variants, the
  surplus — **pass unmodified**. That matters: it is the evidence that swapping the child
  component did not quietly break the `AvatarGroup` cloning or the `.MuiAvatar-root`
  overrides.
- `npm run verify`: oxlint clean under `--deny-warnings`, Prettier clean, `tsc --noEmit`
  clean, **94 tests across 11 files** (was 89).
- Client-only — the .NET side is untouched, confirmed by the diff.
- **Not verified in a browser.** The Chrome extension reports "not connected", so this could
  not be looked at. Stated plainly because this repo has repeatedly shipped UI confirmed only
  by unit test, and because a stack of *real* images is exactly the case a jsdom test
  approximates rather than proves — layout, ring contrast against a photo, and the 404
  fallback are all things only a browser shows.

## Known issues / follow-ups

- **Every avatar in the stack is a separate request, and none of them cache** — issue #46.
  A group of three now fetches three images per render, and `GET /images/{fileName}` 302s to
  a freshly signed URL with `Cache-Control: no-store`, so nothing is reusable. This change
  makes that cost visible where it was previously hidden by never loading an image at all.
- `ThreadMember.role` is still `''` for everyone; nothing on the server has a concept of one.
