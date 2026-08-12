using System.Collections.Generic;
using System.Linq;
using Microsoft.AspNetCore.SignalR;
using WebChat.Hubs.Interfaces;

namespace WebChat.Hubs.ConnectionMapper
{
    /// <summary>
    /// In-memory registry of live hub connections per user. Singleton, like
    /// <see cref="ConnectionMapping{T}"/>, and with the same limitation: it knows only about
    /// connections held by *this* process.
    ///
    /// That limitation is fine here and would not be on a scaled-out deployment. One instance
    /// serves this app (`.do/app.yaml`), so every connection a user holds is one this object
    /// has seen. Behind a backplane, aborting would have to be a message every instance
    /// listens for - at which point this class becomes the local half of that, not the whole
    /// of it. Worth knowing before adding a second instance, because the failure is silent:
    /// blocking would appear to work and would simply not disconnect anyone on the other
    /// node.
    /// </summary>
    public class ConnectionAborter : IConnectionAborter
    {
        private readonly Dictionary<string, Dictionary<string, HubCallerContext>> live = new();

        public void Track(string userId, HubCallerContext context)
        {
            if (string.IsNullOrEmpty(userId) || context == null) return;

            lock (this.live)
            {
                if (!this.live.TryGetValue(userId, out var connections))
                {
                    connections = new Dictionary<string, HubCallerContext>();
                    this.live[userId] = connections;
                }

                connections[context.ConnectionId] = context;
            }
        }

        public void Forget(string userId, string connectionId)
        {
            if (string.IsNullOrEmpty(userId) || connectionId == null) return;

            lock (this.live)
            {
                if (!this.live.TryGetValue(userId, out var connections)) return;

                connections.Remove(connectionId);

                // Drop the empty bucket rather than leaving one per user who has ever
                // connected - this is a process-lifetime singleton.
                if (connections.Count == 0) this.live.Remove(userId);
            }
        }

        public int AbortAll(string userId)
        {
            if (string.IsNullOrEmpty(userId)) return 0;

            List<HubCallerContext> targets;

            lock (this.live)
            {
                if (!this.live.TryGetValue(userId, out var connections)) return 0;

                // Copied out before aborting, and the lock released before the abort itself:
                // Abort() drives OnDisconnectedAsync, which calls Forget, which takes this
                // same lock. Aborting inside it deadlocks whenever the disconnect runs
                // synchronously.
                targets = connections.Values.ToList();
            }

            foreach (var context in targets)
            {
                context.Abort();
            }

            return targets.Count;
        }
    }
}
