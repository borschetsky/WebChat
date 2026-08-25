using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json;
using WebChat.Connection;
using WebChat.Controllers;
using WebChat.Hubs;
using WebChat.Hubs.ConnectionMapper;
using WebChat.Models;
using WebChat.Models.ViewModels;
using WebChat.Services;
using WebChat.Services.Helpers;
using WebChat.Tests.Avatars;

namespace WebChat.Tests.Users;

/// <summary>
/// What <c>POST api/users/update</c> puts on the wire when it tells everyone a profile
/// changed (#94).
///
/// The broadcast used to be the **request body** - a whole <see cref="ProfileViewModel"/>,
/// carrying <c>Email</c> and <c>Role</c> - sent to <c>Clients.All</c>. Two defects in one
/// line, and they need separate tests because either fix alone leaves the other live:
///
/// 1. **Over-disclosure.** Every connected client learnt that user's email address and
///    workspace role, whether or not they shared a conversation with them.
/// 2. **Echoing the request.** The object sent was the one that came *in*, so any field the
///    server does not persist - the avatar key, the role, the crop - was still relayed to
///    everyone exactly as the caller wrote it.
///
/// A real <see cref="UserService"/> over SQLite, because the whole claim is "projected from
/// the row that was written", and only a real row can prove that. The hub is a fake whose
/// <c>Clients.All</c> records what it was handed; <c>SendAsync</c> is an extension method, so
/// the recorded member is <c>SendCoreAsync</c> and the payload is <c>Args[0]</c>.
/// </summary>
public class ProfileBroadcastTests : IDisposable
{
    private readonly SqliteConnection connection = new("DataSource=:memory:");
    private readonly WebChatContext ctx;
    private readonly UserService users;
    private readonly FakeHubContext<ChatHub> hub = new();

    public ProfileBroadcastTests()
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

    public void Dispose()
    {
        this.ctx.Dispose();
        this.connection.Dispose();
        GC.SuppressFinalize(this);
    }

    private User AddUser(Action<User>? tweak = null)
    {
        var user = new User
        {
            Id = Guid.NewGuid().ToString(),
            Username = "maya",
            Email = "maya@example.com",
            Password = "hashed",
            Role = WorkspaceRole.Owner,
            Status = AccountStatus.Active,
            CreatedOn = DateTime.UtcNow,
            EmailConfirmed = true,
        };

        tweak?.Invoke(user);

        this.ctx.User.Add(user);
        this.ctx.SaveChanges();

        return user;
    }

