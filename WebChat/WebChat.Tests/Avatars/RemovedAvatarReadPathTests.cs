using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using WebChat.Connection;
using WebChat.Controllers;
using WebChat.Hubs;
using WebChat.Hubs.ConnectionMapper;
using WebChat.Models;
using WebChat.Services;
using WebChat.Services.Helpers;
using Thread = WebChat.Models.Thread;

namespace WebChat.Tests.Avatars;

/// <summary>
/// **Every** place a user's avatar reaches a client, against a user whose photo is removed
/// (#89).
///
/// This file exists because of the shape of the change rather than the size of it. A removal
/// is a marker: <c>AvatarFileName</c> is still populated, still points at an object that is
/// still in the bucket, and every projection that reads the column keeps serving the photo.
/// There are seven such projections, and **a removal honoured by six of them is worse than one
/// honoured by none** - the photo would vanish from the settings drawer, which is the one
/// place the person who removed it looks, and stay on every message they ever sent, which is
/// the place everybody else looks. Nothing would error and nothing would log.
///
/// So each test here names its read path and the screen it feeds. They are reproductions, not
/// guards: run against the column instead of the rule and every one of them fails.
///
/// Real EF over SQLite throughout, the same choice <c>MessageAvatarTests</c> makes - a
/// reimplemented query proves nothing about the one that ships, and these *are* queries.
/// </summary>
public class RemovedAvatarReadPathTests : IDisposable
{
    private readonly SqliteConnection connection = new("DataSource=:memory:");
    private readonly WebChatContext ctx;
    private readonly MappingService mapping = new();
    private readonly UserService users;
    private readonly ConnectionMapping<string> connections = new();

    public RemovedAvatarReadPathTests()
    {
        this.connection.Open();
        this.ctx = new WebChatContext(new DbContextOptionsBuilder<WebChatContext>()
            .UseSqlite(this.connection).Options);
        this.ctx.Database.EnsureCreated();

        this.users = new UserService(
            this.ctx,
            new AuthService("test-only-signing-key-at-least-32-bytes-long", 3600),
            new ThreadService(this.ctx, this.mapping),
            this.mapping,
            this.connections);
    }

    public void Dispose()
    {
        this.ctx.Dispose();
        this.connection.Dispose();
        GC.SuppressFinalize(this);
    }

    /// <summary>
    /// A user whose photo is removed **and whose columns still hold it**, which is the whole
    /// point: the fixture is the post-condition of a removal, so any read that goes to the
    /// column gets a perfectly good file name back.
    /// </summary>
    private User AddRemoved(string name = "maya")
    {
        var user = new User
        {
            Id = Guid.NewGuid().ToString(),
            Username = name,
            Email = $"{Guid.NewGuid():N}@example.com",
            Password = "hashed",
            Status = AccountStatus.Active,
            CreatedOn = DateTime.UtcNow,
            EmailConfirmed = true,
            SecurityStamp = Guid.NewGuid().ToString(),
            AvatarFileName = "removed-face.jpg",
            AvatarOriginalFileName = "originals/removed-source.jpg",
            AvatarCropX = 10,
            AvatarCropY = 20,
            AvatarCropWidth = 50,
            AvatarCropHeight = 50,
            AvatarRemovedAt = DateTime.UtcNow,
        };

        this.ctx.User.Add(user);
        this.ctx.SaveChanges();
        return user;
    }

    private User AddWithPhoto(string name, string avatar)
    {
        var user = new User
        {
            Id = Guid.NewGuid().ToString(),
            Username = name,
            Email = $"{Guid.NewGuid():N}@example.com",
            Password = "hashed",
            Status = AccountStatus.Active,
            CreatedOn = DateTime.UtcNow,
            EmailConfirmed = true,
            SecurityStamp = Guid.NewGuid().ToString(),
            AvatarFileName = avatar,
        };

        this.ctx.User.Add(user);
        this.ctx.SaveChanges();
        return user;
    }

