using System.Security.Claims;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.SignalR;
using WebChat.Hubs.Interfaces;

namespace WebChat.Tests.Hubs;

/// <summary>
/// One captured hub send: which clients it was addressed to, the method name, and the
/// payload.
/// </summary>
public sealed record Send(IReadOnlyList<string> Audience, string Method, object?[] Args);

/// <summary>
/// A recording <see cref="IClientProxy"/>.
///
/// The thing to know here, and the reason this is hand-written rather than mocked:
/// <c>SendAsync</c> is an <b>extension method</b> on <c>IClientProxy</c>, not a member of it.
/// A mocking library cannot intercept it. Every overload funnels into the single real member
/// <see cref="SendCoreAsync"/>, so that is what a fake implements and what an assertion has
/// to read.
/// </summary>
public sealed class RecordingProxy : IClientProxy
{
    private readonly List<Send> log;
    private readonly IReadOnlyList<string> audience;

    public RecordingProxy(List<Send> log, IReadOnlyList<string> audience)
    {
        this.log = log;
        this.audience = audience;
    }

    public Task SendCoreAsync(string method, object?[] args, CancellationToken cancellationToken = default)
    {
        this.log.Add(new Send(this.audience, method, args));
        return Task.CompletedTask;
    }
}

/// <summary>
/// Records who the hub addressed. Only the members ChatHub actually uses are implemented;
/// the rest throw, so a future hub method that reaches for Clients.All fails loudly in a
/// test rather than silently broadcasting to everyone - which is the exact bug these tests
/// exist to prevent regressing.
/// </summary>
public sealed class RecordingClients : IHubCallerClients
{
    public List<Send> Sends { get; } = new();

    public IClientProxy Users(IReadOnlyList<string> userIds) => new RecordingProxy(this.Sends, userIds);

    public IClientProxy User(string userId) => new RecordingProxy(this.Sends, new[] { userId });

    public IClientProxy All => throw new InvalidOperationException(
        "ChatHub must not broadcast to every connected client. Address the thread's participants.");

    public IClientProxy Caller => throw new NotImplementedException();

    public IClientProxy Others => throw new NotImplementedException();

    public IClientProxy AllExcept(IReadOnlyList<string> excludedConnectionIds) => throw new NotImplementedException();

    public IClientProxy Client(string connectionId) => throw new NotImplementedException();

    public IClientProxy Clients(IReadOnlyList<string> connectionIds) => throw new NotImplementedException();

    public IClientProxy Group(string groupName) => throw new NotImplementedException();

    public IClientProxy Groups(IReadOnlyList<string> groupNames) => throw new NotImplementedException();

    public IClientProxy GroupExcept(string groupName, IReadOnlyList<string> excludedConnectionIds) => throw new NotImplementedException();

    public IClientProxy OthersInGroup(string groupName) => throw new NotImplementedException();
}

/// <summary>
/// <see cref="HubCallerContext"/> is abstract and <c>Hub.Context</c> is settable, so a test
/// supplies the caller by substituting the whole context rather than by faking auth.
/// </summary>
public sealed class FakeCallerContext : HubCallerContext
{
    private readonly string userId;

    public FakeCallerContext(string userId, string connectionId = "conn-1")
    {
        this.userId = userId;
        this.ConnectionId = connectionId;
    }

    public override string ConnectionId { get; }

    public override string? UserIdentifier => this.userId;

    // The app reads the caller from User.Identity.Name, which carries the user *id*, not the
    // username - see ORIENTATION. ClaimTypes.Name is what backs Identity.Name.
    public override ClaimsPrincipal? User =>
        new(new ClaimsIdentity(new[] { new Claim(ClaimTypes.Name, this.userId) }, "test"));

    public override CancellationToken ConnectionAborted => CancellationToken.None;

    public override IDictionary<object, object?> Items => new Dictionary<object, object?>();

    public override IFeatureCollection Features => throw new NotImplementedException();

    public override void Abort() => throw new NotImplementedException();
}

/// <summary>Directory backed by plain dictionaries - no EF, no database.</summary>
public sealed class FakeDirectory : IHubDirectory
{
    public Dictionary<string, List<string>> Threads { get; } = new();

    public Dictionary<string, string> Names { get; } = new();

    public Dictionary<string, List<string>> Peers { get; } = new();

    public IReadOnlyList<string> GetParticipantIds(string threadId) =>
        this.Threads.TryGetValue(threadId ?? string.Empty, out var ids) ? ids : new List<string>();

    // string?, because an unknown id genuinely has no name and the hub has to cope with that.
    // IHubDirectory declares plain `string` - WebChat.Hubs has no nullable context, so the
    // annotation is only meaningful here, where it stops a CS8603 rather than hiding one.
    public string? GetUserNameById(string userId) =>
        this.Names.TryGetValue(userId ?? string.Empty, out var name) ? name : null;

    public IReadOnlyList<string> GetPeerIds(string userId) =>
        this.Peers.TryGetValue(userId ?? string.Empty, out var ids) ? ids : new List<string>();
}

/// <summary>In-memory connection tracking, matching ConnectionMapping's semantics.</summary>
public sealed class FakeConnections : IConnectionMapping<string>
{
    private readonly Dictionary<string, List<string>> map = new();

    public int Count => this.map.Count;

    public void Add(string key, string connectionId)
    {
        if (!this.map.TryGetValue(key, out var list))
        {
            list = new List<string>();
            this.map[key] = list;
        }

        list.Add(connectionId);
    }

    public IEnumerable<string> GetConnections(string key) =>
        this.map.TryGetValue(key ?? string.Empty, out var list) ? list : Enumerable.Empty<string>();

    public void Remove(string key, string connectionId)
    {
        if (this.map.TryGetValue(key, out var list))
        {
            list.Remove(connectionId);
        }
    }
}
