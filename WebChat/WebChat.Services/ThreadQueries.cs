using System.Collections.Generic;
using System.Linq;
using WebChat.Models;

namespace WebChat.Services
{
    /// <summary>
    /// Membership queries, shared by <c>Validator</c>, the services and their tests.
    ///
    /// They take an <see cref="IQueryable{T}"/> so a test can exercise the real expression
    /// against a real database rather than a copy written in the test file - the same reason
    /// <see cref="UserQueries"/> is shaped this way.
    ///
    /// <see cref="IsParticipant"/> is an authorization check. It is the only thing standing
    /// between a user and someone else's messages, so it is deliberately small and total:
    /// every input, including nulls and unknown ids, produces a decision rather than an
    /// exception.
    /// </summary>
    public static class ThreadQueries
    {
        /// <summary>
        /// True when this user is a member of this thread.
        ///
        /// Both arguments come from the request - the id from the URL, the user from the
        /// token - so both are guarded. The implementation this replaces did
        /// <c>thread.OwnerId</c> on a possibly-null thread, which turned an invented id in
        /// the URL into a 500 from the authorization check itself.
        /// </summary>
        public static bool IsParticipant(IQueryable<ThreadParticipant> participants, string threadId, string userId)
        {
            if (string.IsNullOrWhiteSpace(threadId) || string.IsNullOrWhiteSpace(userId))
            {
                return false;
            }

            return participants.Any(p => p.ThreadId == threadId && p.UserId == userId && !p.isDeleted);
        }

        /// <summary>
        /// Everyone in the thread, for delivering a message.
        ///
        /// Replaces "find the other person": a group has to reach every member, and the
        /// sender is included so their own other devices see what they sent.
        /// </summary>
        public static List<string> ParticipantIds(IQueryable<ThreadParticipant> participants, string threadId)
        {
            if (string.IsNullOrWhiteSpace(threadId))
            {
                return new List<string>();
            }

            return participants
                .Where(p => p.ThreadId == threadId && !p.isDeleted)
                .Select(p => p.UserId)
                .ToList();
        }
    }
}
