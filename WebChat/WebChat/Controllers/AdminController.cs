using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using WebChat.Models;
using WebChat.Services;

namespace WebChat.Controllers
{
    /// <summary>
    /// The workspace admin console's API, per <c>SPEC-groups-and-admin.md</c> §3-5.
    ///
    /// **The role check here is the only one that counts.** The client hides the console
    /// behind <c>isAdminRole</c> and a route guard, but both decide only what to draw and
    /// where to navigate. Nothing stops a member calling these endpoints directly.
    ///
    /// The role never travels in the token - it is attached in <c>OnTokenValidated</c> from
    /// the database read that already verifies the security stamp, which is what makes a
    /// demotion take effect on the very next request rather than in up to seven days. The
    /// consequence for this attribute is that it depends on a claim added at authentication
    /// time and matched against the identity's default <c>RoleClaimType</c>; if that chain
    /// ever breaks, *everyone* including the owner gets 403 and the obvious-looking fix is to
    /// weaken this line. <c>AdminAuthorizationTests</c> exists to make that break loudly.
    ///
    /// Owner-only actions do not belong on this attribute - see #71, where changing a role
    /// needs <c>Roles = WorkspaceRole.Owner</c> on the action itself.
    /// </summary>
    [Authorize(Roles = WorkspaceRole.Owner + "," + WorkspaceRole.Admin)]
    [ApiController]
    [Route("api/admin")]
    public class AdminController : ControllerBase
    {
        private const int DefaultPageSize = 50;

        private readonly IAuditService audit;
        private readonly IUserService users;

        public AdminController(IAuditService audit, IUserService users)
        {
            this.audit = audit;
            this.users = users;
        }

        /// <summary>
        /// The audit log, newest first.
        /// </summary>
        /// <param name="before">
        /// Keyset cursor: the <c>occurredAtUtc</c> of the oldest row the caller already has.
        /// Absent means the first page.
        /// </param>
        [HttpGet("audit")]
        public async Task<IActionResult> Audit([FromQuery] DateTime? before, [FromQuery] int? limit)
        {
            var entries = await this.audit.RecentAsync(before, limit ?? DefaultPageSize);

            return this.Ok(entries.Select(e => new
            {
                id = e.Id,
                kind = e.Action,
                actorId = e.ActorId,
                targetType = e.TargetType,
                targetId = e.TargetId,

                // Facts, never a sentence: the client builds the wording, exactly as it does
                // for system messages, so nothing is frozen in the phrasing or the language
                // of whoever was an admin that day.
                data = SystemDataJson.Data(e.DetailJson),

                // Resolved here, at read time, because the people an audit entry is about are
                // precisely the ones the client can no longer resolve - a deactivated account
                // is gone from every member list the client holds. The actor is added
                // explicitly; NamesFor only walks the ids inside the detail object.
                names = this.NamesFor(e),

                occurredAtUtc = e.OccurredAtUtc,
            }));
        }

        private Dictionary<string, string> NamesFor(AuditEntry entry)
        {
            var names = SystemDataJson.NamesFor(entry.DetailJson, this.users.GetUserNameById)
                        ?? new Dictionary<string, string>();

            foreach (var id in new[] { entry.ActorId, entry.TargetId })
            {
                if (string.IsNullOrWhiteSpace(id) || names.ContainsKey(id)) continue;

                // A missing name is left out rather than filled with a placeholder - the
                // client already renders "someone" for an id it cannot resolve, and inventing
                // one here would put it in two places.
                var name = this.users.GetUserNameById(id);
                if (name != null) names[id] = name;
            }

            return names.Count > 0 ? names : null;
        }
    }
}
