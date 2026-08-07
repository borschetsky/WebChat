# How should this repo unit-test its SignalR `ChatHub` on .NET 10 with xUnit?

- **Date:** 2026-08-07
- **Status:** answered
- **Question:** what a hub test asserts against, which libraries (if any) to add, and whether `WebChat.Tests` is the right home for it
- **Recommendation:** assert on `IClientProxy.SendCoreAsync` — never on `SendAsync` — using **NSubstitute 6.0.0** + **NSubstitute.Analyzers.CSharp 1.0.17** added to the *existing* `WebChat.Tests`, with a 20-line hand-written `HubCallerContext`, plain xUnit `Assert`, and xUnit v2 kept as-is.

## The short answer

Your instinct is right and it is the whole ball game: `SendAsync` is a **static extension method** on `IClientProxy`, so no mocking library can see it. The only member a test double ever observes is
`Task SendCoreAsync(string method, object?[] args, CancellationToken cancellationToken = default)` —
the one and only member `IClientProxy` declares. Write the assertion against that and everything works; write it against `SendAsync` and you get a test that compiles, throws a confusing runtime exception, and (with the NSubstitute analyzer installed) also emits `NS1004`/`NS5000`, which under this repo's 0-warning standard is a build break. All of that is demonstrated below against real, compiled, executed code.

`Clients.Users(...)`, by contrast, *is* a real interface member (`IHubClients<T>.Users(IReadOnlyList<string>)`), so the audience is directly verifiable. `Hub.Clients` and `Hub.Context` both have public setters, so no factory or DI is needed — an object initialiser is enough.

Add nothing else. No assertion library (plain `Assert` is fine and FluentAssertions is now proprietary), no second test project, no xUnit v3 as part of this change, and specifically **not** `SignalR.UnitTestingSupport.xUnit` — it exists, it targets net10.0, and it drags in Moq 4.18.4, EF Core InMemory *and* EF Core Sqlite, and pins you to xUnit v2.

One caveat that matters more than the library choice: the hub sends an **anonymous type**, which is `internal` to `WebChat.Hubs`. A test in another assembly can read it by reflection but cannot name it, cast to it, or use `dynamic` on it. See "The second deciding fact".

## What decides it

### The first deciding fact: `SendAsync` does not exist on the interface