    private string AddThread(bool group, params string[] memberIds)
    {
        var thread = new Thread
        {
            Id = Guid.NewGuid().ToString(),
            OwnerId = memberIds[0],
            IsGroup = group,
            CreatedOn = DateTime.UtcNow,
        };
        this.ctx.Thread.Add(thread);

        for (var i = 0; i < memberIds.Length; i++)
        {
            this.ctx.ThreadParticipant.Add(new ThreadParticipant
            {
                Id = Guid.NewGuid().ToString(),
                ThreadId = thread.Id,
                UserId = memberIds[i],
                GRole = i == 0 ? GroupRole.Owner : GroupRole.Member,
                CreatedOn = DateTime.UtcNow,
            });
        }

        this.ctx.SaveChanges();
        return thread.Id;
    }

    // ------------------------------------------------------------------ the owner's own view

    /// <summary>
    /// `GET /users/getprofile` - the settings drawer, and the only screen the person who
    /// pressed Remove is looking at when they press it.
    /// </summary>
    [Fact]
    public void The_owners_own_profile_reports_no_photo()
    {
        var user = this.AddRemoved();

        var profile = this.users.GetUserProfile(user.Id);

        Assert.Null(profile.AvatarFileName);
    }

    /// <summary>
    /// All three hide together. "There is no photo, but there is an original you can adjust the
    /// crop of" is not a state the drawer can draw: it would offer a menu item that re-crops a
    /// photo the user has just been told they do not have - and that item would quietly
    /// un-remove it.
    /// </summary>
    [Fact]
    public void The_owners_own_profile_offers_no_crop_to_adjust_either()
    {
        var user = this.AddRemoved();

        var profile = this.users.GetUserProfile(user.Id);

        Assert.False(profile.HasOriginalPhoto);
        Assert.Null(profile.AvatarCrop);
    }

    /// <summary>
    /// The private key must not leak on the way past, and it is worth asserting on the
    /// serialized payload rather than on a property: a removal is the one moment when the row
    /// holds a key the response is deliberately not describing.
    /// </summary>
    [Fact]
    public void A_removed_profile_payload_names_neither_object()
    {
        var user = this.AddRemoved();

        var json = Newtonsoft.Json.JsonConvert.SerializeObject(this.users.GetUserProfile(user.Id));

        Assert.DoesNotContain("removed-face", json);
        Assert.DoesNotContain("originals/", json);
    }

    // ------------------------------------------------------------------ everybody else's view

    /// <summary>
    /// `GET hey/getthreads` - the thread list and the conversation header, via
    /// <c>GetOponentProfile</c>. This is the one that would have kept the removed face in front
    /// of every person the user has ever talked to.
    /// </summary>
    [Fact]
    public void A_thread_list_entry_draws_no_photo_for_them()
    {
        var user = this.AddRemoved();

        var opponent = this.users.GetOponentProfile(user.Id);

        Assert.Null(opponent.AvatarFileName);
    }

    /// <summary>`GET users/search` - the compose dialog's directory rows.</summary>
    [Fact]
    public void A_directory_search_result_draws_no_photo_for_them()
    {
        var searcher = this.AddWithPhoto("searcher", "searcher.jpg");
        this.AddRemoved("maya");

        var found = this.users.FindUserByMatch("maya", searcher.Id).Single();

        Assert.Null(found.AvatarFileName);
    }

    /// <summary>
    /// `GET thread/getmessages` - every message row in an open conversation. History is where a
    /// removed photo is most persistent: the rows are old, nothing invalidates them, and the
    /// avatar is joined in fresh on every read.
    /// </summary>
    [Fact]
    public void Their_messages_carry_no_photo()
    {
        var user = this.AddRemoved();
        var other = this.AddWithPhoto("sam", "sam.jpg");
        var threadId = this.AddThread(false, user.Id, other.Id);

        this.ctx.Message.Add(new Message
        {
            Id = Guid.NewGuid().ToString(),
            ThreadId = threadId,
            SenderId = user.Id,
            Text = "written while they still had a photo",
            CreatedOn = DateTime.UtcNow,
        });
        this.ctx.SaveChanges();

        var messages = new ThreadService(this.ctx, this.mapping).GetThreadMessages(threadId);

        Assert.Null(Assert.Single(messages).AvatarFileName);
    }

