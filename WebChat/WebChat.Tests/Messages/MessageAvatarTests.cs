using System;
using System.Linq;
using Microsoft.EntityFrameworkCore;
using WebChat.Connection;
using WebChat.Models;
using WebChat.Services;
using Thread = WebChat.Models.Thread;

namespace WebChat.Tests.Messages;

/// <summary>
/// A message has to carry its sender's avatar, or the conversation pane cannot draw one.
///
/// The client has read `avatarFileName` off the message payload since the MUI redesign
/// (adapters.ts), but the server has never sent it - so every message row has always fallen
/// back to initials, while the same person's avatar rendered correctly in the thread list.
/// Nothing failed; the field was simply undefined every time.
///
/// Runs against real EF over SQLite rather than a mock, so the query under test is the query
/// that ships - the same choice ThreadAccessTests makes, and for the same reason: a
/// reimplemented query proves nothing about the real one.
/// </summary>
public class MessageAvatarTests : IDisposable
{
    private readonly Microsoft.Data.Sqlite.SqliteConnection connection;
    private readonly WebChatContext ctx;

    public MessageAvatarTests()
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

    private string AddUser(string name, string? avatarFileName)
    {
        var user = new User
        {
            Id = Guid.NewGuid().ToString(),
            Username = name,
            Email = name + "@example.com",
            Password = "hashed",
            AvatarFileName = avatarFileName,
            CreatedOn = DateTime.UtcNow,
            SecurityStamp = Guid.NewGuid().ToString(),
        };
        this.ctx.User.Add(user);
        this.ctx.SaveChanges();
        return user.Id;
    }

    private string AddThread(params string[] memberIds)
    {
        var thread = new Thread
        {
            Id = Guid.NewGuid().ToString(),
            OwnerId = memberIds[0],
            IsGroup = memberIds.Length > 2,
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

    private void AddMessage(string threadId, string senderId, string text)
    {
        this.ctx.Message.Add(new Message
        {
            Id = Guid.NewGuid().ToString(),
            ThreadId = threadId,
            SenderId = senderId,
            Text = text,
            CreatedOn = DateTime.UtcNow,
        });
        this.ctx.SaveChanges();
    }

    [Fact]
    public void A_loaded_message_carries_its_senders_avatar()
    {
        var alex = AddUser("alex", "alex-avatar.png");
        var sam = AddUser("sam", "sam-avatar.png");
        var threadId = AddThread(alex, sam);
        AddMessage(threadId, alex, "hello");

        var messages = new ThreadService(this.ctx, null).GetThreadMessages(threadId);

        var message = Assert.Single(messages);
        Assert.Equal("alex-avatar.png", message.AvatarFileName);
    }

    [Fact]
    public void Each_message_carries_its_own_senders_avatar_not_the_first_ones()
    {
        // The case a group makes routine: consecutive messages from different people.
        var alex = AddUser("alex", "alex-avatar.png");
        var sam = AddUser("sam", "sam-avatar.png");
        var kim = AddUser("kim", "kim-avatar.png");
        var threadId = AddThread(alex, sam, kim);

        AddMessage(threadId, alex, "first");
        AddMessage(threadId, sam, "second");
        AddMessage(threadId, kim, "third");

        var messages = new ThreadService(this.ctx, null).GetThreadMessages(threadId);

        Assert.Equal(
            new[] { "alex-avatar.png", "sam-avatar.png", "kim-avatar.png" },
            messages.Select(m => m.AvatarFileName));
    }

    [Fact]
    public void A_sender_with_no_avatar_yields_null_rather_than_a_placeholder()
    {
        // The client falls back to initials on null. Inventing a filename here would make it
        // request an image that does not exist on every render.
        var alex = AddUser("alex", null);
        var sam = AddUser("sam", "sam-avatar.png");
        var threadId = AddThread(alex, sam);
        AddMessage(threadId, alex, "hello");

        var messages = new ThreadService(this.ctx, null).GetThreadMessages(threadId);

        Assert.Null(Assert.Single(messages).AvatarFileName);
    }
}
