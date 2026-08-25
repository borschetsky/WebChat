# Who gets written, and what everyone gets told

- **Date:** 2026-08-21
- **Type:** fix
- **Scope:** `Controllers/UsersController.cs`, `WebChat.Services/{UserService,IUserService}.cs`,
  `Helpers/MappingService.cs`, `Inerfaces/IMappingService.cs`,
  `WebChat.Data/ViewModels/ProfileBroadcastViewModel.cs`, `ClientApp/src/types/dto.ts`,
  `ClientApp/src/features/realtime/signalrMiddleware.ts`,
  `WebChat.Tests/Users/ProfileBroadcastTests.cs`
- **Status:** done

## Context

Issues **#94** and **#99**, branch `bugfix/94-profile-broadcast-payload`. Two defects in the same
six-line method, found one after the other, and they are genuinely different:

- **#94 — what the broadcast carries.** Over-disclosure.
- **#99 — which row gets written.** Account takeover.

Fixing either alone leaves the other live, which is why they shipped together despite the
one-topic-per-branch rule. #94 was the assignment; #99 was found while implementing it.

## #99 — the serious one

```csharp
var currentUserId = this.User.Identity.Name;                     // assigned...
var curentProfile = this.userService.GetUserProfile(model.Id);   // ...never read
var broadcast = this.userService.UpdateProfile(model);           // keyed on model.Id
```

Any authenticated user could rewrite **any other account's username and email** by posting that
account's id. **Reproduced live before writing a line of fix**, two ordinary accounts with no
relationship:

```
POST /api/users/update   (attacker94's token)
{"id":"831115c5-…","username":"victim94","email":"pwned-by-attacker@evil.example"}
→ HTTP 200

before   victim94 | victim94@example.com
after    victim94 | pwned-by-attacker@evil.example
```

**Takeover rather than vandalism**, because password reset sends to the *stored* address —
`AuthController` does `emailSender.SendAsync(user.Email, …)` after `GetUserByEmail`. Rewrite the
address, request a reset, receive the link. The victim loses their own reset at the same moment,
since their address no longer matches a row.

The fix is small: take the id from the token, ignore `model.Id`. `GetProfile`, immediately above
in the same controller, always did this correctly — only this method disagreed. Once the id comes
from the token, an unknown id means a stale session, so `UpdateProfile` returns null and the
controller answers **401**, matching `GetProfile`, instead of throwing on a null entity for a 500.

## #94 — the disclosure

`Clients.All.SendAsync("ReviceUpdatedOpponentProfile", model)` broadcast the **client-supplied**
`ProfileViewModel`, carrying `Email` and `Role`, to every connected client — including people
sharing no conversation. Two problems in one line: over-disclosure, and *echoing the request body*
so fields the server never persists were relayed exactly as the caller wrote them.

Now a purpose-built `ProfileBroadcastViewModel` — id, username, avatar filename — projected from
the **persisted entity after `SaveChanges`**. The avatar goes through `AvatarVisibility`, so a
photo removed under #89's retention marker is not resurrected by saving a profile; there is a test
for exactly that, because the marker leaves `AvatarFileName` populated and a raw read would have
undone it.

The misspelt hub method name stays: the client's handler is registered under it.

## Verified

- Red first, on both defects. #94: three reproductions and one honest guard — the fourth test
  passes against the bug, because the echoed body happened to hold the username about to be
  written, and it is labelled a guard in the file rather than counted as a reproduction. #99:
  both new tests failed before the fix.
- `dotnet build --no-incremental -warnaserror` — 0 warnings. `dotnet test WebChat.Tests` —
  **324 passed, 2 skipped, 326 total** (was 318/2/320).
- `npm run verify` — 284 tests across 21 files, unchanged; no client tests were needed because the
  handler only ever read `id` and `username`, and this payload does **not** pass through
  `adapters.ts` (the middleware dispatches `threadPatched` directly), so the #82 seam is not
  involved.
- **Live socket check** for #94: the frame carries `{id, username, avatarFileName}` with no email
  and no role, and a caller-chosen avatar key does not reach the wire. With `AvatarRemovedAt` set
  while `AvatarFileName` remained populated, the frame carries `avatarFileName: null`.
- **The live attack re-run against the fixed build**: the victim's row is untouched.

## What re-running the attack revealed

The same request that no longer touches the victim **renamed the attacker's own row into the
victim's username**, leaving two rows called `victim94`. `isUsernameUniq` and `isEmailUniq` are
called only in register — `UpdateProfile` calls neither, and there is no unique index. Filed as
**#100**; not fixed here, because #99 is about *which row* is written and this is about *what may
be written into it*.

That is worth generalising: **fixing an authorization hole can expose an integrity hole behind
it.** The uniqueness gap was always there; it only became visible once the write was correctly
scoped to the caller.

## Not verified

The SPA was not opened for this — no check that a second user's thread list re-titles from the new
payload. The handler code path is unchanged, but that is reasoning, not evidence. Nothing is
deployed; **production still has both defects** until this ships.

## Found and not fixed

- **#100** — profile update enforces neither username nor email uniqueness.
- **`ReciveAvatar` goes to `Clients.All`** (`AvatarsController` ×3). The payload is purpose-built,
  so not the #94 defect, but the *audience* is wrong: every connected client learns a user id and
  an avatar key with no shared conversation. The client already filters on `opponentId`, so
  narrowing server-side looks cheap.
- **`HeyController:71`** sets a broadcast message's display name from the request body rather than
  the sender's row — the same echo-the-request family as #94's second half, without PII.
- **`OponentViewModel` has an unused `Email` property** that rides `ReviceThread` and every group
  member list. A loaded gun: one future `Email = u.Email` in a projection re-creates #94 on a
  wider wire.
