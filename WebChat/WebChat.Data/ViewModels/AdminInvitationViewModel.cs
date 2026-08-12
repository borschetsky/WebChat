using System;

namespace WebChat.Models.ViewModels
{
    /// <summary>
    /// One row of the admin console's invitations table.
    ///
    /// Invitations are a separate screen from members because the actions differ - resend,
    /// revoke - and because expiry is what a person scans the list for. Every time here is
    /// an instant; the client computes "expires in 6 days" at render, since the server has
    /// no idea when the page will be read.
    /// </summary>
    public class AdminInvitationViewModel
    {
        public string Id { get; set; }

        public string Email { get; set; }

        /// <summary>Display name of whoever sent it, resolved at read time.</summary>
        public string By { get; set; }

        /// <summary>Workspace role the invitee will land in.</summary>
        public string Role { get; set; }

        /// <summary>
        /// When the *current* token was issued. Moves on every resend, because a resend
        /// mints a new token rather than re-mailing the old one.
        /// </summary>
        public DateTime SentAtUtc { get; set; }

        public DateTime ExpiresAtUtc { get; set; }
    }
}
