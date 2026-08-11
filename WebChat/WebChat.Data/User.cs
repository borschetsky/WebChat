using System;
using System.Collections;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using WebChat.Models.Abstractions;
using WebChat.Models.Interfaces;

namespace WebChat.Models
{
    public class User : BaseEntity, IAuditable, IDeletable
    {
        public User()
        {
            Messages = new HashSet<Message>();
        }
        [MaxLength(60)]
        public string Username { get; set; }

        [Required]
        [MaxLength(60)]
        public string Email { get; set; }

        [Required]
        public string Password { get; set; }

        public string AvatarFileName { get; set; }

        /// <summary>
        /// Workspace role: see <see cref="WorkspaceRole"/>. Defaults to member, and
        /// registration sets it explicitly rather than relying on that default - the #63
        /// group-role migration backfilled existing rows and thereby disguised a write path
        /// that never assigned the column at all.
        ///
        /// Read on every authenticated request, in the same query that checks
        /// <see cref="SecurityStamp"/>, so a change takes effect immediately rather than when
        /// the token expires. Not carried in the JWT for that reason.
        /// </summary>
        [Required]
        [MaxLength(20)]
        public string Role { get; set; } = WorkspaceRole.Member;

        /// <summary>
        /// False until the address has been proven reachable. Sign-in is refused while this
        /// is false, so it is the only thing standing between the app and accounts registered
        /// against mistyped or someone else's addresses.
        /// </summary>
        public bool EmailConfirmed { get; set; }

        /// <summary>
        /// SHA-256 of the outstanding confirmation token, or null when nothing is pending.
        /// The token itself is never stored: a leaked database must not hand over the ability
        /// to activate every waiting account. Cleared on use, which is what makes a link
        /// single-use.
        /// </summary>
        public string EmailConfirmationTokenHash { get; set; }

        /// <summary>
        /// When the outstanding token was issued, in UTC - the column is
        /// `timestamp with time zone` and Npgsql throws on a Local or Unspecified Kind. Expiry
        /// is measured from here.
        /// </summary>
        [DataType(DataType.DateTime)]
        public DateTime? EmailConfirmationSentAt { get; set; }

        /// <summary>
        /// Changes whenever every existing session must stop working - currently on password
        /// reset. Issued tokens carry the value they were signed with, and authentication
        /// rejects any token whose stamp no longer matches.
        ///
        /// This exists because the JWT is otherwise unrevokable: it carries a user id and an
        /// expiry and nothing consults the database, so a stolen token stayed valid for the
        /// full seven-day lifespan no matter what the owner did about it. Resetting a password
        /// without this ends nothing.
        /// </summary>
        public string SecurityStamp { get; set; }

        /// <summary>
        /// SHA-256 of the outstanding password-reset token, or null when none is pending.
        /// Stored as a hash for the same reason as the confirmation token: a leaked database
        /// must not hand over the ability to take over every account with a reset in flight.
        /// Cleared on use, which is what makes a reset link single-use.
        /// </summary>
        public string PasswordResetTokenHash { get; set; }

        /// <summary>
        /// When the outstanding reset token was issued, in UTC. Expiry is measured from here,
        /// and is deliberately much shorter than the confirmation window - a reset link is a
        /// live credential for whatever it opens, so it should not sit valid in an inbox
        /// overnight.
        /// </summary>
        [DataType(DataType.DateTime)]
        public DateTime? PasswordResetSentAt { get; set; }

        public ICollection<Message> Messages { get; set; }

        public ICollection<Thread> Threads { get; set; }

        

    }
}
