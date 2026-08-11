using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using WebChat.Models;

namespace WebChat.Services
{
    public interface IAuditService
    {
        /// <summary>
        /// Records an administrative action.
        ///
        /// **Does not save.** The entry is added to the same <c>DbContext</c> the caller is
        /// already using, so the caller's single <c>SaveChangesAsync</c> commits the action
        /// and its audit entry together or commits neither. Calling save here instead would
        /// make the two independently failable, which produces the only two states an audit
        /// log must not have: a recorded action that never happened, and an action with no
        /// record.
        /// </summary>
        /// <param name="detail">
        /// Facts, not a sentence - the client renders the wording. Serialized to JSON as-is;
        /// any user id in here is resolved to a name when the entry is read.
        /// </param>
        void Record(string actorId, string action, string targetType, string targetId, object detail = null);

        /// <summary>
        /// The newest entries, oldest of which is bounded by <paramref name="before"/>.
        ///
        /// Keyset, not offset: this table only grows, and grows at the end that is being
        /// read, so page two of an offset query silently repeats rows that page one already
        /// showed.
        /// </summary>
        Task<IReadOnlyList<AuditEntry>> RecentAsync(DateTime? before, int limit);
    }
}