    private UsersController ControllerFor(string userId)
    {
        var http = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity(
                new[] { new Claim(ClaimTypes.Name, userId) },
                "test")),
        };

        return new UsersController(this.users, this.hub)
        {
            ControllerContext = new ControllerContext { HttpContext = http },
        };
    }

    /// <summary>
    /// Saves a profile and hands back the one thing the hub was asked to send.
    /// </summary>
    private async Task<object> Broadcast(ProfileViewModel model, string callerId)
    {
        await this.ControllerFor(callerId).UpdateProfile(model);

        var send = Assert.Single(this.hub.Sends);

        // The client's handler is registered under this exact (misspelt) name; renaming it
        // server-side would silently stop every open tab from re-rendering.
        Assert.Equal("ReviceUpdatedOpponentProfile", send.Method);

        var payload = Assert.Single(send.Args);
        Assert.NotNull(payload);

        return payload;
    }

    private static object? Property(object? payload, string name) =>
        payload?.GetType().GetProperty(name)?.GetValue(payload);

    /// <summary>
    /// The leak itself: an email address and a workspace role reaching every connected
    /// client because the request body was forwarded verbatim.
    ///
    /// Asserted twice on purpose. The reflection check pins the payload's *shape* - a type
    /// with no such property cannot leak by accident - and the serialized check is what
    /// catches a future nested object that carries the address one level down, where a
    /// property-name check sees nothing.
    /// </summary>
    [Fact]
    public async Task Saving_a_profile_broadcasts_neither_the_email_nor_the_role()
    {
        var user = this.AddUser();

        var payload = await this.Broadcast(
            new ProfileViewModel
            {
                Id = user.Id,
                Username = "maya",
                Email = user.Email,
                Role = WorkspaceRole.Owner,
            },
            user.Id);

        Assert.Null(payload.GetType().GetProperty("Email"));
        Assert.Null(payload.GetType().GetProperty("Role"));

        var json = JsonConvert.SerializeObject(payload);
        Assert.DoesNotContain("maya@example.com", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("owner", json, StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// The second defect, which survives the first fix if it is not tested separately: the
    /// payload has to be projected from the row, so a field the server never persists cannot
    /// be dictated by the caller.
    ///
    /// <c>AvatarFileName</c> is the sharp case - <c>UpdateProfile</c> writes only the username
    /// and the email, so an avatar key in the body is pure caller input, and relaying it told
    /// every client to draw whatever image the caller named.
    /// </summary>
    [Fact]
    public async Task The_broadcast_carries_the_persisted_avatar_not_the_one_in_the_request()
    {
        var user = this.AddUser(u => u.AvatarFileName = "persisted.jpg");

        var payload = await this.Broadcast(
            new ProfileViewModel
            {
                Id = user.Id,
                Username = "maya",
                Email = user.Email,
                AvatarFileName = "chosen-by-the-caller.png",
            },
            user.Id);

        Assert.Equal("persisted.jpg", Property(payload, "AvatarFileName"));
    }

    /// <summary>
    /// A removed photo (#89) stays removed when its owner saves their profile.
    ///
    /// The removal is a marker, not a delete: <c>AvatarFileName</c> is still populated, which
    /// is exactly why a new projection that reads the column raw would put the photo back on
    /// every other client's thread list the next time this user changed their name. The rule
    /// lives in <c>AvatarVisibility</c>; this is the test that says this projection asks it.
    /// </summary>
    [Fact]
    public async Task A_removed_photo_is_not_resurrected_by_saving_a_profile()
    {
        var user = this.AddUser(u =>
        {
            u.AvatarFileName = "retained.jpg";
            u.AvatarRemovedAt = DateTime.UtcNow;
        });

        var payload = await this.Broadcast(
            new ProfileViewModel
            {
                Id = user.Id,
                Username = "maya",
                Email = user.Email,
                AvatarFileName = "retained.jpg",
            },
            user.Id);

        Assert.Null(Property(payload, "AvatarFileName"));
    }

    /// <summary>
    /// A guard, not a reproduction: the old code passed this by accident, since the request
    /// body it echoed happened to hold the same username that was about to be written. It is
    /// here because the fields the clients legitimately need must survive the shrinking - the
    /// handler patches the thread list's title from <c>username</c>, so dropping it would show
    /// up as "Unknown" in every conversation.
    /// </summary>
    [Fact]
    public async Task The_broadcast_carries_the_id_and_the_newly_saved_username()
    {
        var user = this.AddUser();

        var payload = await this.Broadcast(
            new ProfileViewModel
            {
                Id = user.Id,
                Username = "maya-renamed",
                Email = user.Email,
            },
            user.Id);

        Assert.Equal(user.Id, Property(payload, "Id"));
        Assert.Equal("maya-renamed", Property(payload, "Username"));
        Assert.Equal("maya-renamed", this.ctx.User.Single(u => u.Id == user.Id).Username);
    }

    /// <summary>
    /// #99, and it is a different defect from #94 in the same method: #94 is about what the
    /// **broadcast** carries, this is about who gets **written**.
    ///
    /// <c>UpdateProfile</c> read <c>User.Identity.Name</c> into a local and then never used it,
    /// keying the write on the caller-supplied <c>model.Id</c> instead. Any authenticated user
    /// could therefore rewrite any other account's username and email.
    ///
    /// That is account takeover rather than vandalism, because password reset sends to the
    /// **stored** address (<c>AuthController</c> does <c>emailSender.SendAsync(user.Email, …)</c>
    /// after <c>GetUserByEmail</c>): rewrite the address, request a reset, receive the link. The
    /// victim simultaneously loses the ability to reset, since their own address no longer
    /// matches any row.
    ///
    /// Reproduced against the running stack before this was written - `attacker` posted
    /// `victim`'s id and got HTTP 200 with the row rewritten.
    /// </summary>
    [Fact]
    public async Task A_caller_cannot_rewrite_another_account_by_posting_its_id()
    {
        var victim = this.AddUser(u =>
        {
            u.Username = "victim";
            u.Email = "victim@example.com";
        });

        var attacker = this.AddUser(u =>
        {
            u.Username = "attacker";
            u.Email = "attacker@example.com";
        });

        await this.ControllerFor(attacker.Id).UpdateProfile(new ProfileViewModel
        {
            Id = victim.Id,
            Username = "victim",
            Email = "pwned@evil.example",
        });

        var victimRow = this.ctx.User.Single(u => u.Id == victim.Id);

        // The victim's row is the whole point: untouched, address intact.
        Assert.Equal("victim@example.com", victimRow.Email);
        Assert.Equal("victim", victimRow.Username);
    }

    /// <summary>
    /// The other half of the same fix. Ignoring <c>model.Id</c> must mean the caller's own row
    /// is written - not that the write is silently dropped, which would pass the test above
    /// while breaking the feature.
    /// </summary>
    [Fact]
    public async Task A_caller_editing_their_own_profile_still_writes_their_own_row()
    {
        var attacker = this.AddUser(u =>
        {
            u.Username = "attacker";
            u.Email = "attacker@example.com";
        });

        // Note the mismatched Id: a client that sends someone else's id, or none at all, still
        // edits itself. The token is the only thing that decides which row is written.
        await this.ControllerFor(attacker.Id).UpdateProfile(new ProfileViewModel
        {
            Id = "not-a-real-id",
            Username = "attacker-renamed",
            Email = "attacker-new@example.com",
        });

        var row = this.ctx.User.Single(u => u.Id == attacker.Id);

        Assert.Equal("attacker-renamed", row.Username);
        Assert.Equal("attacker-new@example.com", row.Email);
    }
}
