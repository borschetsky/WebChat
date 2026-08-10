using System.ComponentModel.DataAnnotations.Schema;
using WebChat.Models.Abstractions;

namespace WebChat.Models
{
    /// <summary>
    /// Membership of a thread. Replaces the pair of columns - Thread.OwnerId and
    /// Thread.OponentId - that limited a conversation to exactly two people.
    ///
    /// This is the table thread authorization reads: <c>Validator</c> asks whether a row
    /// exists for (thread, user), so a missing row is a refusal. That makes it a security
    /// boundary rather than a convenience, and the reason the backfill in its migration is
    /// not optional - a thread with no participant rows is a thread nobody can open.
    /// </summary>
    public class ThreadParticipant : BaseEntity
    {
        [ForeignKey("ThreadId")]
        public string ThreadId { get; set; }

        public Thread Thread { get; set; }

        [ForeignKey("UserId")]
        public string UserId { get; set; }

        public User User { get; set; }

        /// <summary>
        /// This member's role in this conversation - see <see cref="GroupRole"/>.
        ///
        /// On the membership row, so the same person can own one group and merely belong to
        /// another. Meaningless for a direct thread, where both participants are equals; it is
        /// left at Member there rather than given a fourth value nothing reads.
        /// </summary>
        public string GRole { get; set; } = GroupRole.Member;
    }
}
