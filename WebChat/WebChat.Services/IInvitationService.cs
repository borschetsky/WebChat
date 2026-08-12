using System.Collections.Generic;
using System.Threading.Tasks;
using WebChat.Models;
using WebChat.Models.ViewModels;

namespace WebChat.Services
{
    public enum InvitationError
    {
        None,
        NotFound,

        /// <summary>Already redeemed, revoked, or lapsed.</summary>
        NotOpen,

        /// <summary>The address already belongs to a usable account.</summary>
        AlreadyAMember,

        /// <summary>Not one of <c>WorkspaceRole</c>, or Owner - which cannot be invited into.</summary>
        InvalidRole,

        /// <summary>Nothing that looks like an address was supplied.</summary>
        NoRecipients,
    }

    public class InvitationResult
    {
        public InvitationError Error { get; init; } = InvitationError.None;

        public bool Ok => this.Error == InvitationError.None;

        public IReadOnlyList<AdminInvitationViewModel> Invitations { get; init; } =
            new List<AdminInvitationViewModel>();

        /// <summary>
        /// Addresses that already had a usable account, skipped rather than failing the whole
        /// send. Inviting ten people of whom one is already a member should invite nine, not
        /// nothing - the administrator pasted a list and cannot be expected to have deduped
        /// it against the workspace first.
        /// </summary>
        public List<string> Skipped { get; init; } = new();

        /// <summary>
        /// The token, returned **only** to the caller that just minted it, so the host can
        /// build the link and mail it. Never persisted, never in a list response.
        /// </summary>
        public List<IssuedInvitation> Issued { get; init; } = new();

        public static InvitationResult Fail(InvitationError error) => new() { Error = error };
    }

    /// <summary>One freshly minted invitation, with the plaintext token for its link.</summary>
    public class IssuedInvitation
    {
        public string Email { get; init; }

        public string Token { get; init; }

        public string InvitedByName { get; init; }
    }

    /// <summary>The outcome of opening an invitation link.</summary>
    public class RedemptionResult
    {
        public InvitationError Error { get; init; } = InvitationError.None;

        public bool Ok => this.Error == InvitationError.None;

        /// <summary>The invitation, for a caller that only wants to *inspect* the link.</summary>
        public Invitation Invitation { get; init; }

        public static RedemptionResult Fail(InvitationError error) => new() { Error = error };
    }

    public interface IInvitationService
    {
        Task<IReadOnlyList<AdminInvitationViewModel>> ListAsync();

        /// <summary>
        /// Issues one invitation per address, each creating a pending account. Returns the
        /// plaintext tokens so the caller can send the mail - this service does not send it,
        /// because the templates and the public URL live in the host.
        /// </summary>
        Task<InvitationResult> SendAsync(string actorId, IReadOnlyList<string> emails, string role);

        /// <summary>
        /// Rotates the token, resets the window, and returns the new one to be mailed.
        ///
        /// This is both "resend" and "extend": the 30-day cap bounds how long a mailed secret
        /// stays live, so extending it silently would extend exactly that exposure. And once
        /// the token is rotated the previous link is dead, so *not* re-sending would break
        /// the link the invitee already holds - which is why these cannot be two operations.
        /// </summary>
        Task<InvitationResult> ResendAsync(string actorId, string invitationId);

        /// <summary>Kills the link and deactivates the pending account it created.</summary>
        Task<InvitationResult> RevokeAsync(string actorId, string invitationId);

        /// <summary>Looks a link up without consuming it, for the landing page.</summary>
        Task<RedemptionResult> InspectAsync(string token);

        /// <summary>
        /// Redeems a link for an existing signed-in account.
        ///
        /// Race-safe: a single conditional update claims the invitation, and a second caller
        /// that lost the race is told <see cref="InvitationError.NotOpen"/> rather than being
        /// let in twice. A double-clicked link is the ordinary way this happens.
        /// </summary>
        Task<RedemptionResult> RedeemAsync(string token, string userId);
    }
}
