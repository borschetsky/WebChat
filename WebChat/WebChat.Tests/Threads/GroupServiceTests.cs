using System;
using System.Linq;
using Microsoft.EntityFrameworkCore;
using WebChat.Connection;
using WebChat.Models;
using WebChat.Services;
using Thread = WebChat.Models.Thread;

namespace WebChat.Tests.Threads;

/// <summary>
/// The five mutations from `SPEC-group-wire-contract.md` §1, against real EF over SQLite.
///
/// The invariant these exist for is the spec's own phrasing: *"a group must never be
/// observable with zero or two owners."* Everything else here - the version compare-and-swap,
/// the idempotent add, leave-versus-remove - is in service of a group that cannot be wedged
/// into a state the UI has no way out of.
/// </summary>
public class GroupServiceTests : IDisposable
{
    private readonly Microsoft.Data.Sqlite.SqliteConnection connection;
    private readonly WebChatContext ctx;
    private readonly GroupService service;

    public GroupServiceTests()
    {
        this.connection = new Microsoft.Data.Sqlite.SqliteConnection("DataSource=:memory:");
        this.connection.Open();
        this.ctx = new WebChatContext(new DbContextOptionsBuilder<WebChatContext>()
            .UseSqlite(this.connection).Options);
        this.ctx.Database.EnsureCreated();
        this.service = new GroupService(this.ctx);
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
            CreatedOn = DateTime.UtcNow,
            SecurityStamp = Guid.NewGuid().ToString(),
        };
        this.ctx.User.Add(user);
        this.ctx.SaveChanges();
        return user.Id;
    }

    /// <summary>A group whose first id is the owner and the rest are members.</summary>
    private string AddGroup(params string[] memberIds)
    {
        var thread = new Thread
        {
            Id = Guid.NewGuid().ToString(),
            OwnerId = memberIds[0],
            IsGroup = true,
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

    private string RoleOf(string groupId, string userId) =>
        this.ctx.ThreadParticipant.Single(p => p.ThreadId == groupId && p.UserId == userId).GRole;

    private int OwnerCount(string groupId) =>
        this.ctx.ThreadParticipant.Count(p => p.ThreadId == groupId && p.GRole == GroupRole.Owner);

    // --- rename -------------------------------------------------------------------------

    [Fact]
    public void Renaming_stores_the_name_marks_it_named_and_bumps_the_version()
    {
        var owner = AddUser("owner");
        var group = AddGroup(owner, AddUser("sam"));

        var result = this.service.Rename(group, owner, "Design Guild", ifMatch: 0);

        Assert.True(result.Ok);
        Assert.Equal("Design Guild", result.Thread.Name);
        Assert.True(result.Thread.Named);
        Assert.Equal(1, result.Thread.Version);
        Assert.Equal(SystemKind.Rename, result.SystemMessage.SystemKind);
    }

    [Fact]
    public void Renaming_to_null_reverts_to_auto_naming()
    {
        var owner = AddUser("owner");
        var group = AddGroup(owner, AddUser("sam"));
        this.service.Rename(group, owner, "Design Guild", 0);

        var result = this.service.Rename(group, owner, null, 1);

        Assert.True(result.Ok);
        Assert.Null(result.Thread.Name);
        Assert.False(result.Thread.Named);
    }

    [Fact]
    public void Renaming_to_the_same_name_is_a_no_op_with_no_system_message()
    {
        // People double-submit, and "renamed to the same thing" is not an event anyone wants
        // in the history - nor a version bump that invalidates everyone's token.
        var owner = AddUser("owner");
        var group = AddGroup(owner, AddUser("sam"));
        this.service.Rename(group, owner, "Design Guild", 0);

        var again = this.service.Rename(group, owner, "Design Guild", 1);

        Assert.True(again.Ok);
        Assert.Null(again.SystemMessage);
        Assert.Equal(1, again.Thread.Version);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void An_empty_name_is_refused(string name)
    {
        var owner = AddUser("owner");
        var group = AddGroup(owner, AddUser("sam"));

        Assert.Equal(GroupError.NameInvalid, this.service.Rename(group, owner, name, 0).Error);
    }

    [Fact]
    public void A_member_cannot_rename_under_the_default_map()
    {
        var owner = AddUser("owner");
        var sam = AddUser("sam");
        var group = AddGroup(owner, sam);

        var result = this.service.Rename(group, sam, "Nope", 0);

        Assert.Equal(GroupError.PermissionDenied, result.Error);
        Assert.Equal(0, this.ctx.Thread.Single(t => t.Id == group).Version);
    }

    [Fact]
    public void A_stale_version_is_refused_and_carries_the_current_group()
    {
        var owner = AddUser("owner");
        var group = AddGroup(owner, AddUser("sam"));
        this.service.Rename(group, owner, "First", 0);

        // Someone else already moved it to version 1; this client still thinks it is 0.
        var result = this.service.Rename(group, owner, "Second", 0);

        Assert.Equal(GroupError.VersionConflict, result.Error);
        Assert.NotNull(result.Thread);
        Assert.Equal("First", result.Thread.Name);
    }

    // --- members ------------------------------------------------------------------------

    [Fact]
    public void Adding_is_idempotent_per_user_and_emits_one_message_for_the_batch()
    {
        var owner = AddUser("owner");
        var sam = AddUser("sam");
        var kim = AddUser("kim");
        var group = AddGroup(owner, sam);

        var result = this.service.AddMembers(group, owner, new[] { kim, sam }, 0);

        Assert.True(result.Ok);
        Assert.Equal(new[] { kim }, result.Added);
        Assert.Equal(new[] { sam }, result.Skipped);
        Assert.Equal(SystemKind.MembersAdded, result.SystemMessage.SystemKind);
        Assert.Equal(GroupRole.Member, RoleOf(group, kim));
    }

    [Fact]
    public void Removing_someone_already_gone_is_success_rather_than_an_error()
    {
        // The user cannot act on "they were already removed", so it is not worth an error.
        var owner = AddUser("owner");
        var group = AddGroup(owner, AddUser("sam"));

        var result = this.service.RemoveMember(group, owner, AddUser("stranger"), 0);

        Assert.True(result.Ok);
        Assert.Null(result.SystemMessage);
    }

    [Fact]
    public void Leaving_bypasses_the_remove_permission()
    {
        // A member cannot remove others under the default map, but may always remove
        // themselves - that is the "leave group" action.
        var owner = AddUser("owner");
        var sam = AddUser("sam");
        var group = AddGroup(owner, sam);

        var result = this.service.RemoveMember(group, sam, sam, 0);

        Assert.True(result.Ok);
        Assert.Equal(SystemKind.MemberLeft, result.SystemMessage.SystemKind);
        Assert.Empty(this.ctx.ThreadParticipant.Where(p => p.ThreadId == group && p.UserId == sam));
    }

    [Fact]
    public void The_owner_cannot_be_removed_or_leave()
    {
        var owner = AddUser("owner");
        var admin = AddUser("admin");
        var group = AddGroup(owner, admin);
        this.service.SetRole(group, owner, admin, GroupRole.Admin, 0);

        // Not by an admin, and not by themselves. Either would leave the group ownerless.
        Assert.Equal(GroupError.LastOwner, this.service.RemoveMember(group, admin, owner, 1).Error);
        Assert.Equal(GroupError.LastOwner, this.service.RemoveMember(group, owner, owner, 1).Error);
        Assert.Equal(1, OwnerCount(group));
    }

    // --- roles and ownership ------------------------------------------------------------

    [Fact]
    public void Setting_a_role_to_owner_is_refused()
    {
        // This endpoint is the one available path to two owners, so it refuses outright.
        var owner = AddUser("owner");
        var sam = AddUser("sam");
        var group = AddGroup(owner, sam);

        Assert.Equal(GroupError.PermissionDenied,
            this.service.SetRole(group, owner, sam, GroupRole.Owner, 0).Error);
        Assert.Equal(1, OwnerCount(group));
    }

    [Fact]
    public void Transfer_moves_ownership_and_demotes_the_previous_owner_together()
    {
        var owner = AddUser("owner");
        var sam = AddUser("sam");
        var group = AddGroup(owner, sam);

        var result = this.service.TransferOwnership(group, owner, sam, 0);

        Assert.True(result.Ok);
        Assert.Equal(GroupRole.Owner, RoleOf(group, sam));
        Assert.Equal(GroupRole.Admin, RoleOf(group, owner));

        // The invariant, stated as the spec states it.
        Assert.Equal(1, OwnerCount(group));
        Assert.Equal(sam, this.ctx.Thread.Single(t => t.Id == group).OwnerId);
        Assert.Equal(SystemKind.OwnerTransferred, result.SystemMessage.SystemKind);
    }

    [Fact]
    public void Only_the_owner_transfers()
    {
        var owner = AddUser("owner");
        var sam = AddUser("sam");
        var kim = AddUser("kim");
        var group = AddGroup(owner, sam, kim);
        this.service.SetRole(group, owner, sam, GroupRole.Admin, 0);

        Assert.Equal(GroupError.PermissionDenied,
            this.service.TransferOwnership(group, sam, kim, 1).Error);
        Assert.Equal(GroupRole.Owner, RoleOf(group, owner));
    }

    [Fact]
    public void Transferring_to_someone_who_left_is_refused_with_the_current_group()
    {
        var owner = AddUser("owner");
        var sam = AddUser("sam");
        var group = AddGroup(owner, sam);
        this.service.RemoveMember(group, sam, sam, 0);

        var result = this.service.TransferOwnership(group, owner, sam, 1);

        Assert.Equal(GroupError.NotAMember, result.Error);
        Assert.NotNull(result.Thread);
        Assert.Equal(1, OwnerCount(group));
    }

    // --- permissions --------------------------------------------------------------------

    [Fact]
    public void Only_the_owner_changes_the_map_and_it_emits_no_system_message()
    {
        var owner = AddUser("owner");
        var sam = AddUser("sam");
        var group = AddGroup(owner, sam);
        this.service.SetRole(group, owner, sam, GroupRole.Admin, 0);

        Assert.Equal(GroupError.PermissionDenied,
            this.service.SetPermissions(group, sam, PermissionLevel.Everyone, null, null, 1).Error);

        var ok = this.service.SetPermissions(group, owner, PermissionLevel.Everyone, null, null, 1);

        Assert.True(ok.Ok);
        Assert.Equal(PermissionLevel.Everyone, ok.Thread.PermRename);
        // Unchanged: omitted keys are left alone.
        Assert.Equal(PermissionLevel.Admins, ok.Thread.PermInvite);
        // Configuration, not an event in the conversation.
        Assert.Null(ok.SystemMessage);
    }

    [Fact]
    public void A_permissive_map_lets_a_member_rename()
    {
        var owner = AddUser("owner");
        var sam = AddUser("sam");
        var group = AddGroup(owner, sam);
        this.service.SetPermissions(group, owner, PermissionLevel.Everyone, null, null, 0);

        Assert.True(this.service.Rename(group, sam, "Anyone can", 1).Ok);
    }

    [Fact]
    public void A_system_message_is_authored_by_the_actor_and_stores_facts_not_prose()
    {
        var owner = AddUser("owner");
        var group = AddGroup(owner, AddUser("sam"));

        var result = this.service.Rename(group, owner, "Design Guild", 0);
        var stored = this.ctx.Message.Single(m => m.Id == result.SystemMessage.Id);

        // The actor, not a sentinel - which is also what satisfies the non-nullable FK.
        Assert.Equal(owner, stored.SenderId);
        Assert.Equal(MessageType.System, stored.Type);
        // No rendered sentence is stored; the client builds it from the facts.
        Assert.Null(stored.Text);
        Assert.Contains("Design Guild", stored.SystemData);
    }
}
