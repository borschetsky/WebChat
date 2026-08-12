using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using WebChat.Services;

namespace WebChat.Controllers
{
    /// <summary>
    /// The invitee's side of an invitation: looking a link up, and redeeming it.
    ///
    /// **Deliberately not on <see cref="AdminController"/>.** That controller carries
    /// <c>[Authorize(Roles = owner,admin)]</c> at the class level, and the person opening an
    /// invitation is by definition neither - most of the time they are not signed in at all.
    /// Putting these here keeps that blanket policy honest instead of riddling it with
    /// exceptions.
    ///
    /// The token in the URL is the only credential either endpoint needs, which is exactly
    /// why the mechanism around it matters: single-use, revocable, and rotated on every
    /// resend.
    /// </summary>
    [ApiController]
    [Route("api/invitations")]
    public class InvitationsController : ControllerBase
    {
        private readonly IInvitationService invitations;

        public InvitationsController(IInvitationService invitations)
        {
            this.invitations = invitations;
        }

        /// <summary>
        /// What a link is for, without consuming it.
        ///
        /// Anonymous, because the landing page has to render before anybody signs in - it is
        /// what tells a stranger which workspace they are being asked to join, and lets them
        /// decide whether to register at all.
        ///
        /// It answers with the invited address and role and nothing else. Holding the token
        /// is what proves the caller is entitled to that much; anything more would make a
        /// leaked link a way to read the workspace.
        /// </summary>
        [AllowAnonymous]
        [HttpGet("{token}")]
        public async Task<IActionResult> Inspect(string token)
        {
            var result = await this.invitations.InspectAsync(token);

            if (!result.Ok)
            {
                // One answer for "no such token" and "no longer usable" alike. Distinguishing
                // them would turn this into an oracle for whether a guessed token ever
                // existed, and neither case leaves the invitee anything different to do.
                return this.NotFound(new
                {
                    error = "invitation_unavailable",
                    message = "This invitation link is no longer valid. Ask for a new one.",
                });
            }

            return this.Ok(new
            {
                email = result.Invitation.Email,
                role = result.Invitation.Role,
                expiresAtUtc = result.Invitation.ExpiresAtUtc,
            });
        }

        /// <summary>
        /// Redeems the link for the signed-in caller.
        ///
        /// Authenticated, and that is the whole flow: a visitor with no account registers
        /// first - inheriting the confirmed address, because the invitation reaching their
        /// inbox already proved it - signs in, and only then redeems. Doing the account
        /// creation here as well would mean a second registration path with its own
        /// validation, uniqueness checks and password rules to keep in step.
        ///
        /// The link is bearer, so whoever is signed in when it is opened becomes the member,
        /// and the audit entry names them rather than the invited address.
        /// </summary>
        [Authorize]
        [HttpPost("{token}/redeem")]
        public async Task<IActionResult> Redeem(string token)
        {
            var result = await this.invitations.RedeemAsync(token, this.User.Identity?.Name);

            if (!result.Ok)
            {
                return this.BadRequest(new
                {
                    error = "invitation_unavailable",
                    message = "This invitation link is no longer valid. Ask for a new one.",
                });
            }

            return this.Ok(new { redeemed = true, role = result.Invitation?.Role });
        }
    }
}
