# Typing and presence stopped going to everyone, and started saying who

- **Date:** 2026-08-07
- **Type:** change
- **Scope:** `WebChat.Hub/ChatHub.cs`, `WebChat.Hub/Interfaces/IHubDirectory.cs` (new),
  `WebChat.Services/HubDirectory.cs` (new), `WebChat/Startup.cs`,
  `WebChat.Tests/Hubs/` (new), `ClientApp` realtime slice, middleware, `ConversationPane`,
  `ChatApp`, `types/dto.ts`. Issue #44.
- **Status:** done

## Context

Asked directly whether the group work had updated the hub. It had not: #37 fixed message
fan-out (`HeyController.cs:72-74` sends to `GetParticipantIds`) but left the hub itself on
the 1:1 assumptions.

## What I found

**Typing went to `Clients.All`, with no membership check of any kind.** Two separate
problems in one line. Everyone connected received every typing event for every conversation,
which leaks thread ids and who is active in them. And because `threadId` arrives straight
from the caller, **any authenticated user could push a typing indicator into a thread they
cannot open**, and it reached every connected client. That is an authorization hole, not a
noise problem.

**Group typing was dead client-side, and had always been.** `signalrMiddleware.ts` filtered
with `if (t && t.opponentId !== uid) return;`, and `adapters.ts:42` sets
`opponentId: opponent?.id`, which is `undefined` for a group. So `undefined !== <memberId>`
was always true and every group typing event was discarded. Nobody had ever seen an
indicator in a group.

**The indicator named the wrong thing.** `ConversationPane` built its label from
`thread.name.split(' ')[0]`, so a group called "Design Guild" announced that "Design is
typing…". The composer placeholder had the same bug — "Message Design".

**The reference direction is the constraint that shapes all of this.**
`WebChat.Services.csproj:25` references `WebChat.Hubs`, so the hub cannot call a service
without a project cycle. `IConnectionMapping` already solves this by living in the hub
project; `IHubDirectory` follows it.

**`Groups.RemoveFromGroupAsync` at the old `ChatHub.cs:51` had no matching
`AddToGroupAsync`** anywhere in the solution — verified by grep. It removed a connection
from a group it was never added to. SignalR's "groups" are not this app's group threads, and
leaving that call implied otherwise.

**`SendAsync` in the connect/disconnect overrides was never awaited**, so an unobserved task
swallowed its own exceptions: a failing send looked exactly like a working one.

## What changed

- `IHubDirectory` (`GetParticipantIds`, `GetUserNameById`, `GetPeerIds`) in the hub project;
  `HubDirectory` implements it over `IThreadService`/`IUserService`; registered in `Startup`.
- Typing addressed to participants minus the typist, refused for a non-participant, and
  carrying `Username`.
- Presence addressed to peers, still only on the first connection and the last disconnect.
- Orphan `Groups` call deleted; both overrides now `async`/awaited.
- `realtimeSlice` keeps `typing: Record<threadId, TypingUser[]>` in place of
  `typingIn: string | null` — a group can have two people typing at once, which the old
  shape could not represent. `typingLabel` builds the line.
- Middleware no longer filters (the server already did) and carries the name through.

## Decisions and trade-offs

- **The membership check answers identically for "thread does not exist" and "you are not in
  it"** — silence in both cases. Differing answers would make the hub an oracle for which
  thread ids are real.
- **Presence narrowed to peers, not kept global.** The directory's online flags come from
  `GET getusers`, so this only narrows *live* updates; someone you have never spoken to has
  no reason to learn you came online.
- **`GetPeerIds` is one query per thread**, which is fine because presence changes on connect
  and disconnect only, not per keystroke. Flagged in the code as the obvious thing to replace
  with a join if a user's thread count grows.
- **Hand-rolled test fakes rather than a mocking library**, matching the repo's existing
  preference for real objects. See below — this is also forced by how SignalR is shaped.

## Verified

- **`SendAsync` is an extension method on `IClientProxy`, not a member** — so it cannot be
  mocked or verified directly; `SendCoreAsync(string, object?[], CancellationToken)` is the
  only real member. Confirmed by the compiler here (implementing `IClientProxy` required
  only `SendCoreAsync`) and independently by the research note
  `docs/research/2026-08-07-signalr-hub-unit-testing.md`, which found that a mocking library
  compiles against `SendAsync` and then fails at runtime — the worst failure mode available.
- **Both halves of the fix were proved by breaking them.** Reverting the audience to
  `Clients.All` fails 3 tests with *"ChatHub must not broadcast to every connected client"*
  (the fake throws from `All` on purpose). Removing the membership check fails
  `A_non_participant_reaches_nobody`. Neither was assumed.
- `dotnet build WebChat.sln --no-incremental` **0 warnings**, **60 .NET tests**.
  Client: oxlint clean, `tsc --noEmit` clean, **68 tests**.
- **An earlier 0-warning claim on this branch was wrong** — it came from an incremental
  build that did not recompile the test project, which was hiding a CS8603 in `HubFakes`.
  Fixed, and re-checked with `--no-incremental`. Worth remembering: `dotnet build` alone is
  not a warning audit.
- **Not verified: anything actually reaching a browser.** These tests pin addressing only —
  they would all pass if SignalR never delivered a byte. The "live hub round trip unverified"
  risk that has followed this repo since the Redux refactor is untouched.

## Known issues / follow-ups

- **The typing payload is an anonymous type, and it is `internal` to `WebChat.Hubs`.** The
  tests read it by reflection, which works cross-assembly; `dynamic` does not. The research
  note suggests a `public sealed record TypingNotification(string UserId, string ThreadId,
  string? Username)` — two lines that would also make the wire contract greppable from the
  client side. Not done here.
- **Only active viewers should receive typing** — agreed as the next step (issue to follow):
  a hub `EnterThread`/`LeaveThread` pair, the audience narrowed to participants who have the
  thread open, and a `/t/:threadId` route so a refresh keeps you there.
- `Xunit.SkippableFact` is v2-only, so the two `[SkippableFact]`s block an xUnit v3 move.
  Separate concern; see the research note.
