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
        /// The permission map: who may rename, who may add members, who may remove them. Each
        /// is a <see cref="PermissionLevel"/>, and only the Owner may change them.
        ///
        /// Three columns rather than a JSON blob, because these are read on every
        /// authorization check and a queryable column costs nothing to add and something real
        /// to retrofit. New groups default to 'admins' on all three, per the spec.
        /// </summary>
        public string PermRename { get; set; } = PermissionLevel.Admins;

        public string PermInvite { get; set; } = PermissionLevel.Admins;

        public string PermRemove { get; set; } = PermissionLevel.Admins;

        /// <summary>
        /// Optimistic concurrency token, incremented on every successful change to the group's
        /// metadata - name, permissions, membership, roles.
        /// </summary>
        ///
        /// <remarks>
        /// Required by the wire contract: every mutation carries <c>If-Match</c> and a stale
        /// value is refused with <c>409 VERSION_CONFLICT</c>, with the current group attached so
        /// the client can re-render rather than guess.
        ///
        /// This is what makes "two admins demote each other at once" resolvable instead of
        /// last-write-wins. Not EF's <c>[Timestamp]</c>/xmin, because the value crosses the wire
        /// and has to be a plain integer the client can echo back.
        /// </remarks>
        public int Version { get; set; }

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
