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
    /// <see cref="UserService.GetUserNameById"/> against an id that is not there.
    ///
    /// It threw a <see cref="NullReferenceException"/> until #70 - `FirstOrDefault(...).Username`
    /// with nothing between the two. Nothing had caught it because every caller until then
    /// passed an id taken from a thread's current members or a message's sender, which is by
    /// construction a user that exists.
    ///
    /// The audit log is the first caller for which a missing user is *normal* rather than
    /// exceptional: an entry naming a deactivated or deleted account is exactly the entry
    /// worth keeping, and resolving names at read time is the whole reason the endpoint does
    /// this at all. One such row turned the entire audit endpoint into a 500 - not the row,
    /// the page.
    /// </summary>
    public class UserNameLookupTests : IDisposable
    {
        private readonly SqliteConnection connection = new("DataSource=:memory:");
        private readonly WebChatContext ctx;
        private readonly UserService users;

        public UserNameLookupTests()
        {
            this.connection.Open();
            this.ctx = new WebChatContext(new DbContextOptionsBuilder<WebChatContext>()
                .UseSqlite(this.connection).Options);
            this.ctx.Database.EnsureCreated();

            // A name lookup touches nothing but the context, but the constructor rejects a
            // null for any of its five dependencies - so these are real, cheap instances
            // rather than nulls or mocks.
            var mapping = new MappingService();
            this.users = new UserService(
                this.ctx,
                new AuthService("test-only-signing-key-at-least-32-bytes-long", 3600),
                new ThreadService(this.ctx, mapping),
                mapping,
                new ConnectionMapping<string>());
        }

        [Fact]
        public void An_unknown_id_resolves_to_null_rather_than_throwing()
        {
            Assert.Null(this.users.GetUserNameById("nobody"));
        }

        [Fact]
        public void A_known_id_still_resolves_to_the_username()
        {
            this.ctx.User.Add(new User
            {
                Id = "u1",
                Username = "maya",
                Email = "maya@example.com",
                Password = "x",
                Status = AccountStatus.Active,
                CreatedOn = DateTime.UtcNow,
            });
            this.ctx.SaveChanges();

            Assert.Equal("maya", this.users.GetUserNameById("u1"));
        }

        [Fact]
        public void An_unknown_name_resolves_to_null_rather_than_throwing()
        {
            Assert.Null(this.users.GetUserIdByName("nobody"));
        }

        public void Dispose()
        {
            this.ctx.Dispose();
            this.connection.Dispose();
            GC.SuppressFinalize(this);
        }
    }
}
