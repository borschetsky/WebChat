using System;
using System.ComponentModel.DataAnnotations;

namespace WebChat.Models
{
    /// <summary>
    /// An outstanding invitation to join the workspace.
    ///
    /// **The link is bearer, not bound to the address.** Whoever opens it joins. That is a
    /// deliberate product choice: invitations get forwarded on purpose, and someone invited
    /// at a work address who registers with a personal one would otherwise simply be locked
    /// out with no way to tell why. It is compensated three ways - the token is single-use,
    /// it can be revoked, and <see cref="RedeemedByUserId"/> records who *actually* redeemed
    /// rather than who was invited, so the audit log answers "who did this let in".
    ///
    /// **Extending an invitation rotates its token.** The 30-day window exists to bound how
    /// long a mailed secret stays live - it has sat in an inbox, passed a scanner, possibly
    /// landed in an archive - so silently moving the deadline extends exactly that exposure,
    /// invisibly to the invitee. Rotating costs nothing. The trap that makes extend and
    /// resend a single operation rather than two: if you rotate, you *must* re-send, or the
    /// administrator clicking "extend" to help somebody has just broken the link that person
    /// already has.
    /// </summary>
    public class Invitation : Abstractions.BaseEntity
    {
        [Required]
        [MaxLength(60)]
        public string Email { get; set; }

        /// <summary>
        /// SHA-256 of the outstanding token, hex. The token itself is never stored, for the
        /// same reason as the confirmation and reset tokens: a leaked database must not hand
        /// over the ability to join the workspace as anybody waiting.
        ///
        /// Rotated on resend, which is what kills the previous link.
        /// </summary>
        [Required]
        public string TokenHash { get; set; }

        /// <summary>When the current token was issued, in UTC. Reset on every resend.</summary>
        [DataType(DataType.DateTime)]
        public DateTime SentAtUtc { get; set; }

        /// <summary>
        /// When the current token lapses, in UTC. Stored rather than derived so the window can
        /// change later without silently re-dating every invitation already in flight.
        /// </summary>
        [DataType(DataType.DateTime)]
        public DateTime ExpiresAtUtc { get; set; }

        [Required]
        [MaxLength(450)]
        public string InvitedByUserId { get; set; }

        /// <summary>
        /// The workspace role the invitee lands in - one of <see cref="WorkspaceRole"/>, and
        /// never Owner: an invitation cannot hand over the workspace.
        /// </summary>
        [Required]
        [MaxLength(20)]
        public string Role { get; set; }

        /// <summary>
        /// The pending account created when this was issued. It is what makes "revoking
        /// deactivates the pending account immediately" expressible, and what puts an invited
        /// person in the members table before they have ever signed in.
        /// </summary>
        [Required]
        [MaxLength(450)]
        public string PendingUserId { get; set; }

        /// <summary>Null while outstanding. Set once, by the redemption's conditional update.</summary>
        [DataType(DataType.DateTime)]
        public DateTime? RedeemedAtUtc { get; set; }

        /// <summary>
        /// Who actually opened the link. With a bearer link this is not necessarily the
        /// invited address, and that difference is the whole reason to record it.
        /// </summary>
        [MaxLength(450)]
        public string RedeemedByUserId { get; set; }

        /// <summary>
        /// Null unless revoked. A status the redemption path checks, not merely a deleted
        /// row - deleting would lose the record that the invitation ever existed, which is
        /// exactly what an audit trail is for.
        /// </summary>
        [DataType(DataType.DateTime)]
        public DateTime? RevokedAtUtc { get; set; }

        /// <summary>Outstanding: not yet redeemed, not revoked, not lapsed.</summary>
        public bool IsOpen(DateTime nowUtc) =>
            this.RedeemedAtUtc == null && this.RevokedAtUtc == null && this.ExpiresAtUtc > nowUtc;
    }
}
