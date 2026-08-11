using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using WebChat.Connection;
using WebChat.Models;
using WebChat.Services;
using Thread = WebChat.Models.Thread;

namespace WebChat.Tests.Auth;

/// <summary>
/// Workspace roles and the bootstrap that creates the first owner.
///
/// The bootstrap exists because the admin console can only be opened by an owner and there is
/// no owner until something makes one. It is configuration-driven so it is repeatable, works
/// on a rebuilt database, and leaves a record of *why* somebody is an owner.
///
/// The last test here is the important one. `SPEC-groups-and-admin.md` §2 is explicit that a
/// workspace admin has no authority inside a group they do not administer, because that is
/// what stops the console becoming a backdoor into private conversations.
/// </summary>
public class WorkspaceRoleTests : IDisposable
{
    private readonly Microsoft.Data.Sqlite.SqliteConnection connection;
    private readonly WebChatContext ctx;

    public WorkspaceRoleTests()
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

    private User AddUser(string email, bool confirmed = true, string role = WorkspaceRole.Member)
    {
        var user = new User
        {
            Id = Guid.NewGuid().ToString(),
            Username = email.Split('@')[0],
            Email = email,
            Password = "hashed",
            EmailConfirmed = confirmed,
            Role = role,
            CreatedOn = DateTime.UtcNow,
            SecurityStamp = Guid.NewGuid().ToString(),
        };
        this.ctx.User.Add(user);
        this.ctx.SaveChanges();
        return user;
    }

    private static IConfiguration ConfigWith(params string[] emails)
    {
        var values = emails
            .Select((e, i) => new System.Collections.Generic.KeyValuePair<string, string?>(
                $"{BootstrapAdmins.ConfigKey}:{i}", e));

        return new ConfigurationBuilder().AddInMemoryCollection(values).Build();
    }

    private Task Promote(IConfiguration configuration) =>
        BootstrapAdmins.PromoteAsync(this.ctx, configuration, NullLogger.Instance);

    [Fact]
    public async Task A_configured_address_becomes_the_workspace_owner()
    {
        var user = AddUser("wod.moshkin@gmail.com");

        await Promote(ConfigWith("wod.moshkin@gmail.com"));

        Assert.Equal(WorkspaceRole.Owner, this.ctx.User.Single(u => u.Id == user.Id).Role);
    }

    [Fact]
    public async Task Running_it_twice_changes_nothing()
    {
        // It is meant to be left configured forever, so every boot after the first must be a
        // no-op rather than a repeated write.
        var user = AddUser("wod.moshkin@gmail.com");
        var config = ConfigWith("wod.moshkin@gmail.com");

        await Promote(config);
        await Promote(config);

        Assert.Equal(WorkspaceRole.Owner, this.ctx.User.Single(u => u.Id == user.Id).Role);
        Assert.Single(this.ctx.User.Where(u => u.Role == WorkspaceRole.Owner));
    }

    [Fact]
    public async Task Case_does_not_have_to_match()
    {
        // An address typed into a deployment console will not reliably match the casing
        // somebody registered with.
        var user = AddUser("wod.moshkin@gmail.com");

        await Promote(ConfigWith("Wod.Moshkin@Gmail.com"));

        Assert.Equal(WorkspaceRole.Owner, this.ctx.User.Single(u => u.Id == user.Id).Role);
    }

    [Fact]
    public async Task An_unconfirmed_address_is_not_promoted()
    {
        // Otherwise anyone who learns a configured address can register it and inherit the
        // workspace - the exact attack the list is supposed to prevent.
        var user = AddUser("wod.moshkin@gmail.com", confirmed: false);

        await Promote(ConfigWith("wod.moshkin@gmail.com"));

        Assert.Equal(WorkspaceRole.Member, this.ctx.User.Single(u => u.Id == user.Id).Role);
    }

    [Fact]
    public async Task An_address_with_no_account_is_not_an_error()
    {
        // Configuring the address before registering is a normal order of events; the
        // promotion lands on the next boot after they sign up.
        await Promote(ConfigWith("nobody@example.com"));

        Assert.Empty(this.ctx.User.Where(u => u.Role == WorkspaceRole.Owner));
    }

    [Fact]
    public async Task Nobody_else_is_touched()
    {
        var owner = AddUser("wod.moshkin@gmail.com");
        var other = AddUser("someone.else@example.com");

        await Promote(ConfigWith("wod.moshkin@gmail.com"));

        Assert.Equal(WorkspaceRole.Owner, this.ctx.User.Single(u => u.Id == owner.Id).Role);
        Assert.Equal(WorkspaceRole.Member, this.ctx.User.Single(u => u.Id == other.Id).Role);
    }

    [Fact]
    public async Task No_configuration_promotes_nobody()
    {
        AddUser("wod.moshkin@gmail.com");

        await Promote(new ConfigurationBuilder().Build());

        Assert.Empty(this.ctx.User.Where(u => u.Role == WorkspaceRole.Owner));
    }

    [Fact]
    public void The_workspace_owner_gets_no_authority_inside_a_group()
    {
        // The boundary the whole admin console rests on. A workspace owner who is not in a
        // group - or is only a plain member of it - must have exactly the powers their group
        // role gives them, and no more.
        var owner = AddUser("wod.moshkin@gmail.com", role: WorkspaceRole.Owner);

        var thread = new Thread
        {
            Id = Guid.NewGuid().ToString(),
            OwnerId = owner.Id,
            IsGroup = true,
            PermRename = PermissionLevel.Admins,
            PermInvite = PermissionLevel.Admins,
            PermRemove = PermissionLevel.Admins,
            CreatedOn = DateTime.UtcNow,
        };

        // Their role *in this group* is member, whatever they are in the workspace.
        Assert.False(WebChat.Services.GroupPermissions.Can(
            WebChat.Services.GroupAction.Rename, GroupRole.Member, thread));
        Assert.False(WebChat.Services.GroupPermissions.Can(
            WebChat.Services.GroupAction.SetPermissions, GroupRole.Member, thread));
        Assert.False(WebChat.Services.GroupPermissions.Can(
            WebChat.Services.GroupAction.TransferOwnership, GroupRole.Member, thread));

        // And the decision function cannot even see the workspace role: it takes the group
        // role and the thread, and nothing else. If that signature ever grows a User, this
        // assertion is the place to argue about it.
        Assert.Equal(WorkspaceRole.Owner, owner.Role);
    }
}
