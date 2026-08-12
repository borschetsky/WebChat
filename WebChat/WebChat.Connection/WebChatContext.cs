using Microsoft.EntityFrameworkCore;
using WebChat.Models;

namespace WebChat.Connection
{
    public class WebChatContext : DbContext
    {
        public WebChatContext(DbContextOptions<WebChatContext> options) : base(options)
        {

        }

        public DbSet<User> User { get; set; }

        public DbSet<Message> Message {get; set;}

        public DbSet<Thread> Thread { get; set; }

        /// <summary>Thread membership. Read by thread authorization - see Validator.</summary>
        public DbSet<ThreadParticipant> ThreadParticipant { get; set; }

        /// <summary>
        /// The administrative audit log. Append-only, enforced by a trigger the migration
        /// installs rather than by convention - see <see cref="AuditEntry"/>. Never write to
        /// it directly; go through IAuditService, which records in the same transaction as
        /// the action being recorded.
        /// </summary>
        public DbSet<AuditEntry> AuditEntry { get; set; }

        /// <summary>Outstanding and historical workspace invitations - see <see cref="Invitation"/>.</summary>
        public DbSet<Invitation> Invitation { get; set; }

        protected override void OnModelCreating(ModelBuilder builder)
        {
            // Redemption looks an invitation up *by hash* - the token is never stored, so
            // there is nothing else to look it up by. Unique because two invitations sharing
            // a token hash would mean the RNG repeated, and failing loudly beats redeeming an
            // arbitrary one of them.
            builder.Entity<Invitation>()
                .HasIndex(i => i.TokenHash)
                .IsUnique();

            // The invitations screen reads outstanding ones newest-first, and the members
            // screen joins on the pending account.
            builder.Entity<Invitation>().HasIndex(i => i.Email);
            builder.Entity<Invitation>().HasIndex(i => i.PendingUserId);

            // The only way this table is ever read: newest first, keyset-paginated on the
            // timestamp. Descending because an ascending index would be scanned backwards for
            // every single query.
            builder.Entity<AuditEntry>()
                .HasIndex(e => e.OccurredAtUtc)
                .IsDescending();

            builder.Entity<Message>()
                .HasOne(m => m.Thread)
                .WithMany(t => t.Messages)
                .HasForeignKey(m => m.ThreadId)
                .OnDelete(DeleteBehavior.Restrict);

            builder.Entity<Message>()
                .HasOne(m => m.Sender)
                .WithMany(s => s.Messages)
                .HasForeignKey(m => m.SenderId)
                .OnDelete(DeleteBehavior.Restrict);



           



            //base.OnModelCreating(builder);
        }

    }
}
