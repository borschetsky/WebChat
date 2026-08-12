using Microsoft.AspNetCore.SignalR;
using WebChat.Hubs;
using WebChat.Hubs.ConnectionMapper;

namespace WebChat.Tests.Hubs;

/// <summary>
/// ChatHub used to send every typing event to <c>Clients.All</c>, with no check that the
/// caller was in the thread at all. These tests pin both halves of the fix: the audience is
/// the thread's own participants, and a caller who is not one of them is answered with
/// silence.
///
/// The fakes deliberately throw from <c>Clients.All</c>, so a regression to broadcasting
/// fails here rather than quietly shipping.
/// </summary>
public class ChatHubTests
{
    private const string Alice = "alice-id";
    private const string Bob = "bob-id";
    private const string Carol = "carol-id";
    private const string Group = "thread-group";

    private readonly FakeDirectory directory = new();
    private readonly FakeConnections connections = new();

    // The real one: it is plain in-memory bookkeeping with no dependencies, so faking it
    // would only test the fake.
    private readonly ConnectionAborter aborter = new();
    private readonly RecordingClients clients = new();

    public ChatHubTests()
    {
        this.directory.Threads[Group] = new List<string> { Alice, Bob, Carol };
        this.directory.Names[Alice] = "Alice";
        this.directory.Names[Bob] = "Bob";
    }

    private ChatHub HubFor(string callerId)
    {
        var hub = new ChatHub(this.connections, this.directory, this.aborter)
        {
            Clients = this.clients,
            Context = new FakeCallerContext(callerId),
        };

        return hub;
    }

    /// <summary>Reads a property off the anonymous payload the hub sends.</summary>
    private static object? Property(object payload, string name) =>
        payload.GetType().GetProperty(name)?.GetValue(payload);

    [Fact]
    public async Task Typing_reaches_the_other_participants_and_not_the_typist()
    {
        await this.HubFor(Alice).OnTyping(Group);

        var send = Assert.Single(this.clients.Sends);
        Assert.Equal("ReciveTypingStatus", send.Method);
        Assert.Equal(new[] { Bob, Carol }, send.Audience);
        Assert.DoesNotContain(Alice, send.Audience);
    }

    [Fact]
    public async Task Typing_carries_the_name_because_a_group_has_to_say_who()
    {
        await this.HubFor(Alice).OnTyping(Group);

        var payload = Assert.Single(this.clients.Sends).Args.Single()!;
        Assert.Equal(Alice, Property(payload, "UserId"));
        Assert.Equal(Group, Property(payload, "ThreadId"));
        Assert.Equal("Alice", Property(payload, "Username"));
    }

    [Fact]
    public async Task A_non_participant_reaches_nobody()
    {
        // Dave is authenticated but not in the thread. Before the fix this was delivered to
        // every connected client, so anyone could push an indicator into any conversation.
        await this.HubFor("dave-id").OnTyping(Group);

        Assert.Empty(this.clients.Sends);
    }

    [Theory]
    [InlineData("no-such-thread")]
    [InlineData("")]
    [InlineData(null)]
    public async Task An_unknown_or_missing_thread_reaches_nobody(string? threadId)
    {
        await this.HubFor(Alice).OnTyping(threadId!);

        // Silence for both "does not exist" and "you are not in it" - answering differently
        // would tell a caller which thread ids are real.
        Assert.Empty(this.clients.Sends);
    }

    [Fact]
    public async Task A_thread_with_nobody_else_in_it_reaches_nobody()
    {
        this.directory.Threads["solo"] = new List<string> { Alice };

        await this.HubFor(Alice).OnTyping("solo");

        Assert.Empty(this.clients.Sends);
    }

    [Fact]
    public async Task Stopping_uses_the_stop_event_and_the_same_audience()
    {
        await this.HubFor(Alice).OnStopTyping(Group);

        var send = Assert.Single(this.clients.Sends);
        Assert.Equal("ReciveStopTypingStatus", send.Method);
        Assert.Equal(new[] { Bob, Carol }, send.Audience);
    }

    [Fact]
    public async Task Coming_online_tells_peers_only_once_however_many_tabs()
    {
        this.directory.Peers[Alice] = new List<string> { Bob, Carol };
        var hub = this.HubFor(Alice);

        await hub.OnConnectedAsync();

        var send = Assert.Single(this.clients.Sends);
        Assert.Equal("ReciveConnectedStatus", send.Method);
        Assert.Equal(new[] { Bob, Carol }, send.Audience);
        Assert.Equal(Alice, send.Args.Single());

        // A second tab is not a second arrival.
        var secondTab = new ChatHub(this.connections, this.directory, this.aborter)
        {
            Clients = this.clients,
            Context = new FakeCallerContext(Alice, "conn-2"),
        };
        await secondTab.OnConnectedAsync();

        Assert.Single(this.clients.Sends);
    }

    [Fact]
    public async Task Going_offline_waits_for_the_last_connection_to_close()
    {
        this.directory.Peers[Alice] = new List<string> { Bob };
        this.connections.Add(Alice, "conn-1");
        this.connections.Add(Alice, "conn-2");

        var firstTab = new ChatHub(this.connections, this.directory, this.aborter)
        {
            Clients = this.clients,
            Context = new FakeCallerContext(Alice, "conn-1"),
        };
        await firstTab.OnDisconnectedAsync(null);

        // One tab of two closed: still online.
        Assert.Empty(this.clients.Sends);

        var secondTab = new ChatHub(this.connections, this.directory, this.aborter)
        {
            Clients = this.clients,
            Context = new FakeCallerContext(Alice, "conn-2"),
        };
        await secondTab.OnDisconnectedAsync(null);

        var send = Assert.Single(this.clients.Sends);
        Assert.Equal("ReciveDisconnectedStatus", send.Method);
        Assert.Equal(new[] { Bob }, send.Audience);
    }

    [Fact]
    public async Task Presence_says_nothing_to_someone_with_no_peers()
    {
        await this.HubFor("hermit-id").OnConnectedAsync();

        Assert.Empty(this.clients.Sends);
    }
}
