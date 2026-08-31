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
/// The database-level half of #100: the two unique indexes
/// <c>20260831163827_AddUserUniqueIndexes</c> creates.
///
/// The service check in <see cref="ProfileUniquenessTests"/> is what a user meets; this is
/// what is left when a code path forgets to ask - a second instance racing the same rename, a
/// future endpoint, a script. Neither replaces the other.
///
/// **Read the provider caveat before trusting these.** The suite runs on SQLite, and the
/// schema comes from <c>EnsureCreated</c>, which builds from the EF model and therefore knows
/// nothing about a functional index EF cannot express - so each test applies
/// <see cref="UserUniqueIndexes"/> itself, executing the same strings the migration does.
/// SQLite accepts that DDL and its <c>lower()</c> agrees with PostgreSQL's over ASCII, which
/// is all these fixtures use; what SQLite cannot exercise is the migration's PL/pgSQL
/// preflight, which is checked by hand against a real PostgreSQL instead.
/// </summary>
public class UserUniqueIndexTests : IDisposable
{
    private readonly SqliteConnection connection = new("DataSource=:memory:");
    private readonly WebChatContext ctx;

    public UserUniqueIndexTests()
    {
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

    /// <summary><paramref name="username"/> is nullable because the column is - see
    /// <see cref="Accounts_with_no_username_do_not_collide"/>.</summary>
    private void Insert(string id, string? username, string email)
    {
        this.ctx.User.Add(new User
        {
            Id = id,
            Username = username,
            Email = email,
            Password = "hashed",
            Role = WorkspaceRole.Member,
            Status = AccountStatus.Active,
            CreatedOn = DateTime.UtcNow,
            EmailConfirmed = true,
        });

        this.ctx.SaveChanges();
    }

    /// <summary>
    /// **The migration's hard case, and the one least likely to be tested**: the index is
    /// added to a table that already violates it.
    ///
    /// It has to fail. The alternative - repairing the data automatically - would pick one of
    /// two real people and rename them, which is not a decision a migration takes unattended.
    /// The migration therefore refuses *before* trying this, so the operator gets a list of
    /// the offending accounts instead of the first duplicate key; that refusal is PL/pgSQL and
    /// is verified against a real PostgreSQL, not here.
    /// </summary>
    [Fact]
    public void Applying_the_indexes_to_a_table_that_already_has_duplicates_fails()
    {
        this.Insert("1", "victim94", "victim94@example.com");
        this.Insert("2", "victim94", "pwned-by-attacker@evil.example");

        Assert.ThrowsAny<Exception>(() => UserUniqueIndexes.ApplyTo(this.ctx));
    }

    /// <summary>A clean table takes both indexes.</summary>
    [Fact]
    public void Applying_the_indexes_to_a_table_with_no_duplicates_succeeds()
    {
        this.Insert("1", "victim94", "victim94@example.com");
        this.Insert("2", "attacker94", "attacker94@example.com");

        UserUniqueIndexes.ApplyTo(this.ctx);
    }

    /// <summary>
    /// The index is on <c>lower()</c>, so it refuses what the lookups already treat as one
    /// identifier. A plain unique index would accept this row - and then <c>victim94</c> and
    /// <c>Victim94</c> would be one person to sign-in and two in the members list.
    /// </summary>
    [Fact]
    public void A_username_differing_only_in_case_is_refused_by_the_database()
    {
        this.Insert("1", "victim94", "victim94@example.com");
        UserUniqueIndexes.ApplyTo(this.ctx);

        Assert.ThrowsAny<Exception>(() => this.Insert("2", "ViCtIm94", "someone@example.com"));
    }

    /// <inheritdoc cref="A_username_differing_only_in_case_is_refused_by_the_database"/>
    [Fact]
    public void An_email_differing_only_in_case_is_refused_by_the_database()
    {
        this.Insert("1", "victim94", "victim94@example.com");
        UserUniqueIndexes.ApplyTo(this.ctx);

        Assert.ThrowsAny<Exception>(() => this.Insert("2", "someone", "VICTIM94@Example.COM"));
    }

    /// <summary>
    /// Two rows with no username at all are fine, in both engines: a unique index treats NULLs
    /// as distinct. Registration refuses an empty username, so the only nulls are rows written
    /// before it did - and an index that collapsed them would make this migration fail on
    /// legacy data for a reason nobody intended.
    /// </summary>
    [Fact]
    public void Accounts_with_no_username_do_not_collide()
    {
        UserUniqueIndexes.ApplyTo(this.ctx);

        this.Insert("1", null, "one@example.com");
        this.Insert("2", null, "two@example.com");

        Assert.Equal(2, this.ctx.User.Count());
    }

    /// <summary>
    /// The two halves agree, which is the property that decides what a user sees: with the
    /// index in place, a rename into a taken name is still refused by the service check, so it
    /// is a 400 naming the field - not a database exception surfacing as a 500.
    ///
    /// This is the test that would fail if the index were ever made stricter than
    /// <c>UserQueries</c>, or the check looser than the index.
    /// </summary>
    [Fact]
    public async Task With_the_indexes_applied_a_taken_username_is_still_a_400()
    {
        this.Insert("1", "victim94", "victim94@example.com");
        this.Insert("2", "attacker94", "attacker94@example.com");
        UserUniqueIndexes.ApplyTo(this.ctx);

        var mapping = new MappingService();
        var users = new UserService(
            this.ctx,
            new AuthService("test-only-signing-key-at-least-32-bytes-long", 3600),
            new ThreadService(this.ctx, mapping),
            mapping,
            new ConnectionMapping<string>());

        var http = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity(
                new[] { new Claim(ClaimTypes.Name, "2") },
                "test")),
        };

        var controller = new UsersController(users, new FakeHubContext<ChatHub>())
        {
            ControllerContext = new ControllerContext { HttpContext = http },
        };

        var result = await controller.UpdateProfile(new ProfileViewModel
        {
            Id = "2",
            Username = "ViCtIm94",
            Email = "attacker94@example.com",
        });

        var bad = Assert.IsType<BadRequestObjectResult>(result);
        Assert.Equal(UniquenessProblem.UsernameTaken(), bad.Value);
    }
}
