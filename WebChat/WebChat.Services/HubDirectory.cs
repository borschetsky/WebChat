using System.Collections.Generic;
using System.Linq;
using WebChat.Hubs.Interfaces;

namespace WebChat.Services
{
    /// <summary>
    /// Implements the hub's directory lookups over the existing services.
    ///
    /// This class exists purely to satisfy the reference direction: WebChat.Services already
    /// references WebChat.Hubs, so the hub cannot reference back. The contract lives in the
    /// hub project and is implemented here, which keeps the hub free of any knowledge of EF
    /// or of the service layer.
    /// </summary>
    public class HubDirectory : IHubDirectory
    {
        private readonly IThreadService threadService;
        private readonly IUserService userService;

        public HubDirectory(IThreadService threadService, IUserService userService)
        {
            this.threadService = threadService;
            this.userService = userService;
        }

        public IReadOnlyList<string> GetParticipantIds(string threadId)
        {
            if (string.IsNullOrWhiteSpace(threadId))
            {
                return new List<string>();
            }

            return this.threadService.GetParticipantIds(threadId) ?? new List<string>();
        }

        public string GetUserNameById(string userId) =>
            string.IsNullOrWhiteSpace(userId) ? null : this.userService.GetUserNameById(userId);

        public IReadOnlyList<string> GetPeerIds(string userId)
        {
            if (string.IsNullOrWhiteSpace(userId))
            {
                return new List<string>();
            }

            // One query per thread. Acceptable at this size - a presence change happens on
            // connect and disconnect only, not per keystroke - but it is the obvious thing to
            // replace with a single join if the thread count per user ever grows.
            return this.threadService.GetUserThreads(userId)
                .SelectMany(t => this.threadService.GetParticipantIds(t.Id))
                .Where(id => id != userId)
                .Distinct()
                .ToList();
        }
    }
}
