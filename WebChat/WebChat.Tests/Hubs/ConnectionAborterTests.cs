using System.Threading.Tasks;
using Microsoft.AspNetCore.SignalR;
using WebChat.Hubs;
using WebChat.Hubs.ConnectionMapper;

namespace WebChat.Tests.Hubs;

/// <summary>
/// Closing a user's live hub connections.
///
/// **Why this is not covered by the security stamp.** Rotating the stamp refuses the next
/// request that presents the token - and a SignalR connection presents its token once, at
/// connect, then holds an open socket that nothing re-authenticates. So a member blocked
/// while connected goes on receiving everything their groups produce until they reload.
/// "All sessions ended" would be false for exactly the person it was invoked against.
///
/// These tests use the real <see cref="ConnectionAborter"/> - it is in-memory bookkeeping
/// with no dependencies, so a fake would only be testing itself.
/// </summary>
public class ConnectionAborterTests
{
    private readonly FakeDirectory directory = new();
    private readonly FakeConnections connections = new();
    private readonly ConnectionAborter aborter = new();

    private (ChatHub hub, FakeCallerContext context) Connect(string userId, string connectionId)
    {
        var context = new FakeCallerContext(userId, connectionId);
        var hub = new ChatHub(this.connections, this.directory, this.aborter)
        {
            Context = context,
            Clients = new RecordingClients(),
        };

        return (hub, context);
    }

    [Fact]
    public async Task Aborts_every_connection_a_user_holds()
    {
        var (firstTab, firstContext) = this.Connect("maya", "conn-1");
        var (secondTab, secondContext) = this.Connect("maya", "conn-2");
        await firstTab.OnConnectedAsync();
        await secondTab.OnConnectedAsync();

        var closed = this.aborter.AbortAll("maya");

        Assert.Equal(2, closed);
        Assert.True(firstContext.Aborted);
        Assert.True(secondContext.Aborted);
    }

    /// <summary>
    /// Blocking one member must not disconnect the room. This is the assertion that would
    /// catch an abort keyed on something other than the user.
    /// </summary>
    [Fact]
    public async Task Leaves_everybody_else_connected()
    {
        var (mayasTab, mayasContext) = this.Connect("maya", "conn-1");
        var (bensTab, bensContext) = this.Connect("ben", "conn-2");
        await mayasTab.OnConnectedAsync();
        await bensTab.OnConnectedAsync();

        this.aborter.AbortAll("maya");

        Assert.True(mayasContext.Aborted);
        Assert.False(bensContext.Aborted);
    }

    /// <summary>
    /// The count feeds the audit entry, so it has to mean something. Zero is the ordinary
    /// case - most people being blocked are not connected at the time - and must not read as
    /// a failure.
    /// </summary>
    [Fact]
    public void A_user_with_no_connections_closes_none()
    {
        Assert.Equal(0, this.aborter.AbortAll("nobody"));
    }

    [Fact]
    public async Task A_disconnected_connection_is_not_aborted_twice()
    {
        var (tab, context) = this.Connect("maya", "conn-1");
        await tab.OnConnectedAsync();
        await tab.OnDisconnectedAsync(null);

        Assert.Equal(0, this.aborter.AbortAll("maya"));
        Assert.False(context.Aborted);
    }

    /// <summary>
    /// A blocked user who reconnects before the block lands - or whose client retries - must
    /// be closable again, so aborting cannot leave the registry in a state that ignores the
    /// next connection.
    /// </summary>
    [Fact]
    public async Task A_reconnection_after_an_abort_is_tracked_again()
    {
        var (first, _) = this.Connect("maya", "conn-1");
        await first.OnConnectedAsync();
        this.aborter.AbortAll("maya");
        await first.OnDisconnectedAsync(null);

        var (second, secondContext) = this.Connect("maya", "conn-2");
        await second.OnConnectedAsync();

        Assert.Equal(1, this.aborter.AbortAll("maya"));
        Assert.True(secondContext.Aborted);
    }
}
