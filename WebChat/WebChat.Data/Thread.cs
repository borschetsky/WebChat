using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text;
using WebChat.Models.Abstractions;

namespace WebChat.Models
{
    public class Thread : BaseEntity
    {
        public Thread()
        {
            CreatedOn = DateTime.UtcNow;
            Messages = new HashSet<Message>();
            Participants = new HashSet<ThreadParticipant>();
        }

        [Required]
        [ForeignKey("OwnerId")]
        public string OwnerId { get; set; }
        public User Owner { get; set; }

        /// <summary>
        /// Legacy. Superseded by <see cref="Participants"/> and read by nothing.
        ///
        /// Kept rather than dropped in the same migration that adds participants: dropping it
        /// would make a rollback unable to reconstruct who was in each thread, since the
        /// backfill derives participants from this column. A follow-up removes it once the new
        /// model has run in production.
        /// </summary>
        public string OponentId { get; set; }

        /// <summary>Display name. Null for a direct message, which is named after the other person.</summary>
        public string Name { get; set; }

        /// <summary>
        /// Stored rather than derived from participant count, because a two-person group is a
        /// different thing from a direct message - it has a name and can gain members - and
        /// inferring it would erase that distinction the moment a group dropped to two people.
        /// </summary>
        public bool IsGroup { get; set; }

        public ICollection<ThreadParticipant> Participants { get; set; }


        public ICollection<Message> Messages { get; set; }
    }
}
