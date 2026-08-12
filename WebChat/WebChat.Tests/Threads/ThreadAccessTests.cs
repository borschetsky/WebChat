using System;
using Thread = WebChat.Models.Thread;
using System.Linq;
using Microsoft.EntityFrameworkCore;
using WebChat.Connection;
using WebChat.Models;
using WebChat.Services;
using Xunit;

namespace WebChat.Tests.Threads
{
    /// <summary>
    /// Thread authorization. This is the only thing standing between a user and someone
    /// else's messages, so it gets tested before anything else in the group work.
    ///
    /// The rule it replaces was `thread.OwnerId == userId || thread.OponentId == userId`,
    /// which was both limited to two people and prone to a NullReferenceException for an
    /// unknown thread id - a 500 on an authorization check, from a value the caller supplies.
    /// </summary>
    public class ThreadAccessTests : IDisposable
    {
        private readonly Microsoft.Data.Sqlite.SqliteConnection connection;
        private readonly WebChatContext ctx;

        public ThreadAccessTests()
        {
            this.connection = new Microsoft.Data.Sqlite.SqliteConnection("DataSource=:memory:");
            this.connection.Open();
            this.ctx = new WebChatContext(new DbContextOptionsBuilder<WebChatContext>()
                .UseSqlite(this.connection).Options);
            this.ctx.Database.EnsureCreated();
        }

        public void Dispose()
        {
            this.ctx.Dispose();
            this.connection.Dispose();
            GC.SuppressFinalize(this);
        }

        private string AddUser(string name)
        {
            var user = new User
            {
                Id = Guid.NewGuid().ToString(),
                Username = name,
                Email = name + "@example.com",
                Password = "hashed",
                Status = AccountStatus.Active,
                CreatedOn = DateTime.UtcNow,
                SecurityStamp = Guid.NewGuid().ToString(),
            };
            this.ctx.User.Add(user);
            this.ctx.SaveChanges();
            return user.Id;
        }

        private string AddThread(bool isGroup, params string[] memberIds)
        {
            var thread = new Thread
            {
                Id = Guid.NewGuid().ToString(),
                OwnerId = memberIds[0],
                IsGroup = isGroup,
                Name = isGroup ? "a group" : null,
                CreatedOn = DateTime.UtcNow,
            };
            this.ctx.Thread.Add(thread);

            foreach (var id in memberIds)
            {
                this.ctx.ThreadParticipant.Add(new ThreadParticipant
                {
                    Id = Guid.NewGuid().ToString(),
                    ThreadId = thread.Id,
                    UserId = id,
                    CreatedOn = DateTime.UtcNow,
                });
            }

            this.ctx.SaveChanges();
            return thread.Id;
        }

        [Fact]
        public void A_direct_thread_admits_both_of_its_participants()
        {
            var alex = AddUser("alex");
            var sam = AddUser("sam");
            var threadId = AddThread(false, alex, sam);

            Assert.True(ThreadQueries.IsParticipant(this.ctx.ThreadParticipant, threadId, alex));
            Assert.True(ThreadQueries.IsParticipant(this.ctx.ThreadParticipant, threadId, sam));
        }

        [Fact]
        public void A_direct_thread_refuses_everyone_else()
        {
            // The whole point. If this ever passes the wrong way, one user reads another's
            // conversation.
            var alex = AddUser("alex");
            var sam = AddUser("sam");
            var stranger = AddUser("stranger");
            var threadId = AddThread(false, alex, sam);

            Assert.False(ThreadQueries.IsParticipant(this.ctx.ThreadParticipant, threadId, stranger));
        }

        [Fact]
        public void A_group_admits_every_member_and_refuses_a_non_member()
        {
            var alex = AddUser("alex");
            var sam = AddUser("sam");
            var jo = AddUser("jo");
            var stranger = AddUser("stranger");
            var threadId = AddThread(true, alex, sam, jo);

            Assert.True(ThreadQueries.IsParticipant(this.ctx.ThreadParticipant, threadId, alex));
            Assert.True(ThreadQueries.IsParticipant(this.ctx.ThreadParticipant, threadId, sam));
            Assert.True(ThreadQueries.IsParticipant(this.ctx.ThreadParticipant, threadId, jo));
            Assert.False(ThreadQueries.IsParticipant(this.ctx.ThreadParticipant, threadId, stranger));
        }

        [Fact]
        public void Membership_of_one_thread_grants_nothing_in_another()
        {
            // Two threads, one shared member. Being in the first must not open the second.
            var alex = AddUser("alex");
            var sam = AddUser("sam");
            var jo = AddUser("jo");
            var theirs = AddThread(false, sam, jo);
            AddThread(false, alex, sam);

            Assert.False(ThreadQueries.IsParticipant(this.ctx.ThreadParticipant, theirs, alex));
        }

        [Theory]
        [InlineData("")]
        [InlineData("   ")]
        [InlineData("not-a-thread-id")]
        public void An_unknown_thread_is_refused_rather_than_throwing(string threadId)
        {
            // The previous implementation did `thread.OwnerId` on a null thread, so a made-up
            // id in the URL was a 500 from the authorization check itself.
            var alex = AddUser("alex");
            AddThread(false, alex, AddUser("sam"));

            Assert.False(ThreadQueries.IsParticipant(this.ctx.ThreadParticipant, threadId, alex));
        }

        [Fact]
        public void A_null_thread_id_is_refused()
        {
            var alex = AddUser("alex");

            Assert.False(ThreadQueries.IsParticipant(this.ctx.ThreadParticipant, null, alex));
        }

        [Fact]
        public void A_null_user_is_refused()
        {
            // An unauthenticated caller must not match a row whose UserId happens to be null.
            var alex = AddUser("alex");
            var threadId = AddThread(false, alex, AddUser("sam"));

            Assert.False(ThreadQueries.IsParticipant(this.ctx.ThreadParticipant, threadId, null));
        }

        [Fact]
        public void Participants_of_a_thread_are_listed_for_message_delivery()
        {
            // SignalR has to reach every member, not just "the other one".
            var alex = AddUser("alex");
            var sam = AddUser("sam");
            var jo = AddUser("jo");
            var threadId = AddThread(true, alex, sam, jo);

            var ids = ThreadQueries.ParticipantIds(this.ctx.ThreadParticipant, threadId);

            Assert.Equal(3, ids.Count);
            Assert.Contains(alex, ids);
            Assert.Contains(sam, ids);
            Assert.Contains(jo, ids);
        }

        [Fact]
        public void Participants_of_an_unknown_thread_is_empty_not_a_throw()
        {
            Assert.Empty(ThreadQueries.ParticipantIds(this.ctx.ThreadParticipant, "nope"));
        }
    }
}
