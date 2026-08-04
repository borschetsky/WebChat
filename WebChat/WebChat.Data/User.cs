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

        public ICollection<Message> Messages { get; set; }

        public ICollection<Thread> Threads { get; set; }

        

    }
}