`IClientProxy` ([source](https://raw.githubusercontent.com/dotnet/aspnetcore/main/src/SignalR/server/Core/src/IClientProxy.cs), fetched 2026-08-07) declares exactly one member:

```csharp
Task SendCoreAsync(string method, object?[] args, CancellationToken cancellationToken = default);
```

All ten `SendAsync` overloads live in `public static class ClientProxyExtensions` ([source](https://raw.githubusercontent.com/dotnet/aspnetcore/main/src/SignalR/server/Core/src/ClientProxyExtensions.cs)) and each one just packs its positional arguments into an array and forwards. So `Clients.Users(peers).SendAsync("ReciveTypingStatus", payload)` reaches the substitute as
`SendCoreAsync("ReciveTypingStatus", new object?[] { payload }, CancellationToken.None)`.

**Verified empirically**, not just read. I built a net10.0 xUnit project against a copy of the rewritten `ChatHub` and ran three probes:

| What the test writes | Result |
|---|---|
| `proxy.Received(1).SendAsync("Hello", Arg.Any<object>())` | Compiles. `warning NS1004` + `NS5000`. At runtime throws `RedundantArgumentMatcherException` — *"Remaining (non-bound) argument specifications: any Object"* — with a stack trace pointing at `ObjectProxy.SendCoreAsync`. |
| `proxy.Received(1).SendAsync("Hello", payload)` — **the same object instance** that was sent | Compiles. `warning NS5000`. **Fails at runtime**: `Expected to receive exactly 1 call matching: SendCoreAsync("Hello", Object[], CancellationToken) … Received 1 non-matching call … SendCoreAsync("Hello", *Object[]*, CancellationToken)`. The extension allocates a *fresh* `object?[]` on each call, so array-identity comparison never matches. |
| `proxy.Received(1).SendCoreAsync("ReciveTypingStatus", Arg.Is<object?[]>(a => a.Length == 1), Arg.Any<CancellationToken>())` | **Passes.** No analyzer diagnostics. |

The second row is the trap worth naming: it looks like the obviously-correct test, it fails, and the failure message says `SendCoreAsync` — a method you never typed — with the mismatch on an opaque `*Object[]*`. Anyone who hits that cold will spend half an hour on it.

`NS1004`/`NS5000` are **warnings by default** (I confirmed by toggling `TreatWarningsAsErrors`). Under this repo's 0-warning standard they become errors, which is the desired outcome: the analyzer turns "test that silently lies" into "build that fails".

### The second deciding fact: the payload is an anonymous type, and that is `internal`

`BroadcastTyping` sends `new { UserId = …, ThreadId = …, Username = … }`. Compiled anonymous types are internal to their declaring assembly. Across the `WebChat.Hubs` → `WebChat.Tests` boundary I verified all three of these by assertion:

- `payload.GetType().IsPublic == false`, `IsNotPublic == true`, `Assembly.GetName().Name == "WebChat.Hubs"`.
- **Reflection works**: `type.GetProperty("UserId")!.GetValue(payload)` returns the value fine — accessibility does not block reflection on public members of an internal type in .NET Core.
- **`dynamic` does not work**: `dynamic d = payload; string x = d.UserId;` throws `RuntimeBinderException: 'object' does not contain a definition for 'UserId'`.

So you have two choices, and I recommend the second:

1. Keep the anonymous type and read the payload by reflection. Works today, costs three ugly lines per assertion, and gives a poor failure message when a property is renamed (`null` rather than "no such property").
2. **Give the payload a name** — a `public sealed record TypingNotification(string UserId, string ThreadId, string? Username)` in `WebChat.Hubs`. Then the test is `var payload = Assert.IsType<TypingNotification>(args[0]); Assert.Equal(Alice, payload.UserId);`. This also makes the wire contract an explicit, reviewable, greppable thing rather than something you have to read the hub body to discover — which matters because `ClientApp` parses it on the other side. Serialization is unchanged (Newtonsoft serialises a record's properties the same way).

I would do (2) as part of this change. It is a two-line addition to production code and it removes the only genuinely awkward part of the test.

## Options

### 1. Mocking library — recommend **NSubstitute 6.0.0**

Versions and dates read from the NuGet registration API on **2026-08-07**:

| Package | Latest stable | Published | Licence |
|---|---|---|---|
| NSubstitute | **6.0.0** | 2026-07-12 | BSD-3-Clause |
| FakeItEasy | 9.0.1 | 2026-01-24 | MIT |
| Moq | 4.20.72 | **2024-09-07** | BSD-3-Clause |
| NSubstitute.Analyzers.CSharp | 1.0.17 | — | BSD-3-Clause |

**The SponsorLink controversy is over and no longer the reason to avoid Moq.** SponsorLink shipped in 4.20.0/4.20.1 (August 2023) and was removed in 4.20.2; 4.20.0 and 4.20.1 are unlisted on NuGet. The *current* reason to avoid Moq is duller and more decisive: **its last release was 2024-09-07, 23 months ago**, and NSubstitute 6.0.0 (a month old) explicitly added .NET 10 to its test matrix. For a personal project whose maintenance burden is the thing being minimised, take the one that is still shipping.

NSubstitute 6.0.0's breaking changes are irrelevant here: TFMs raised to .NET 8 / netstandard2.0, legacy obsolete API removed, nullability enabled on the public API. Nothing this repo would have used.

Verified: NSubstitute 6.0.0 + NSubstitute.Analyzers.CSharp 1.0.17 restore and build cleanly **alongside the exact package set `WebChat.Tests` already has** (coverlet.collector 6.0.4, EF Core Sqlite 10.0.10, Test.Sdk 17.14.1, SQLitePCLRaw 3.0.5, xunit 2.9.3, xunit.runner.visualstudio 3.1.4, Xunit.SkippableFact 1.5.61) — no version conflicts, no NU warnings, `TreatWarningsAsErrors=true` clean.

**Why a library at all, when the repo's existing tests use real objects?** I wrote both and ran both. The hand-rolled version needs `RecordingClientProxy` (7 lines, genuinely nice) plus `RecordingHubClients` implementing **12 members** of `IHubCallerClients` — `All`, `Caller`, `Others`, `AllExcept`, `Client`, `Clients`, `Group`, `GroupExcept`, `Groups`, `OthersInGroup`, `User`, `Users` — of which the hub uses one. That is ~35 lines of boilerplate that has to be re-touched every time ASP.NET Core adds a member to the interface, which it has done (`ISingleClientProxy` arrived in .NET 8). Use NSubstitute for `IHubCallerClients`, `IClientProxy` and `IHubDirectory`; use the **real** `ConnectionMapping<string>` (its whole job is the first-connection/last-connection counting the presence test is about, so substituting it would test nothing).

Not recommended: FakeItEasy is fine and maintained, just no reason to prefer it. `SignalR.UnitTestingSupport.xUnit` 10.0.0 (MIT, net10.0, 136k downloads, 27 stars, one maintainer) is a real option but pulls Moq 4.18.4 + EF Core InMemory + EF Core Sqlite and depends on `xunit` 2.6.4 — three unwanted dependencies and an xUnit-v3 blocker, to save the ten lines above.

### 2. Assertion library — recommend **plain `Assert`**

**FluentAssertions is not ruled out by licence, but it is ruled out by judgement.** v8 (latest 8.10.0, checked 2026-08-07) ships under the Xceed *Community License*, which explicitly permits use "in developing or testing open-source software" and "for developing or testing personal, or experimental projects" — this repo qualifies. But it is a proprietary licence, "perpetual **unless revoked by Xceed**", on a repo that currently has zero proprietary dependencies. v7 remains Apache-2.0 forever but is frozen to bugfixes.

Shouldly (4.3.0, BSD-3-Clause, published 2025-01-23; 5.0.0-preview.2 out) is the free equivalent if you want fluent syntax. But the existing tests use plain `Assert` and read fine, and the hub assertions here are `Assert.Equal` on strings and collections. Adding an assertion DSL to a five-test file is churn.

### 3. xUnit v2 vs v3 — **v3 works, do it separately**

xunit.v3 **3.2.2** is the latest stable (published 2026-01-14; a 4.0.0 prerelease line has been running since March 2026). `xunit.runner.visualstudio` 3.1.5 and `Microsoft.NET.Test.Sdk` 18.8.1 are the current runners.

I ported the whole hub suite to v3 and ran it: **5/5 passed with zero source changes.** Only the csproj moved — `xunit` → `xunit.v3` 3.2.2, add `<OutputType>Exe</OutputType>`, bump Test.Sdk to 18.8.1 and the VS runner to 3.1.5.

The real migration cost is elsewhere in `WebChat.Tests`: **`Xunit.SkippableFact` is xUnit-v2-only.** Version 1.5.61's nuspec depends on `xunit.extensibility.execution` 2.4.0; there is no v3 build. `Email/SmtpEmailSenderIntegrationTests.cs` uses `[SkippableFact]` twice and `Skip.IfNot(...)` twice. v3 makes the package redundant — `[Fact]` + `Assert.SkipUnless(Configured, "…")` is the direct replacement — so migrating actually *removes* a dependency. Other v3 breaking changes (`async void` tests fast-fail; `IAsyncLifetime` now extends `IAsyncDisposable`) do not apply: the existing tests use `IDisposable`.

So: worth doing, cheap, but it touches a file unrelated to the hub. Land the hub tests on v2 first, migrate the project to v3 as its own commit.

### 4. One test project or several — **keep the one you have**

There is no Microsoft guidance on test-projects-per-production-project; I checked, and [Best practices for writing unit tests](https://learn.microsoft.com/en-us/dotnet/core/testing/unit-testing-best-practices) (page updated 2026-04-09) says nothing about it. The one organisational sentence it does offer is about a *different* axis:

> "You can also keep your unit tests in a separate project from your integration tests. This approach ensures your unit test project doesn't have references to or dependencies on infrastructure packages."

That axis is live in this repo — `WebChat.Tests` already mixes SQLite-backed EF tests and a real-SMTP integration test with pure unit tests — but it is not what this change is about, and splitting it now would be a bigger, unrelated change. One test project per production project is a habit from large solutions where build-graph parallelism and reference hygiene pay for the overhead; at 7 projects with ~50 tests it just multiplies csproj maintenance by six.

**Do not create a new project.** `WebChat.Tests` is named in `CLAUDE.md`, wired into the solution, and already has the right settings. Add a `Hubs/` folder and one `ProjectReference`. (Note that issue #16 "No .NET test project exists" is stale and should be closed.)

Verified: the test project needs **no** `<FrameworkReference Include="Microsoft.AspNetCore.App" />` of its own — it flows transitively through the `ProjectReference` to `WebChat.Hubs`, which declares it. I built with and without; both work.

### 5. Faking `HubCallerContext` — **hand-write it**

`HubCallerContext` is abstract with 6 abstract properties and 1 abstract method, and no declared constructor. `Substitute.For<HubCallerContext>()` would work, but you would then need three `.Returns()` calls plus a `ClaimsPrincipal` anyway, and the substitute silently returns `null` for `Features` instead of telling you the hub started reading it. A 20-line concrete class is smaller at the call site and fails loudly:

```csharp
public sealed class TestHubCallerContext : HubCallerContext
{
    public TestHubCallerContext(string userId, string connectionId)
    {
        this.ConnectionId = connectionId;
        this.User = new ClaimsPrincipal(
            new ClaimsIdentity([new Claim(ClaimTypes.Name, userId)], "TestAuth"));
    }

    public override string ConnectionId { get; }

    public override string? UserIdentifier => this.User?.Identity?.Name;

    public override ClaimsPrincipal? User { get; }

    public override IDictionary<object, object?> Items { get; } = new Dictionary<object, object?>();

    public override IFeatureCollection Features => throw new NotSupportedException();

    public override CancellationToken ConnectionAborted => CancellationToken.None;

    public override void Abort() => throw new NotSupportedException();
}
```

The authentication-type argument to `ClaimsIdentity` is not optional in spirit: with `null` the identity is unauthenticated. `ClaimTypes.Name` is what backs `Identity.Name`, which is where the hub reads the user id from — matching the `CLAUDE.md` note that `User.Identity.Name` carries the *id*, not the username.

## The complete, verified test

Ran green on .NET SDK 10.0.302, `TreatWarningsAsErrors=true`, 0 warnings. `Assert.Equal([Bob, Carol], audience)` is the assertion that carries the "only the other participants" claim — it fails if the caller is included *or* if a non-participant is.

```csharp
using Microsoft.AspNetCore.SignalR;
using NSubstitute;
using WebChat.Hubs;
using WebChat.Hubs.ConnectionMapper;
using WebChat.Hubs.Interfaces;

namespace WebChat.Tests.Hubs;

public class ChatHubTypingTests
{
    private const string Alice = "user-alice";
    private const string Bob = "user-bob";
    private const string Carol = "user-carol";
    private const string ThreadId = "thread-1";

    [Fact]
    public async Task Typing_reaches_only_the_other_participants()
    {
        var directory = Substitute.For<IHubDirectory>();
        directory.GetParticipantIds(ThreadId).Returns([Alice, Bob, Carol]);
        directory.GetUserNameById(Alice).Returns("alice");

        var proxy = Substitute.For<IClientProxy>();
        var clients = Substitute.For<IHubCallerClients>();
        clients.Users(Arg.Any<IReadOnlyList<string>>()).Returns(proxy);

        var hub = new ChatHub(new ConnectionMapping<string>(), directory)
        {
            Clients = clients,
            Context = new TestHubCallerContext(Alice, "conn-1"),
        };

        await hub.OnTyping(ThreadId);

        // Audience: exactly the peers, never the caller.
        var audience = (IReadOnlyList<string>)clients.ReceivedCalls()
            .Single(c => c.GetMethodInfo().Name == nameof(IHubClients.Users))
            .GetArguments()[0]!;
        Assert.Equal([Bob, Carol], audience);

        // SendAsync is an extension method over IClientProxy.SendCoreAsync, so
        // SendCoreAsync is the only member a substitute ever sees. args has one
        // element because the hub passes a single payload object.
        var call = proxy.ReceivedCalls().Single();
        Assert.Equal(nameof(IClientProxy.SendCoreAsync), call.GetMethodInfo().Name);

        var args = call.GetArguments();
        Assert.Equal("ReciveTypingStatus", args[0]);

        var payload = ((object?[])args[1]!).Single()!;
        Assert.Equal(Alice, Read(payload, "UserId"));
        Assert.Equal(ThreadId, Read(payload, "ThreadId"));
        Assert.Equal("alice", Read(payload, "Username"));
    }

    [Fact]
    public async Task Typing_from_a_non_participant_sends_nothing()
    {
        var directory = Substitute.For<IHubDirectory>();
        directory.GetParticipantIds(ThreadId).Returns([Bob, Carol]);

        var clients = Substitute.For<IHubCallerClients>();

        var hub = new ChatHub(new ConnectionMapping<string>(), directory)
        {
            Clients = clients,
            Context = new TestHubCallerContext(Alice, "conn-1"),
        };

        await hub.OnTyping(ThreadId);

        // Nothing at all - not even a Users(...) lookup with an empty audience.
        Assert.Empty(clients.ReceivedCalls());
    }

    [Fact]
    public async Task Presence_fires_once_per_user_not_once_per_connection()
    {
        var directory = Substitute.For<IHubDirectory>();
        directory.GetPeerIds(Alice).Returns([Bob]);

        var proxy = Substitute.For<IClientProxy>();
        var clients = Substitute.For<IHubCallerClients>();
        clients.Users(Arg.Any<IReadOnlyList<string>>()).Returns(proxy);

        // The real ConnectionMapping, shared across both hub instances: the
        // first-connection rule *is* its behaviour, so faking it tests nothing.
        var connections = new ConnectionMapping<string>();

        var first = new ChatHub(connections, directory)
        {
            Clients = clients,
            Context = new TestHubCallerContext(Alice, "conn-1"),
        };
        await first.OnConnectedAsync();

        var second = new ChatHub(connections, directory)
        {
            Clients = clients,
            Context = new TestHubCallerContext(Alice, "conn-2"),
        };
        await second.OnConnectedAsync();

        var sends = proxy.ReceivedCalls().ToList();
        Assert.Single(sends);
        Assert.Equal("ReciveConnectedStatus", sends[0].GetArguments()[0]);
    }

    /// <summary>
    /// The hub sends an anonymous type, which is internal to WebChat.Hubs: a test in
    /// another assembly can neither name it nor use `dynamic` on it. Delete this and
    /// use Assert.IsType&lt;T&gt; once the payload has a real name.
    /// </summary>
    private static object? Read(object payload, string property) =>
        payload.GetType().GetProperty(property)?.GetValue(payload);
}
```

Only if you prefer the idiomatic-NSubstitute style over the capture style, this also passes and is equivalent for "was it sent at all" — but its failure message is `*Object[]*`, which is why the capture form above is better for payload contents:

```csharp
clients.Received(1).Users(Arg.Is<IReadOnlyList<string>>(ids => ids.SequenceEqual(new[] { Bob, Carol })));

await proxy.Received(1).SendCoreAsync(
    "ReciveTypingStatus",
    Arg.Is<object?[]>(a => a.Length == 1),
    Arg.Any<CancellationToken>());
```

### csproj delta for `WebChat/WebChat.Tests/WebChat.Tests.csproj`

```xml
<PackageReference Include="NSubstitute" Version="6.0.0" />
<PackageReference Include="NSubstitute.Analyzers.CSharp" Version="1.0.17">
  <PrivateAssets>all</PrivateAssets>
  <IncludeAssets>runtime; build; native; contentfiles; analyzers; buildtransitive</IncludeAssets>
</PackageReference>
```

plus, in the existing `ProjectReference` group:

```xml
<ProjectReference Include="..\WebChat.Hub\WebChat.Hubs.csproj" />
```

The analyzer package is not optional in my recommendation — it is the thing that converts the `SendAsync` mistake from a runtime puzzle into a build failure.

## What this does *not* buy you

Every one of these tests would still pass if SignalR never delivered a byte. They pin *addressing and authorization logic inside the hub method* — who is in the audience, whether a non-member is refused, whether presence double-fires. The ctx notes record that "live hub round trip still unverified" survived all seven phases of the Redux refactor; **this change does not close that.** Closing it needs an integration test: `WebApplicationFactory`/`TestServer` + a real `HubConnectionBuilder` against `server.CreateHandler()`. That is a separate, larger piece of work with its own project-layout question (and is exactly the unit-vs-integration split the Microsoft page recommends). Worth saying out loud so nobody mistakes green hub tests for a working hub.

## Cost to stop

Low, in every direction. NSubstitute appears in test files only; ripping it out means rewriting the doubles by hand (~35 lines, shown to work). The xUnit v3 move is csproj-only for the hub tests and a four-line edit to the SMTP test. Naming the payload type is the only production-code change and it is additive. Nothing here is irreversible and nothing constrains a later integration-test project.

## What I could not confirm

- **Nothing about the current `ChatHub`.** The working tree was being edited while I researched: `WebChat.Hub/Interfaces/IHubDirectory.cs` was present when I started and gone 20 minutes later, and `ChatHub.cs` reverted to the pre-rewrite `Clients.All` version. The first run of these tests *did* compile and pass against the real `WebChat.Hubs` project reference; the final 5/5 run is against a verbatim copy of the rewritten hub in a scratch project. Re-run against the real project once the rewrite lands.
- **The `Users` overload-resolution question is settled by the language rules, not by my test.** `HubClientsExtensions` also defines `Users(this IHubClients<T>, IEnumerable<string>)`, and C# only considers extension methods when no applicable instance/interface method exists — so `Clients.Users(List<string>)` binds to the interface member. My test cannot distinguish the two because the extension delegates to the same member anyway. It does not matter either way.
- **Xceed's per-seat price for FluentAssertions.** Secondary reporting says $130/developer/year; [Xceed's own FAQ](https://xceed.com/fluent-assertions-faq/) says only "a very nominal price". Irrelevant to the recommendation, since a personal project falls inside the free Community License.
- **`OnDisconnectedAsync`** is declared in `ChatHub` as `Exception exception` while the framework declares `Exception?`. In a `Nullable`-enabled test project, `await hub.OnDisconnectedAsync(null)` will warn. I did not test the disconnect path; expect to need `null!` or a fixed signature.
- **Whether `Microsoft.NET.Test.Sdk` 18.8.1 is safe with xUnit v2** — I only used 18.8.1 in the v3 configuration and left v2 on the repo's existing 17.14.1.

## Sources

- [`IClientProxy.cs`, dotnet/aspnetcore main](https://raw.githubusercontent.com/dotnet/aspnetcore/main/src/SignalR/server/Core/src/IClientProxy.cs) — established that `SendCoreAsync` is the sole member. The deciding source.
- [`ClientProxyExtensions.cs`](https://raw.githubusercontent.com/dotnet/aspnetcore/main/src/SignalR/server/Core/src/ClientProxyExtensions.cs) — all 10 `SendAsync` overloads are extensions that forward to `SendCoreAsync`.
- [`IHubClients'T.cs`](https://raw.githubusercontent.com/dotnet/aspnetcore/main/src/SignalR/server/Core/src/IHubClients%60T.cs), [`IHubCallerClients.cs`](https://raw.githubusercontent.com/dotnet/aspnetcore/main/src/SignalR/server/Core/src/IHubCallerClients.cs), [`IHubCallerClients'T.cs`](https://raw.githubusercontent.com/dotnet/aspnetcore/main/src/SignalR/server/Core/src/IHubCallerClients%60T.cs) — `Users(IReadOnlyList<string>)` is a real member; 12 members total to hand-roll.
- [`Hub.cs`](https://raw.githubusercontent.com/dotnet/aspnetcore/main/src/SignalR/server/Core/src/Hub.cs), [`HubCallerContext.cs`](https://raw.githubusercontent.com/dotnet/aspnetcore/main/src/SignalR/server/Core/src/HubCallerContext.cs) — settable `Clients`/`Context`; the 7 abstract members to implement.
- [dotnet/AspNetCore.Docs issue #11052, "How to Unit Test SignalR"](https://github.com/dotnet/AspNetCore.Docs/issues/11052) — **open since 2019-02-22, in Backlog**. This is the evidence that there is no official Microsoft guidance for ASP.NET Core SignalR hub unit testing. The [SignalR 2 unit-testing page](https://learn.microsoft.com/en-us/aspnet/signalr/overview/testing-and-debugging/unit-testing-signalr-applications) that search engines surface is for the ASP.NET-era SignalR and its `IHubCallerConnectionContext` API does not exist in ASP.NET Core — it looked authoritative and is not applicable.
- NuGet flat-container and registration APIs (`api.nuget.org`), and GitHub Releases for devlooped/moq, nsubstitute, FakeItEasy, shouldly — all version numbers and publish dates above, read 2026-08-07.
- [`xunit.skippablefact` 1.5.61 nuspec](https://api.nuget.org/v3-flatcontainer/xunit.skippablefact/1.5.61/xunit.skippablefact.nuspec) — depends on `xunit.extensibility.execution` 2.4.0; v2 only.
- [xUnit v2→v3 migration guide](https://xunit.net/docs/getting-started/v3/migration) and [What's new in v3](https://xunit.net/docs/getting-started/v3/whats-new) — package renames, `OutputType=Exe`, `Assert.Skip`/`SkipUnless`/`SkipWhen`.
- [Fluent Assertions LICENSE (main branch)](https://github.com/fluentassertions/fluentassertions/blob/main/LICENSE) — Community License covers open-source and "personal, or experimental projects"; perpetual "unless revoked by Xceed". [Xceed FAQ](https://xceed.com/fluent-assertions-faq/) confirms v7 stays Apache-2.0 indefinitely.
- [`SignalR.UnitTestingSupport.xUnit` 10.0.0 nuspec](https://api.nuget.org/v3-flatcontainer/signalr.unittestingsupport.xunit/10.0.0/signalr.unittestingsupport.xunit.nuspec) and its [Common package](https://api.nuget.org/v3-flatcontainer/aspnetcore.signalr.unittestingsupport.common/10.0.0/aspnetcore.signalr.unittestingsupport.common.nuspec) — MIT, net10.0, but `xunit` 2.6.4 + Moq 4.18.4 + EF Core InMemory + EF Core Sqlite.
- [Best practices for writing unit tests](https://learn.microsoft.com/en-us/dotnet/core/testing/unit-testing-best-practices) (page updated 2026-04-09) — no per-project guidance; the only organisational advice is to split unit tests from integration tests.
- Local empirical runs on .NET SDK **10.0.302** (all outputs quoted above are from actual `dotnet test` runs, not recalled).