    /// <summary>
    /// `POST hey/send` - the response the sender's own optimistic row and every recipient's
    /// live row are built from. A separate lookup from the one above, so it needs its own test:
    /// fixing the history query and not this one would put the removed face back on the very
    /// next message they send.
    /// </summary>
    [Fact]
    public async Task A_message_they_send_now_carries_no_photo()
    {
        var user = this.AddRemoved();
        var other = this.AddWithPhoto("sam", "sam.jpg");
        var threadId = this.AddThread(false, user.Id, other.Id);

        var messages = new MessageService(this.ctx, this.users, this.mapping);

        var sent = await messages.AddMessage(new Models.ViewModels.MessageViewModel
        {
            Id = Guid.NewGuid().ToString(),
            SenderId = user.Id,
            ThreadId = threadId,
            Text = "sent after removing",
        });

        Assert.Null(sent.AvatarFileName);
    }

    /// <summary>
    /// `GET /api/conversations/{id}` - the member list in the group info drawer. Reached
    /// through the controller because the projection lives there, in an anonymous object, and
    /// asserting on the serialized body is the only way to be sure the field went out empty
    /// rather than merely being absent from a shape nobody checked.
    /// </summary>
    [Fact]
    public void A_group_member_row_draws_no_photo_for_them()
    {
        var user = this.AddRemoved();
        var other = this.AddWithPhoto("sam", "sam.jpg");
        var groupId = this.AddThread(true, other.Id, user.Id);

        var controller = new ConversationsController(
            new GroupService(this.ctx),
            this.users,
            new FakeHubContext<ChatHub>(),
            this.connections)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity(
                        new[] { new Claim(ClaimTypes.Name, other.Id) }, "test")),
                },
            },
        };

        var ok = Assert.IsType<OkObjectResult>(controller.Get(groupId));
        var json = Newtonsoft.Json.JsonConvert.SerializeObject(ok.Value);

        Assert.DoesNotContain("removed-face", json);
        Assert.Contains("sam.jpg", json);
    }

    /// <summary>
    /// `GET /api/admin/members` - the workspace member list.
    ///
    /// Clearing somebody else's photo is deliberately **not** in #89; this is only about the
    /// console not showing one its owner has removed, which it would, because it reads the same
    /// column as everything else.
    /// </summary>
    [Fact]
    public async Task The_admin_member_list_draws_no_photo_for_them()
    {
        var user = this.AddRemoved("maya");
        this.AddWithPhoto("sam", "sam.jpg");

        var service = new MemberAdminService(
            this.ctx,
            new AuditService(this.ctx),
            new ConnectionAborter(),
            this.connections);

        var members = await service.ListAsync();

        Assert.Null(members.Single(m => m.Id == user.Id).AvatarFileName);
        Assert.Equal("sam.jpg", members.Single(m => m.Name == "sam").AvatarFileName);
    }

    // ------------------------------------------------------------------ the control

    /// <summary>
    /// The other half of every assertion above, so none of them can be satisfied by a read path
    /// that has simply stopped sending avatars. Same fixture, no marker.
    /// </summary>
    [Fact]
    public void A_user_who_has_not_removed_anything_still_has_their_photo_everywhere()
    {
        var user = this.AddRemoved();
        user.AvatarRemovedAt = null;
        this.ctx.SaveChanges();

        Assert.Equal("removed-face.jpg", this.users.GetUserProfile(user.Id).AvatarFileName);
        Assert.True(this.users.GetUserProfile(user.Id).HasOriginalPhoto);
        Assert.NotNull(this.users.GetUserProfile(user.Id).AvatarCrop);
        Assert.Equal("removed-face.jpg", this.users.GetOponentProfile(user.Id).AvatarFileName);
    }
}
