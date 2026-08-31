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
using WebChat.Models.ViewModels;
using WebChat.Services;
using WebChat.Services.Helpers;
using WebChat.Tests.Avatars;

namespace WebChat.Tests.Users;

/// <summary>
/// #100 - <c>POST api/users/update</c> enforcing the uniqueness of a username and an email
/// address, which register has always enforced and update never did.
///
/// The rule held at the front door and nowhere else: you could not *register* as an existing
/// username, but you could *rename yourself into* one. Found while verifying #99's fix - the
/// request that correctly stopped touching the victim's row went on to rename the attacker's
/// own row to <c>victim94</c>, leaving two rows with one username.
///
/// Why it matters is not cosmetic. A username is what people recognise each other by in every
/// list the app draws, and a duplicated *email* is worse: <c>UserQueries.ByEmail</c> takes the
/// first match, and password reset resolves an account by address, so two rows sharing one
/// address makes "who gets the reset link" a question about row order.
///
/// A real <see cref="UserService"/> over SQLite and the real controller, because the claim
/// under test is about rows - a mocked service could only prove that a method was called.
/// </summary>
public class ProfileUniquenessTests : IDisposable
{
    private readonly SqliteConnection connection = new("DataSource=:memory:");
    private readonly WebChatContext ctx;
    private readonly UserService users;
    private readonly FakeHubContext<ChatHub> hub = new();

    public ProfileUniquenessTests()
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

