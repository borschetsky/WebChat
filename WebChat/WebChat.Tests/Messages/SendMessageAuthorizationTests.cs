using System;
using System.Linq;
using System.Net;
using System.Net.Http.Json;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using WebChat.Connection;
using WebChat.Models;
using WebChat.Tests.Admin;
using Xunit;

namespace WebChat.Tests.Messages
{
    /// <summary>
    /// Who a message is from, and where it may be sent, are decided by the token - never by the
    /// request body.
    ///
    /// <c>POST api/hey/send</c> used to hand its body to <c>MessageService.AddMessage</c> as it
    /// came, so the stored row's <c>SenderId</c> was whatever the caller wrote in it; only the
    /// response and the hub echo were then corrected to the caller's id. And nothing asked
    /// whether the caller was in the thread at all. Together: any signed-in user could put a
    /// message into any conversation, permanently attributed to anyone - the same class as the
    /// profile takeover in #99, which CLAUDE.md states as "an id in a request body never decides
    /// which row is written".
    ///
    /// Through the real host, because the defect lives in the controller's use of its model,
    /// and asserted on the stored row because the response was already correct - a test of the
    /// response would have passed against the bug.
    /// </summary>
    public class SendMessageAuthorizationTests : IClassFixture<AdminApiFactory>
    {
        private readonly AdminApiFactory factory;

        public SendMessageAuthorizationTests(AdminApiFactory factory) => this.factory = factory;

        private string AddThread(params string[] memberIds)
        {
            using var scope = this.factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<WebChatContext>();

            var thread = new Models.Thread
            {
                Id = Guid.NewGuid().ToString(),
                OwnerId = memberIds[0],
                CreatedOn = DateTime.UtcNow,
            };
            db.Thread.Add(thread);
            foreach (var id in memberIds)
            {
                db.ThreadParticipant.Add(new ThreadParticipant
                {
                    Id = Guid.NewGuid().ToString(),
                    ThreadId = thread.Id,
                    UserId = id,
                    CreatedOn = DateTime.UtcNow,
                });
            }
            db.SaveChanges();
            return thread.Id;
        }

        private Message[] MessagesIn(string threadId)
        {
            using var scope = this.factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<WebChatContext>();
            return db.Message.Where(m => m.ThreadId == threadId).ToArray();
        }

        [Fact]
        public async Task The_stored_sender_is_the_caller_whatever_the_body_says()
        {
            var alice = this.factory.ClientFor(WorkspaceRole.Member, out var aliceId);
            this.factory.ClientFor(WorkspaceRole.Member, out var bobId);
            var threadId = this.AddThread(aliceId, bobId);

            var response = await alice.PostAsJsonAsync("/api/hey/send", new
            {
                senderId = bobId,
                threadId,
                text = "written by alice, claiming to be bob",
            });

            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
            var stored = Assert.Single(this.MessagesIn(threadId));
            Assert.Equal(aliceId, stored.SenderId);
        }

        [Fact]
        public async Task A_body_without_a_sender_is_accepted_because_the_token_names_one()
        {
            var alice = this.factory.ClientFor(WorkspaceRole.Member, out var aliceId);
            this.factory.ClientFor(WorkspaceRole.Member, out var bobId);
            var threadId = this.AddThread(aliceId, bobId);

            var response = await alice.PostAsJsonAsync("/api/hey/send", new { threadId, text = "hi" });

            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
            Assert.Equal(aliceId, Assert.Single(this.MessagesIn(threadId)).SenderId);
        }

        [Fact]
        public async Task Someone_outside_the_thread_cannot_post_into_it()
        {
            this.factory.ClientFor(WorkspaceRole.Member, out var aliceId);
            this.factory.ClientFor(WorkspaceRole.Member, out var bobId);
            var mallory = this.factory.ClientFor(WorkspaceRole.Member, out var malloryId);
            var threadId = this.AddThread(aliceId, bobId);

            // Her own id as sender, so nothing else about the request is wrong: the only thing
            // that may refuse it is that she is not in the thread.
            var response = await mallory.PostAsJsonAsync(
                "/api/hey/send", new { senderId = malloryId, threadId, text = "intruding" });

            // 404, not 403: answering differently for "no such thread" and "a thread you are
            // not in" would make this endpoint an oracle for which thread ids exist - the same
            // reasoning ChatHub.BroadcastTyping gives for its silent return.
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
            Assert.Empty(this.MessagesIn(threadId));
        }
    }
}
