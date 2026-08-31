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

        /// <summary>
        /// The workspace's configuration - exactly one row, keyed by
        /// <see cref="WorkspaceSettings.SingletonId"/>. Read through
        /// <c>IWorkspacePolicyService</c>, which caches it; querying this directly on a
        /// request path is what the cache exists to avoid.
        /// </summary>
        public DbSet<WorkspaceSettings> WorkspaceSettings { get; set; }

        /// <summary>
        /// One row per client-error fingerprint - the thing an administrator triages. Written
        /// only by the background drain loop; see <c>IClientErrorQueue</c>.
        /// </summary>
        public DbSet<ClientErrorIssue> ClientErrorIssue { get; set; }

        /// <summary>
        /// One row per occurrence, feeding the sparkline, the user count and the browser list.
        /// **The only unbounded table in the app**, and therefore the one retention prunes
        /// hardest - see <c>ClientErrorRetentionService</c>.
        /// </summary>
        public DbSet<ClientErrorEvent> ClientErrorEvent { get; set; }

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

            // jsonb rather than text so the column can be queried and indexed later without a
            // type change. Nothing queries inside it today - the whole blob is read at once -
            // but the migration cost of being wrong about that is asymmetric.
            builder.Entity<WorkspaceSettings>()
                .Property(s => s.PoliciesJson)
                .HasColumnType("jsonb");

            // The fingerprint *is* the identity of an issue - the upsert looks it up by this
            // and by nothing else. Unique, so two instances racing the same first occurrence
            // collide loudly instead of quietly creating two rows for one problem.
            builder.Entity<ClientErrorIssue>()
                .HasIndex(i => i.Fingerprint)
                .IsUnique();

            // The list is only ever read newest-activity-first, and descending for the same
            // reason as the audit log's: an ascending index would be scanned backwards every
            // time.
            builder.Entity<ClientErrorIssue>()
                .HasIndex(i => i.LastSeenUtc)
                .IsDescending();

            // Cascade, unlike every other relationship here. An occurrence has no meaning
            // without its issue, and retention deletes issues wholesale - a restrict would
            // make the pruner delete in two ordered passes to achieve the same end.
            builder.Entity<ClientErrorEvent>()
                .HasOne(e => e.Issue)
                .WithMany()
                .HasForeignKey(e => e.IssueId)
                .OnDelete(DeleteBehavior.Cascade);

            // Composite, in the order the query filters: every read of this table is "these
            // issues, within the last fortnight".
            builder.Entity<ClientErrorEvent>()
                .HasIndex(e => new { e.IssueId, e.OccurredAtUtc });

            // And this one is for the pruner, which sweeps by age across every issue.
            builder.Entity<ClientErrorEvent>()
                .HasIndex(e => e.OccurredAtUtc);

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
