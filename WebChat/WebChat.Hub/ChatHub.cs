using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using System;
using System.Linq;
using System.Threading.Tasks;
using WebChat.Hubs.Interfaces;

namespace WebChat.Hubs
{
    [Authorize]
    public class ChatHub : Hub
    {
        private readonly IConnectionMapping<string> connections;
        private readonly IHubDirectory directory;
        private readonly IConnectionAborter aborter;

        public ChatHub(
            IConnectionMapping<string> connections,
            IHubDirectory directory,
            IConnectionAborter aborter)
        {
            this.connections = connections ?? throw new ArgumentNullException(nameof(connections));
            this.directory = directory ?? throw new ArgumentNullException(nameof(directory));
            this.aborter = aborter ?? throw new ArgumentNullException(nameof(aborter));
        }

        // Typing notification
        public Task OnTyping(string threadId) => this.BroadcastTyping(threadId, "ReciveTypingStatus");

        public Task OnStopTyping(string threadId) => this.BroadcastTyping(threadId, "ReciveStopTypingStatus");

        /// <summary>
        /// Sends a typing event to the other people in the thread, and to nobody else.
        ///
        /// This used to be Clients.All, which had two problems. Everyone connected received
        /// every keystroke event for every conversation - leaking thread ids and who was
        /// active in them - and, because threadId arrives straight from the caller with no
        /// check, any authenticated user could push a typing indicator into a thread they
        /// cannot even open. The membership test below is what closes the second one, and it
        /// has to happen before the send rather than being left to the client to filter.
        /// </summary>
        private async Task BroadcastTyping(string threadId, string method)
        {
            var currentUserId = this.Context.User.Identity.Name;
            if (string.IsNullOrWhiteSpace(threadId) || string.IsNullOrWhiteSpace(currentUserId))
            {
                return;
            }

            var participants = this.directory.GetParticipantIds(threadId);

            // Not a member: say nothing at all. Answering differently for "thread does not
            // exist" and "thread exists but you are not in it" would make this an oracle for
            // which thread ids are real.
            if (!participants.Contains(currentUserId))
            {
                return;
            }

            var audience = participants.Where(id => id != currentUserId).ToList();
            if (audience.Count == 0)
            {
                return;
            }

            // Username travels with the event because a group cannot render "typing..." on
            // its own - it has to say who. The client has no lookup for an arbitrary user id.
            await this.Clients.Users(audience).SendAsync(
                method,
                new
                {
                    UserId = currentUserId,
                    ThreadId = threadId,
                    Username = this.directory.GetUserNameById(currentUserId),
                });
        }

        // Online status
        public override async Task OnConnectedAsync()
        {
            var currentUserId = this.Context.User.Identity.Name;

            // Read before the Add below, so this is the count of *other* connections: a
            // second tab must not announce a user who was already online.
            var alreadyOnline = this.connections.GetConnections(currentUserId).Any();

            this.connections.Add(currentUserId, this.Context.ConnectionId);

            // Tracked so an administrator can close this connection. The mapping above holds
            // ids, which is enough to address a connection and not enough to end one - see
            // IConnectionAborter for why that distinction matters here.
            this.aborter.Track(currentUserId, this.Context);

            if (!alreadyOnline)
            {
                await this.NotifyPeers(currentUserId, "ReciveConnectedStatus");
            }

            await base.OnConnectedAsync();
        }

        // TODO: Invoke this method when user logs out
        public override async Task OnDisconnectedAsync(Exception exception)
        {
            var currentUserId = this.Context.User.Identity.Name;

            this.connections.Remove(currentUserId, this.Context.ConnectionId);

            // Runs for an aborted connection too - SignalR calls this after Abort() - which
            // is what keeps the registry from holding dead connections forever.
            this.aborter.Forget(currentUserId, this.Context.ConnectionId);

            // Only when the last connection goes: closing one of two tabs is not going offline.
            if (!this.connections.GetConnections(currentUserId).Any())
            {
                await this.NotifyPeers(currentUserId, "ReciveDisconnectedStatus");
            }

            await base.OnDisconnectedAsync(exception);
        }

        /// <summary>
        /// Presence goes to people who share a thread with this user, not to everyone.
        /// Someone you have never had a conversation with has no reason to be told you came
        /// online - and the directory's online flags come from GET getusers, not from here,
        /// so narrowing this only narrows *live* updates.
        ///
        /// Awaited, unlike the fire-and-forget SendAsync this replaces: an unobserved task
        /// swallows its own exceptions, so a failing send looked exactly like a working one.
        /// </summary>
        private async Task NotifyPeers(string userId, string method)
        {
            var peers = this.directory.GetPeerIds(userId);
            if (peers.Count == 0)
            {
                return;
            }

            await this.Clients.Users(peers).SendAsync(method, userId);
        }
    }
}
