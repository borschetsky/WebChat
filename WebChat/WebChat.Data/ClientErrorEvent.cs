using System;
using System.ComponentModel.DataAnnotations;

namespace WebChat.Models
{
    /// <summary>
    /// One occurrence of a <see cref="ClientErrorIssue"/>.
    ///
    /// **This table exists for three answers the issue row cannot give**: the 14-day
    /// sparkline, how many distinct people hit it, and which browsers. All three need the
    /// occurrences kept separately, and all three are the reason the row is as narrow as it
    /// is - the stack, the message and the breadcrumbs live on the issue, where one copy is
    /// enough.
    ///
    /// **It is the growth risk in the whole feature**, against a 512 MB database shared with
    /// all application data, so it is the table retention prunes hardest: events age out well
    /// before issues do. See <c>ClientErrorOptions</c>. A pruned window is why
    /// <see cref="ClientErrorIssue.Events"/> is a counter rather than a <c>COUNT(*)</c> here.
    ///
    /// Deliberately not a <see cref="Abstractions.BaseEntity"/> - a soft-deleted occurrence is
    /// a contradiction, and the three extra columns would be dead weight on the one table here
    /// that is written per event.
    /// </summary>
    public class ClientErrorEvent
    {
        [Key]
        public string Id { get; set; }

        /// <summary>
        /// The issue this occurrence belongs to. A real foreign key with a cascade delete, so
        /// removing an issue cannot leave orphaned events behind - unlike
        /// <c>AuditEntry.ActorId</c>, which must outlive the account it names, an event has no
        /// meaning at all without its issue.
        /// </summary>
        [Required]
        public string IssueId { get; set; }

        public ClientErrorIssue Issue { get; set; }

        /// <summary>UTC. See <see cref="ClientErrorIssue.FirstSeenUtc"/>.</summary>
        [DataType(DataType.DateTime)]
        public DateTime OccurredAtUtc { get; set; }

        /// <summary>
        /// Who hit it, taken from the token and never from the request body. Not a navigation
        /// property and not a foreign key, for the same reason as <c>AuditEntry.ActorId</c>:
        /// deactivating an account must not delete or block the record of what they saw.
        /// </summary>
        [MaxLength(450)]
        public string UserId { get; set; }

        /// <summary>
        /// "Chrome 141" - name and major version only, parsed from the User-Agent server-side.
        /// The full header is not stored: it is a fingerprinting surface, and the browser
        /// column on the screen shows a name and a number.
        /// </summary>
        [MaxLength(60)]
        public string Browser { get; set; }
    }
}
