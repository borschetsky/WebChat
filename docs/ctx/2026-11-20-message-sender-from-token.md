# hey/send: the sender comes from the token, and the caller must be in the thread

- **Date:** 2026-11-20
- **Type:** change (bug fix, security)
- **Scope:** `WebChat/WebChat/Controllers/HeyController.cs`, `WebChat/WebChat.Data/ViewModels/MessageViewModel.cs`, `WebChat/WebChat.Tests/Messages/SendMessageAuthorizationTests.cs`, `CLAUDE.md`
- **Status:** done on branch `hotfix/message-sender-from-token` (from `master`), commit `77af47e`. **Not pushed or merged; production does not have the fix.**

## Context
Found while diagnosing a separate client bug (Entra users' `senderId` was null, so `hey/send` answered 400). That fix lives on `hotfix/entra-sender-id` with note `2026-11-20-entra-sender-id.md`, neither of which is on this branch. Reading `SendMessage` for that bug showed the endpoint trusted the request body for the sender.

## What I found
- `HeyController.SendMessage` (`POST api/hey/send`) passed its `[FromBody] MessageViewModel` to `MessageService.AddMessage`, which maps `model.SenderId` into the stored `Message` row (`MappingService.MapMessageViewModelToMessageModel`). `User.Identity.Name` was read only afterwards, to overwrite `SenderId` on the response and the hub echo. The response therefore looked right while the stored row named whoever the body said.
- Nothing checked that the caller was a participant of `model.ThreadId`. Net effect: any signed-in user could post into any conversation whose id they knew, attributed permanently to anyone.
- `responseModel.Username` was also copied from the body, so the live `ReciveMessage` echo could show any name until a reload (stored rows join `User` for the name).
- Same class as #99 (`UpdateProfile` keyed on `model.Id`): an id in a request body must never decide which row is written.

## What changed
- `HeyController.cs:65-90`: `senderId = User.Identity.Name`; `participants = thredService.GetParticipantIds(model.ThreadId)`; a caller not in it gets `NotFound()`; `model.SenderId = senderId` before `AddMessage`; echoed `Username` from `userSercvice.GetUserNameById(senderId)`; the same participant list is reused for the hub broadcast (one query instead of two).
- `MessageViewModel.cs:13-17`: `SenderId` lost `[Required]` and is documented as output-only, so the server no longer depends on the client knowing its own id.
- `CLAUDE.md`: the #99 bullet notes the recurrence in `hey/send` and says to check membership as well as identity.
- New `SendMessageAuthorizationTests.cs`.

## Decisions and trade-offs
- **404, not 403,** for a non-member, so the answer does not confirm which thread ids exist. This is the rule `ChatHub.BroadcastTyping` already follows (`ChatHub.cs:42`).
- **`[Required]` dropped rather than kept.** Keeping it would leave a field the server ignores able to 400 a legitimate caller, which is exactly how Entra clients broke.
- **Tests assert on the stored row**, not the response: a response-level test would have passed against the bug, since the response was always corrected.

## Verified
- `SendMessageAuthorizationTests` (`IClassFixture<AdminApiFactory>`, real host) has three tests, each shown **red against the unfixed code first**: stored `SenderId` was bob's when alice posted claiming to be bob; a non-member (sending her own valid senderId, so nothing else was wrong) got Created instead of NotFound; a body without `senderId` got BadRequest instead of Created.
- After the fix: 3/3 pass, Release build with `-warnaserror` 0 warnings, full xUnit 422 passed / 2 skipped (figures as reported by the implementing session; I confirmed the three tests and the code locations exist, not the run itself).
- Audit of `[FromBody]` endpoints for body ids deciding writes: `AdminController` and `ConversationsController` take ids from the route; `UsersController.UpdateProfile` already ignores `model.Id` (#99); `HeyController` `CreateGroup` and `CreateThread` take the creator from the token.
- **Not verified:** behaviour in a browser; whether any client other than the SPA posts to `hey/send` (one that relied on a body sender would now be overridden, and a non-member would get 404).

## Known issues / follow-ups
- **Not fixed, pre-existing:** `CreateThread` copies the body's `OponentVM` (opponent name/avatar) into the live `ReviceThread` hub echo (`HeyController.cs:314`, `newThreadVM.OponentVM = model.OponentVM`), so a new conversation can be shown with a fabricated opponent name or avatar until reload. The stored thread is correct. Same fix shape: build it server-side as line 311 does for the other participant.
- The fix is unshipped: merging does not deploy, so it needs `doctl apps create-deployment` after merge (see CLAUDE.md).
