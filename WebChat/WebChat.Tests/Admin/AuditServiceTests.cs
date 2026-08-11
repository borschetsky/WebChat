using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using WebChat.Connection;
using WebChat.Models;
using WebChat.Services;

namespace WebChat.Tests.Admin
{
    /// <summary>
    /// The audit log's read and write paths.
    ///
    /// **What these cannot cover:** the append-only trigger is PL/pgSQL installed by the
    /// migration, and these run on SQLite, which has neither the language nor the migration
    /// applied. Nothing here proves an UPDATE is refused - only Postgres can, and only with
    /// the migration run. That gap is deliberate and recorded rather than papered over with a
    /// test that passes for the wrong reason.
    /// </summary>
    public class AuditServiceTests : IDisposable
    {
        private readonly SqliteConnection connection = new("DataSource=:memory:");
        private readonly WebChatContext ctx;
        private readonly AuditService audit;

        public AuditServiceTests()
        {
            this.connection.Open();
            this.ctx = new WebChatContext(new DbContextOptionsBuilder<WebChatContext>()
                .UseSqlite(this.connection).Options);
            this.ctx.Database.EnsureCreated();
            this.audit = new AuditService(this.ctx);
        }

        private void Write(string action, string targetId, DateTime at, object? detail = null)
        {
            this.audit.Record("actor", action, "user", targetId, detail);
            this.ctx.ChangeTracker.Entries<AuditEntry>()
                .Single(e => e.State == EntityState.Added).Entity.OccurredAtUtc = at;
            this.ctx.SaveChanges();
        }

        /// <summary>
        /// The reason <c>Record</c> does not save: the caller's own SaveChanges has to be
        /// what commits it, or an action and its record become independently failable.
        /// </summary>
        [Fact]
        public void Record_does_not_save()
        {
            this.audit.Record("actor", AuditAction.Block, "user", "target");

            Assert.Empty(this.ctx.AuditEntry.AsNoTracking().ToList());

            this.ctx.SaveChanges();

            Assert.Single(this.ctx.AuditEntry.AsNoTracking().ToList());
        }

        [Fact]
        public async Task Newest_first()
        {
            var now = DateTime.UtcNow;
            this.Write(AuditAction.Block, "a", now.AddMinutes(-10));
            this.Write(AuditAction.Invite, "b", now.AddMinutes(-1));
            this.Write(AuditAction.Role, "c", now.AddMinutes(-5));

            var page = await this.audit.RecentAsync(null, 10);

            Assert.Equal(new[] { "b", "c", "a" }, page.Select(e => e.TargetId));
        }

        /// <summary>
        /// Keyset, not offset. An offset query on a table that grows at the end being read
        /// re-shows rows: three new entries arrive between page one and page two, and page
        /// two starts three rows earlier than the reader expects.
        /// </summary>
        [Fact]
        public async Task A_cursor_excludes_the_row_it_names()
        {
            var now = DateTime.UtcNow;
            this.Write(AuditAction.Block, "a", now.AddMinutes(-10));
            this.Write(AuditAction.Invite, "b", now.AddMinutes(-1));
            this.Write(AuditAction.Role, "c", now.AddMinutes(-5));

            var first = await this.audit.RecentAsync(null, 2);
            var next = await this.audit.RecentAsync(first.Last().OccurredAtUtc, 2);

            Assert.Equal(new[] { "b", "c" }, first.Select(e => e.TargetId));
            Assert.Equal(new[] { "a" }, next.Select(e => e.TargetId));
        }

        [Fact]
        public async Task A_page_is_capped_however_much_is_asked_for()
        {
            var now = DateTime.UtcNow;
            for (var i = 0; i < 5; i++) this.Write(AuditAction.Login, $"u{i}", now.AddMinutes(-i));

            Assert.Equal(5, (await this.audit.RecentAsync(null, int.MaxValue)).Count);

            // A limit of zero is clamped up to one, not down to nothing: the clamp exists to
            // bound the page, and a caller asking for zero rows has a bug, not a request.
            Assert.Single(await this.audit.RecentAsync(null, 0));
        }

        /// <summary>
        /// The detail is stored as JSON facts, never a sentence - the client builds the
        /// wording. This checks the shape a reader has to parse, not the wording.
        /// </summary>
        [Fact]
        public async Task Detail_round_trips_as_json()
        {
            this.Write(AuditAction.Role, "target", DateTime.UtcNow,
                new { userId = "target", from = WorkspaceRole.Member, to = WorkspaceRole.Admin });

            var entry = Assert.Single(await this.audit.RecentAsync(null, 10));

            Assert.Contains("\"userId\":\"target\"", entry.DetailJson);
            Assert.Contains("\"to\":\"admin\"", entry.DetailJson);
        }

        [Fact]
        public async Task No_detail_stores_null_rather_than_an_empty_object()
        {
            this.Write(AuditAction.Login, "target", DateTime.UtcNow);

            var entry = Assert.Single(await this.audit.RecentAsync(null, 10));

            Assert.Null(entry.DetailJson);
        }

        public void Dispose()
        {
            this.ctx.Dispose();
            this.connection.Dispose();
            GC.SuppressFinalize(this);
        }
    }
}
