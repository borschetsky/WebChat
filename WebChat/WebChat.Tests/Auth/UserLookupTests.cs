using System;
using System.Linq;
using Microsoft.EntityFrameworkCore;
using WebChat.Connection;
using WebChat.Models;
using WebChat.Services;
using Xunit;

namespace WebChat.Tests.Auth
{
    /// <summary>
    /// Pins how a user is found at sign-in.
    ///
    /// These run against SQLite in-memory rather than the EF in-memory provider, because the
    /// latter is not a relational database and silently accepts translations that PostgreSQL
    /// would reject. It is still not Postgres - notably its comparison semantics differ - so
    /// anything relying on server-side collation is asserted through the service's own
    /// behaviour rather than by trusting the provider.
    /// </summary>
    public class UserLookupTests : IDisposable
    {
        private readonly Microsoft.Data.Sqlite.SqliteConnection connection;
        private readonly WebChatContext ctx;

        public UserLookupTests()
        {
            this.connection = new Microsoft.Data.Sqlite.SqliteConnection("DataSource=:memory:");
            this.connection.Open();

            var options = new DbContextOptionsBuilder<WebChatContext>()
                .UseSqlite(this.connection)
                .Options;

            this.ctx = new WebChatContext(options);
            this.ctx.Database.EnsureCreated();
        }

        public void Dispose()
        {
            this.ctx.Dispose();
            this.connection.Dispose();
            GC.SuppressFinalize(this);
        }

        private User Add(string username, string email)
        {
            var user = new User
            {
                Id = Guid.NewGuid().ToString(),
                Username = username,
                Email = email,
                Password = "hashed",
                CreatedOn = DateTime.UtcNow,
                EmailConfirmed = true,
            };
            this.ctx.User.Add(user);
            this.ctx.SaveChanges();
            return user;
        }

        [Fact]
        public void Finds_a_user_by_exact_email()
        {
            var expected = Add("alex", "alex@example.com");

            var found = UserQueries.ByEmailOrUsername(this.ctx.User, "alex@example.com");

            Assert.Equal(expected.Id, found?.Id);
        }

        [Theory]
        [InlineData("ALEX@EXAMPLE.COM")]
        [InlineData("Alex@Example.Com")]
        [InlineData("alex@EXAMPLE.com")]
        public void Finds_a_user_by_email_whatever_the_case(string typed)
        {
            // The bug this replaces: `u.Email == email` against PostgreSQL is case-sensitive,
            // so anyone who capitalised their address in a password manager could not sign in.
            var expected = Add("alex", "alex@example.com");

            var found = UserQueries.ByEmailOrUsername(this.ctx.User, typed);

            Assert.Equal(expected.Id, found?.Id);
        }

        [Theory]
        [InlineData("alex")]
        [InlineData("ALEX")]
        [InlineData("Alex")]
        public void Finds_a_user_by_username_whatever_the_case(string typed)
        {
            var expected = Add("alex", "alex@example.com");

            var found = UserQueries.ByEmailOrUsername(this.ctx.User, typed);

            Assert.Equal(expected.Id, found?.Id);
        }

        [Fact]
        public void Prefers_the_email_owner_when_a_username_looks_like_an_address()
        {
            // Nothing stops someone registering the username "bob@example.com". If an address
            // is typed, it must resolve to whoever owns that mailbox - not to whoever claimed
            // it as a display name.
            var mailboxOwner = Add("realbob", "bob@example.com");
            Add("bob@example.com", "impostor@example.com");

            var found = UserQueries.ByEmailOrUsername(this.ctx.User, "bob@example.com");

            Assert.Equal(mailboxOwner.Id, found?.Id);
        }

        [Theory]
        [InlineData("")]
        [InlineData("   ")]
        [InlineData("nobody@example.com")]
        [InlineData("nobody")]
        public void Returns_null_rather_than_throwing_for_anything_unknown(string typed)
        {
            Add("alex", "alex@example.com");

            // Sign-in input is attacker-controlled; a throw is a 500 on a public endpoint.
            Assert.Null(UserQueries.ByEmailOrUsername(this.ctx.User, typed));
        }

        [Fact]
        public void Returns_null_for_a_null_identifier()
        {
            Add("alex", "alex@example.com");

            Assert.Null(UserQueries.ByEmailOrUsername(this.ctx.User, null));
        }
    }

}
