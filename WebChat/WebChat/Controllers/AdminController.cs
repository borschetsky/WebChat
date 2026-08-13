using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Configuration;
using WebChat.Models;
using WebChat.Services;
using WebChat.Services.Email;

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
        private readonly IMemberAdminService members;
        private readonly IInvitationService invitations;
        private readonly IOverviewService overview;
        private readonly IEmailSender emailSender;
        private readonly EmailOptions emailOptions;
        private readonly IConfiguration configuration;

        public AdminController(
            IAuditService audit,
            IUserService users,
            IMemberAdminService members,
            IInvitationService invitations,
            IOverviewService overview,
            IEmailSender emailSender,
            EmailOptions emailOptions,
            IConfiguration configuration)
        {
            this.audit = audit;
            this.users = users;
            this.members = members;
            this.invitations = invitations;
            this.overview = overview;
            this.emailSender = emailSender;
            this.emailOptions = emailOptions;
            this.configuration = configuration;
        }

        /// <summary>The caller's workspace role, which the role endpoint below branches on.</summary>
        private string ActorRole() =>
            this.User.IsInRole(WorkspaceRole.Owner) ? WorkspaceRole.Owner : WorkspaceRole.Admin;

        /// <summary>Maps a refusal to a status code and a code the client can branch on.</summary>
        private IActionResult Refuse(MemberAdminError error) => error switch
        {
            MemberAdminError.NotFound => this.NotFound(new { error = "not_found" }),

            MemberAdminError.SelfAction => this.BadRequest(new
            {
                error = "self_action",
                message = "You cannot do that to your own account.",
            }),

            MemberAdminError.LastOwner => this.BadRequest(new
            {
                error = "last_owner",
                message = "The workspace would be left with no owner who can sign in.",
            }),

            MemberAdminError.OwnerOnly => this.StatusCode(403, new
            {
                error = "owner_only",
                message = "Only the workspace owner can appoint or remove administrators.",
            }),

            MemberAdminError.InvalidStatus => this.BadRequest(new { error = "invalid_status" }),
            MemberAdminError.InvalidRole => this.BadRequest(new { error = "invalid_role" }),
            _ => this.BadRequest(new { error = "refused" }),
        };

        [HttpGet("overview")]
        public async Task<IActionResult> Overview() => this.Ok(await this.overview.GetAsync());

        [HttpGet("members")]
        public async Task<IActionResult> Members() => this.Ok(await this.members.ListAsync());

        /// <summary>
        /// Moves accounts to a status. Bulk, because the members table has a bulk action bar
        /// - and a bulk call is refused whole rather than applied to the part of the batch
        /// that passes, so an administrator never has to work out which half landed.
        /// </summary>
        [HttpPost("members/status")]
        public async Task<IActionResult> SetStatus([FromBody] MemberStatusRequest request)
        {
            var result = await this.members.SetStatusAsync(
                this.User.Identity?.Name, request?.Ids, request?.Status);

            return result.Ok ? this.Ok(result.Members) : this.Refuse(result.Error);
        }

        /// <summary>
        /// Changes a workspace role.
        ///
        /// Not restricted to owners by an attribute, even though appointing an administrator
        /// is owner-only: an admin may still change a member's role among the non-privileged
        /// ones, so the boundary runs through the *pair* of roles involved, not through the
        /// endpoint. <c>MemberAdminService.SetRoleAsync</c> owns that decision, which keeps it
        /// testable without a host.
        /// </summary>
        [HttpPost("members/{id}/role")]
        public async Task<IActionResult> SetRole(string id, [FromBody] MemberRoleRequest request)
        {
            var result = await this.members.SetRoleAsync(
                this.User.Identity?.Name, this.ActorRole(), id, request?.Role);

            return result.Ok ? this.Ok(result.Members) : this.Refuse(result.Error);
        }

        [HttpGet("invitations")]
        public async Task<IActionResult> Invitations() => this.Ok(await this.invitations.ListAsync());

        /// <summary>
        /// Issues invitations and mails them.
        ///
        /// Rate-limited by the same policy the activation and reset mails use: each address
        /// here costs a send, and per CLAUDE.md that limiter partitions by remote IP and so
        /// depends on <c>ForwardedHeaders__Enabled</c> behind a proxy.
        /// </summary>
        [EnableRateLimiting(Startup.EmailSendPolicy)]
        [HttpPost("invitations")]
        public async Task<IActionResult> Invite([FromBody] InviteRequest request)
        {
            var result = await this.invitations.SendAsync(
                this.User.Identity?.Name, request?.Emails, request?.Role);

            if (!result.Ok) return this.RefuseInvitation(result.Error);

            var failed = await this.MailAll(result.Issued);

            return this.Ok(new
            {
                invitations = result.Invitations,

                // Both reported, because they mean different things to the sender: skipped
                // people are already in, failed ones are not and nobody has told them.
                skipped = result.Skipped,
                failed,
            });
        }

        /// <summary>
        /// Resend, which is also extend - one operation with two labels.
        ///
        /// It rotates the token, so the previous link stops working. That is what bounds how
        /// long a mailed secret stays live; and because the old link dies here, *not* mailing
        /// the new one would silently break the link the invitee already holds. The two
        /// cannot be separate endpoints without one of them being a trap.
        /// </summary>
        [EnableRateLimiting(Startup.EmailSendPolicy)]
        [HttpPost("invitations/{id}/resend")]
        public async Task<IActionResult> Resend(string id)
        {
            var result = await this.invitations.ResendAsync(this.User.Identity?.Name, id);
            if (!result.Ok) return this.RefuseInvitation(result.Error);

            var failed = await this.MailAll(result.Issued);

            return this.Ok(new { invitations = result.Invitations, failed });
        }

        [HttpPost("invitations/{id}/revoke")]
        public async Task<IActionResult> Revoke(string id)
        {
            var result = await this.invitations.RevokeAsync(this.User.Identity?.Name, id);

            return result.Ok ? this.Ok(result.Invitations) : this.RefuseInvitation(result.Error);
        }

        /// <summary>
        /// Mails each freshly issued invitation and returns the addresses that could not be
        /// reached. The invitation still exists for those - it is minted and stored before
        /// this runs - so an administrator can resend rather than start again.
        /// </summary>
        private async Task<List<string>> MailAll(List<IssuedInvitation> issued)
        {
            var publicUrl = (this.configuration.GetValue<string>("App:PublicUrl") ?? string.Empty).TrimEnd('/');
            var failed = new List<string>();

            foreach (var invitation in issued)
            {
                // The SPA route, not the API endpoint - the same reasoning as the activation
                // link. Pointing at the API would show the invitee raw JSON, with no way for
                // the browser to keep the session that redeeming creates.
                var acceptUrl = $"{publicUrl}/invite?token={Uri.EscapeDataString(invitation.Token)}";

                var (html, text) = InvitationEmail.Render(
                    this.emailOptions.FromName, invitation.InvitedByName, acceptUrl, publicUrl);

                var result = await this.emailSender.SendAsync(
                    invitation.Email,
                    InvitationEmail.Subject(this.emailOptions.FromName, invitation.InvitedByName),
                    html,
                    text);

                if (!result.Sent) failed.Add(invitation.Email);
            }

            return failed;
        }

        private IActionResult RefuseInvitation(InvitationError error) => error switch
        {
            InvitationError.NotFound => this.NotFound(new { error = "not_found" }),

            InvitationError.NotOpen => this.BadRequest(new
            {
                error = "not_open",
                message = "That invitation has already been used, revoked, or has lapsed.",
            }),

            InvitationError.InvalidRole => this.BadRequest(new
            {
                error = "invalid_role",
                message = "An invitation cannot make somebody the workspace owner.",
            }),

            InvitationError.NoRecipients => this.BadRequest(new
            {
                error = "no_recipients",
                message = "No email addresses were supplied.",
            }),

            _ => this.BadRequest(new { error = "refused" }),
        };

        public class InviteRequest
        {
            public List<string> Emails { get; set; }

            public string Role { get; set; }
        }

        public class MemberStatusRequest
        {
            public List<string> Ids { get; set; }

            public string Status { get; set; }
        }

        public class MemberRoleRequest
        {
            public string Role { get; set; }
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
