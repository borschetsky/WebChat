using System;
using System.ComponentModel.DataAnnotations;

namespace WebChat.Models
{
    /// <summary>
    /// One administrative action, recorded so that block and unblock are defensible.
    ///
    /// **Deliberately not a <see cref="Abstractions.BaseEntity"/>.** That base carries
    /// <c>ModifiedOn</c>, <c>isDeleted</c> and <c>DeletedOn</c>, which are the three columns
    /// an append-only log must never have: they invite exactly the two operations the
    /// migration's trigger forbids, and a soft-deleted audit row is a contradiction. The
    /// entry is written once and read forever.
    ///
    /// **It stores facts, never a sentence.** Same rule as a system message: the wording is
    /// built by the client from <see cref="Action"/> and <see cref="DetailJson"/>, so it is
    /// not frozen in the language - or the phrasing - of whoever happened to be an admin that
    /// day. Ids inside <see cref="DetailJson"/> are resolved to names at *read* time, because
    /// the person an entry is about is often precisely the person who has just stopped being
    /// resolvable from anywhere else.
    /// </summary>
    public class AuditEntry
    {
        [Key]
        public string Id { get; set; }

        /// <summary>
        /// The user id of whoever performed the action. Not a navigation property and not a
        /// foreign key: an audit row must outlive the account it names, and a cascade or a
        /// restrict would either erase history or block an offboarding.
        /// </summary>
        [Required]
        [MaxLength(450)]
        public string ActorId { get; set; }

        /// <summary>One of <see cref="AuditAction"/>.</summary>
        [Required]
        [MaxLength(30)]
        public string Action { get; set; }

        /// <summary>What kind of thing was acted on - "user", "invitation", "policy".</summary>
        [Required]
        [MaxLength(30)]
        public string TargetType { get; set; }

        /// <summary>
        /// The acted-on thing's id, or null where the action has no single target - a bulk
        /// change writes one entry per target rather than one entry with a list, so that a
        /// search for a person finds everything done to them.
        /// </summary>
        [MaxLength(450)]
        public string TargetId { get; set; }

        /// <summary>
        /// The facts, as a JSON object. Ids in here are resolved to names on the way out; see
        /// <c>SystemDataJson</c>, which does the same job for system messages and is reused
        /// verbatim.
        /// </summary>
        public string DetailJson { get; set; }

        /// <summary>
        /// When it happened, in UTC. The column is <c>timestamp with time zone</c> and Npgsql
        /// throws on a Local or Unspecified Kind, so this is <c>DateTime.UtcNow</c> and never
        /// <c>DateTime.Now</c>. Indexed descending: this table is only ever read newest-first.
        /// </summary>
        [DataType(DataType.DateTime)]
        public DateTime OccurredAtUtc { get; set; }
    }
}
