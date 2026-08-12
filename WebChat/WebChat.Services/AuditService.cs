using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using WebChat.Connection;
using WebChat.Models;

namespace WebChat.Services
{
    /// <summary>
    /// Writes and reads the administrative audit log.
    ///
    /// <see cref="Record"/> deliberately does not save - see <see cref="IAuditService"/> for
    /// why. The pairing it protects is the whole point of the log: an action and its entry
    /// are one transaction or they are nothing.
    ///
    /// System.Text.Json here, not Newtonsoft, and that is not an inconsistency. Newtonsoft is
    /// load-bearing at the *wire* boundary, where the client parses `Dictionary&lt;DateTime,…&gt;`
    /// keys as dates; this is serializing an anonymous object into a column nobody parses as
    /// a dictionary. It matches how <c>GroupService</c> already writes <c>SystemData</c>.
    /// </summary>
    public class AuditService : IAuditService
    {
        /// <summary>
        /// The largest page this will hand out, whatever a caller asks for. An audit log is
        /// the one table where "just fetch everything" is both tempting and unbounded.
        /// </summary>
        public const int MaxPageSize = 200;

        private readonly WebChatContext ctx;

        public AuditService(WebChatContext ctx)
        {
            this.ctx = ctx;
        }

        public void Record(string actorId, string action, string targetType, string targetId, object detail = null)
        {
            this.ctx.AuditEntry.Add(new AuditEntry
            {
                Id = Guid.NewGuid().ToString(),
                ActorId = actorId,
                Action = action,
                TargetType = targetType,
                TargetId = targetId,
                DetailJson = detail == null ? null : JsonSerializer.Serialize(detail),

                // UtcNow, not Now: the column is `timestamp with time zone` and Npgsql throws
                // outright on a Local or Unspecified Kind rather than guessing.
                OccurredAtUtc = DateTime.UtcNow,
            });
        }

        public async Task<IReadOnlyList<AuditEntry>> RecentAsync(DateTime? before, int limit)
        {
            var query = this.ctx.AuditEntry.AsNoTracking();

            // Strictly less-than, so the last row of a page is not repeated as the first row
            // of the next. Two entries sharing a timestamp to the tick would drop one; the id
            // tie-break that would fix it is not worth a composite index at this scale, and
            // the failure is a missing row rather than a duplicated one.
            if (before.HasValue)
            {
                var cutoff = DateTime.SpecifyKind(before.Value, DateTimeKind.Utc);
                query = query.Where(e => e.OccurredAtUtc < cutoff);
            }

            return await query
                .OrderByDescending(e => e.OccurredAtUtc)
                .Take(Math.Clamp(limit, 1, MaxPageSize))
                .ToListAsync();
        }
    }
}
