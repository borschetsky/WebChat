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

        /// <summary>
        /// Display name, or null.
        ///
        /// Null for a direct message, which is named after the other person - and now also null
        /// for a group nobody has named, whose title is derived from current membership on every
        /// read. Snapshotting that string at creation is what this replaced: it goes stale the
        /// moment a member leaves, silently, and reads as a bug rather than as a stale cache.
        /// </summary>
        public string Name { get; set; }

        /// <summary>
        /// True once somebody has deliberately named this group.
        ///
        /// The flag rather than a null check, because the two states are not the same: a named
        /// group keeps its name forever, even as membership changes, while an unnamed one
        /// re-derives. Without it, renaming a group to exactly its derived title would silently
        /// re-enable derivation.
        /// </summary>
        public bool Named { get; set; }

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
