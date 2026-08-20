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
        /// Object key of the un-cropped photo <see cref="AvatarFileName"/> was cut out of, or
        /// null when there is none (#88).
        ///
        /// Always carries <c>AvatarStorage.OriginalPrefix</c>, which is what keeps it off the
        /// anonymous <c>/images/{name}</c> read path: an original holds precisely the pixels
        /// the user chose to crop away, so it is served only to its owner, only through an
        /// authenticated endpoint.
        ///
        /// **Null on every row written before this column existed**, and it is not backfilled
        /// from <see cref="AvatarFileName"/>. Treating the stored crop as its own original
        /// would let someone "adjust" inside pixels that are already gone - the result would
        /// be a soft, third-generation re-encode of a square, and it could never do the thing
        /// the feature exists for. The client hides "Adjust crop" while this is null.
        /// </summary>
        public string AvatarOriginalFileName { get; set; }

        /// <summary>
        /// The crop rectangle that produced the current avatar, as **percentages** of the
        /// original (react-easy-crop's <c>croppedArea</c>, not <c>croppedAreaPixels</c>).
        ///
        /// Percentages rather than source pixels because a stored pixel rectangle is only
        /// meaningful against the exact image dimensions it was measured in: re-encode the
        /// original at a different size and every saved rectangle is wrong by a scale factor.
        /// The handoff and the research note reach that independently, and react-easy-crop
        /// restores from percentages with <c>initialCroppedAreaPercentages</c>.
        ///
        /// All four are null together. A missing crop is not an error - the cropper simply
        /// opens on the whole original.
        /// </summary>
        public double? AvatarCropX { get; set; }

        /// <inheritdoc cref="AvatarCropX"/>
        public double? AvatarCropY { get; set; }

        /// <inheritdoc cref="AvatarCropX"/>
        public double? AvatarCropWidth { get; set; }

        /// <inheritdoc cref="AvatarCropX"/>
        public double? AvatarCropHeight { get; set; }

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
        /// Account standing: see <see cref="AccountStatus"/>.
        ///
        /// **Deliberately has no property initializer**, unlike <see cref="Role"/> above. An
        /// initializer here would have made the test that proves <c>CreateUser</c> assigns
        /// this pass whether or not the write path had been touched - which is the exact
        /// shape of the #63 bug, where a migration's backfill hid that new rows still got the
        /// column default. Every write path must name a status, and a missing one should be a
        /// loud failure rather than a quiet "active".
        ///
        /// Read on every authenticated request, in the same query that checks
        /// <see cref="SecurityStamp"/> and <see cref="Role"/>, so blocking takes effect on the
        /// caller's next request rather than when their token expires.
        /// </summary>
        [Required]
        [MaxLength(20)]
        public string Status { get; set; }

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
