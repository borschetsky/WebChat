using Microsoft.AspNetCore.SignalR;

namespace WebChat.Hubs.Interfaces
{
    /// <summary>
    /// Closes a user's live hub connections on demand.
    ///
    /// **This exists because rotating a security stamp does not disconnect anybody.** The
    /// stamp is checked when a token is presented, and a SignalR connection presents its
    /// token once, at connect. After that the socket is open and nothing re-authenticates it:
    /// the server pushes messages down a pipe, and there is no request to refuse. So a user
    /// blocked while connected keeps receiving every message their groups produce, for as
    /// long as they leave the tab open - which is precisely the person the block was for.
    ///
    /// Separate from <see cref="IConnectionMapping{T}"/> deliberately. That maps a user to
    /// connection *ids*, which is all presence needs, and an id is not enough to abort:
    /// <c>IHubContext</c> can address a connection but cannot close one. Aborting needs the
    /// <see cref="HubCallerContext"/> itself, and holding those is a heavier promise - it is
    /// the connection object, not a string - so it is worth naming what for.
    /// </summary>
    public interface IConnectionAborter
    {
        /// <summary>Called from <c>OnConnectedAsync</c>.</summary>
        void Track(string userId, HubCallerContext context);

        /// <summary>Called from <c>OnDisconnectedAsync</c>, including after an abort.</summary>
        void Forget(string userId, string connectionId);

        /// <summary>
        /// Closes every connection this user currently holds and returns how many there were.
        ///
        /// The count is the honest thing to put in an audit entry: "ended their sessions" is
        /// not measurable - a token cannot be counted once issued - but the number of live
        /// connections closed is a fact.
        /// </summary>
        int AbortAll(string userId);
    }
}
