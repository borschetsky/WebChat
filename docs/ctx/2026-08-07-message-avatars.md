# Message rows never showed an avatar

- **Date:** 2026-08-07
- **Type:** change
- **Scope:** `WebChat.Data/ViewModels/MessageViewModel.cs`, `WebChat.Services/ThreadService.cs`,
  `WebChat.Services/MessageService.cs`, `WebChat.Tests/Messages/MessageAvatarTests.cs` (new),
  `ClientApp/src/types/dto.ts`, `services/adapters.ts`, `services/adapters.test.ts`. Issue #45.
- **Status:** done

## Context

Reported from a screenshot: in the conversation pane every message showed the sender's
initials, while the *same* user's avatar rendered correctly in the thread list and in the
profile header. So the file existed and was reachable — something specific to messages.

## What I found

**Reproduced at the API before touching anything.** `POST /api/hey/send` answered with
exactly:

```json
{"id":"e6698511-…","senderId":"659b295f-…","text":"avatar probe",
 "threadId":"9fdeb3cd-…","username":"pxcheck",
 "time":"2026-08-07T17:21:27.6462519Z","date":"2026-08-07T00:00:00Z"}
```

No avatar field, and `GET getmessages` the same. `MessageViewModel` had `Id`, `SenderId`,
`Text`, `ThreadId`, `Username`, `Time`, `Date` and nothing else.

**My first diagnosis was wrong on one link, and the test is what caught it.** I recorded on
the issue that `adapters.ts` already read `vm.avatarFileName` and therefore only the server
needed changing. Those reads — `adapters.ts:124` and `:138` — are in **`toDirectoryEntry`**
and **`toProfile`**. `toMessage` never touched the field at all, so `Message.avatarFileName`
was `undefined` rather than `null`. Having populated the server field, the new client tests
failed with `expected undefined to be 'alex-avatar.png'`, which is the only reason the
missing client half was noticed rather than shipped half-fixed. Issue #45 carries a
correction comment.

The corrected chain: no property on `MessageViewModel` → nothing on the wire → `MessageDto`
declared nothing → `toMessage` mapped nothing → `MessageRow.tsx:78` passed `undefined` to
`PresenceAvatar` → initials. The thread list was unaffected because `toThread` reads the
opponent's avatar from `ThreadDto`, which does carry one.

**`GetThreadMessages` already joins `ctx.User`** for the username, so the read path cost one
extra column rather than one extra query. The send path needed a lookup by primary key —
that response is what both the sender's optimistic row and the hub echo are built from, and
without it the avatar would have appeared only after a reload, reading as though it arrived
at random.

## What changed

- `MessageViewModel.AvatarFileName`, null when the sender has no avatar — a placeholder name
  would make the client request a missing image on every render.
- `ThreadService.GetThreadMessages` selects `u.AvatarFileName` from the existing join.
- `MessageService.AddMessage` fills it after mapping, one lookup by primary key.
- `MessageDto.avatarFileName`, and `toMessage` maps it with `?? null`. `toLiveMessage`
  spreads `toMessage`, so the hub echo came free.

## Decisions and trade-offs

- **Server sends it per message**, rather than the client resolving the sender's avatar from
  the thread's member list. The member route needs a lookup keyed by sender across threads,
  and would go stale against a thread cache that has not refetched. The cost is the filename
  repeating on every message in a payload, which is small and compresses well.
- **Null rather than a default filename** for a user with no avatar, so the fallback stays a
  client decision and no request is made for a file that does not exist.

## Verified

- **The test failed first, on assertions rather than on compilation.** With
  `AvatarFileName` added but unpopulated: `Expected: "alex-avatar.png" Actual: null`, and the
  three-sender collection comparison `["alex-avatar.png", …]` vs `[null, null, null]`.
  **The third test — a sender with no avatar — passes against the bug too**; it is a guard
  against a placeholder being invented later, not a reproduction. Recorded here because a
  reader counting three tests would otherwise assume three reproductions.
- Client: the three new adapter tests failed with `expected undefined to be …` before the
  `toMessage` change.
- `dotnet build WebChat.sln` **0 warnings** (one CS8625 of my own making, from a non-nullable
  test helper parameter, fixed rather than suppressed), **52 .NET tests** pass. Client:
  oxlint clean, `tsc --noEmit` clean, **64 tests** pass.
- **Not verified in a browser.** The fix is confirmed at the API and adapter level only; the
  rendered row was not re-checked against the running stack.

## Known issues / follow-ups

- **Same bug class, one level over — issue #47.** `getthreads` returns `avatarFileName` on
  every member and `toThread`'s member mapping discards it, so `AvatarStack`'s group faces
  can only ever be initials. Found by auditing for the shape rather than by report.
- **Avatars are re-downloaded on every render — issue #46.** `GET /images/{fileName}` 302s to
  a freshly signed URL with `Cache-Control: no-store` on the redirect, so neither the
  redirect nor the image is cacheable and each render fetches the file again. Pre-existing
  and deliberate at the time; the cost was never measured.
