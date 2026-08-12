using System;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using WebChat.Connection;
using WebChat.Hubs.ConnectionMapper;
using WebChat.Models;
using WebChat.Services;
using WebChat.Services.Helpers;

namespace WebChat.Tests.Auth
{
    /// <summary>
    /// That registration names an account's status and role explicitly.
    ///
    /// **This test exists because of #63.** There, a migration added a column, backfilled
    /// every existing row, and everything looked right - while the write path went on
    /// leaving the column to its default, so every *new* group was created ownerless. The
    /// backfill is what disguised it: the data was correct everywhere anyone thought to look.
    ///
    /// So `User.Status` deliberately has no property initializer. If it had one, this test
    /// would pass whether or not `CreateUser` had ever been touched, and it would be testing
    /// the initializer rather than the write path - which is precisely the reassurance that
    /// failed last time.
    /// </summary>
    public class RegistrationStatusTests : IDisposable
    {
        private readonly SqliteConnection connection = new("DataSource=:memory:");
        private readonly WebChatContext ctx;
        private readonly UserService users;

        public RegistrationStatusTests()
        {
            this.connection.Open();
            this.ctx = new WebChatContext(new DbContextOptionsBuilder<WebChatContext>()
                .UseSqlite(this.connection).Options);
            this.ctx.Database.EnsureCreated();

            var mapping = new MappingService();
            this.users = new UserService(
                this.ctx,
                new AuthService("test-only-signing-key-at-least-32-bytes-long", 3600),
                new ThreadService(this.ctx, mapping),
                mapping,
                new ConnectionMapping<string>());
        }

        [Fact]
        public void A_new_account_is_active()
        {
            var created = this.users.CreateUser("maya", "maya@example.com", "Passw0rd!23");

            Assert.Equal(AccountStatus.Active, created.Status);
        }

        /// <summary>
        /// Nobody registers into a privileged role; promotion is a separate, deliberate act
        /// (`BootstrapAdmins`, or an owner using the console).
        /// </summary>
        [Fact]
        public void A_new_account_is_a_plain_member()
        {
            var created = this.users.CreateUser("maya", "maya@example.com", "Passw0rd!23");

            Assert.Equal(WorkspaceRole.Member, created.Role);
        }

        /// <summary>
        /// The status must survive the round trip, not just the constructor - a `[Required]`
        /// column with nothing assigned would fail at insert, which is the loud failure this
        /// design wants instead of a quiet default.
        /// </summary>
        [Fact]
        public void The_status_is_persisted()
        {
            var created = this.users.CreateUser("maya", "maya@example.com", "Passw0rd!23");
            this.ctx.User.Add(created);
            this.ctx.SaveChanges();

            var loaded = this.ctx.User.AsNoTracking().Single(u => u.Id == created.Id);

            Assert.Equal(AccountStatus.Active, loaded.Status);
        }

        public void Dispose()
        {
            this.ctx.Dispose();
            this.connection.Dispose();
            GC.SuppressFinalize(this);
        }
    }
}