    private User AddUser(string username, string email)
    {
        var user = new User
        {
            Id = Guid.NewGuid().ToString(),
            Username = username,
            Email = email,
            Password = "hashed",
            Role = WorkspaceRole.Member,
            Status = AccountStatus.Active,
            CreatedOn = DateTime.UtcNow,
            EmailConfirmed = true,
        };

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

    private Task<ActionResult> Save(string callerId, string username, string email) =>
        this.ControllerFor(callerId).UpdateProfile(new ProfileViewModel
        {
            // Deliberately the caller's own id, so nothing here is also re-testing #99. The
            // defect under test is reachable by a completely honest client.
            Id = callerId,
            Username = username,
            Email = email,
        });

    private User Row(string id) => this.ctx.User.AsNoTracking().Single(u => u.Id == id);

    // ---------------------------------------------------------------------------------
    // Reproductions. Each of these failed before the fix existed.
    // ---------------------------------------------------------------------------------

    /// <summary>
    /// The reported scenario, exactly: rename yourself into somebody else's username.
    ///
    /// Before the fix this returned 200 and the database held two rows called
    /// <c>victim94</c>.
    /// </summary>
    [Fact]
    public async Task Renaming_into_an_existing_username_is_refused()
    {
        var victim = this.AddUser("victim94", "victim94@example.com");
        var attacker = this.AddUser("attacker94", "attacker94@example.com");

        var result = await this.Save(attacker.Id, "victim94", "attacker94@example.com");

        var bad = Assert.IsType<BadRequestObjectResult>(result);

        // The register-era body, by construction rather than by a copied literal - both
        // endpoints build it from the same factory.
        Assert.Equal(UniquenessProblem.UsernameTaken(), bad.Value);

        Assert.Equal("attacker94", this.Row(attacker.Id).Username);
        Assert.Equal("victim94", this.Row(victim.Id).Username);
    }

    /// <summary>
    /// The worse half: give yourself somebody else's address. <c>GetUserByEmail</c> takes the
    /// first match, so a second row on one address makes password reset resolve by row order.
    /// </summary>
    [Fact]
    public async Task Taking_an_existing_email_address_is_refused()
    {
        var victim = this.AddUser("victim94", "victim94@example.com");
        var attacker = this.AddUser("attacker94", "attacker94@example.com");

        var result = await this.Save(attacker.Id, "attacker94", "victim94@example.com");

        var bad = Assert.IsType<BadRequestObjectResult>(result);
        Assert.Equal(UniquenessProblem.EmailTaken(), bad.Value);

        Assert.Equal("attacker94@example.com", this.Row(attacker.Id).Email);
        Assert.Equal("victim94@example.com", this.Row(victim.Id).Email);
    }

    /// <summary>
    /// Case-insensitively, because that is what every lookup already does.
    ///
    /// <c>UserQueries</c> compares on <c>lower()</c> - sign-in, reset and register all do -
    /// so a check that compared exactly would leave the hole open through a different door,
    /// and <c>Victim94</c> reads as the same person as <c>victim94</c> in a member list.
    /// </summary>
    [Fact]
    public async Task Renaming_into_a_case_variant_of_an_existing_username_is_refused()
    {
        this.AddUser("victim94", "victim94@example.com");
        var attacker = this.AddUser("attacker94", "attacker94@example.com");

        var result = await this.Save(attacker.Id, "ViCtIm94", "attacker94@example.com");

        Assert.IsType<BadRequestObjectResult>(result);
        Assert.Equal("attacker94", this.Row(attacker.Id).Username);
    }

    /// <inheritdoc cref="Renaming_into_a_case_variant_of_an_existing_username_is_refused"/>
    [Fact]
    public async Task Taking_a_case_variant_of_an_existing_email_is_refused()
    {
        this.AddUser("victim94", "victim94@example.com");
        var attacker = this.AddUser("attacker94", "attacker94@example.com");

        var result = await this.Save(attacker.Id, "attacker94", "Victim94@Example.COM");

        Assert.IsType<BadRequestObjectResult>(result);
        Assert.Equal("attacker94@example.com", this.Row(attacker.Id).Email);
    }

    /// <summary>
    /// A refused save must not tell every connected client that a profile changed. It did
    /// before the fix, because there was nothing to refuse - the write always happened.
    /// </summary>
    [Fact]
    public async Task A_refused_save_broadcasts_nothing()
    {
        this.AddUser("victim94", "victim94@example.com");
        var attacker = this.AddUser("attacker94", "attacker94@example.com");

        await this.Save(attacker.Id, "victim94", "attacker94@example.com");

        Assert.Empty(this.hub.Sends);
    }

    // ---------------------------------------------------------------------------------
    // Guards. These pass against the unfixed code; they are here because the obvious
    // wrong fix breaks them.
    // ---------------------------------------------------------------------------------

    /// <summary>
    /// **The trap the issue names.** A uniqueness check that does not exclude the caller's own
    /// row makes saving an unchanged profile fail - the user collides with themselves - which
    /// turns a security fix into a broken settings drawer.
    /// </summary>
    [Fact]
    public async Task Saving_an_unchanged_profile_still_succeeds()
    {
        var user = this.AddUser("maya", "maya@example.com");

        var result = await this.Save(user.Id, "maya", "maya@example.com");

        Assert.IsType<OkResult>(result);
        Assert.Single(this.hub.Sends);
        Assert.Equal("maya", this.Row(user.Id).Username);
    }

    /// <summary>
    /// The same trap through the case fold: changing only the capitalisation of your own name
    /// collides with your own row under a naive check, and is exactly the edit somebody makes
    /// the first time they notice their name is lower-cased.
    /// </summary>
    [Fact]
    public async Task Recapitalising_your_own_username_still_succeeds()
    {
        var user = this.AddUser("maya", "maya@example.com");

        var result = await this.Save(user.Id, "Maya", "Maya@example.com");

        Assert.IsType<OkResult>(result);

        var row = this.Row(user.Id);
        Assert.Equal("Maya", row.Username);
        Assert.Equal("Maya@example.com", row.Email);
    }

    /// <summary>
    /// The feature still works: a name nobody holds is written.
    /// </summary>
    [Fact]
    public async Task Renaming_to_an_unused_username_still_succeeds()
    {
        this.AddUser("victim94", "victim94@example.com");
        var user = this.AddUser("maya", "maya@example.com");

        var result = await this.Save(user.Id, "maya-renamed", "maya-renamed@example.com");

        Assert.IsType<OkResult>(result);

        var row = this.Row(user.Id);
        Assert.Equal("maya-renamed", row.Username);
        Assert.Equal("maya-renamed@example.com", row.Email);
    }

    /// <summary>
    /// Email is checked before username, matching register's order, so a request that
    /// collides on both names the address. Not arbitrary: the address is the identifier that
    /// carries the reset link, and it is the one the user must fix first.
    /// </summary>
    [Fact]
    public async Task A_request_colliding_on_both_reports_the_email()
    {
        this.AddUser("victim94", "victim94@example.com");
        var attacker = this.AddUser("attacker94", "attacker94@example.com");

        var result = await this.Save(attacker.Id, "victim94", "victim94@example.com");

        var bad = Assert.IsType<BadRequestObjectResult>(result);
        Assert.Equal(UniquenessProblem.EmailTaken(), bad.Value);
    }
}
