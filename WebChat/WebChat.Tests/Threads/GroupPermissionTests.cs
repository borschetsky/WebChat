using WebChat.Models;
using WebChat.Services;
using Thread = WebChat.Models.Thread;

namespace WebChat.Tests.Threads;

/// <summary>
/// `SPEC-groups-and-admin.md` §2. These are authorization rules, so they are tested
/// exhaustively rather than representatively - the last authorization check in this repo was
/// both wrong and untested, and it was the only thing between a user and someone else's
/// messages.
///
/// Three rules the permission map deliberately cannot override, each because the state it
/// would allow is unrecoverable through the UI: the Owner cannot be removed, only the Owner
/// transfers ownership or edits the map, and nobody is promoted straight to Owner.
/// </summary>
public class GroupPermissionTests
{
    private static Thread Group(string rename = PermissionLevel.Admins,
                                string invite = PermissionLevel.Admins,
                                string remove = PermissionLevel.Admins) =>
        new()
        {
            Id = "t1",
            IsGroup = true,
            PermRename = rename,
            PermInvite = invite,
            PermRemove = remove,
        };

    [Theory]
    [InlineData(GroupRole.Owner, true)]
    [InlineData(GroupRole.Admin, true)]
    [InlineData(GroupRole.Member, false)]
    public void The_default_map_lets_admins_and_the_owner_manage(string role, bool allowed)
    {
        var group = Group();

        Assert.Equal(allowed, GroupPermissions.Can(GroupAction.Rename, role, group));
        Assert.Equal(allowed, GroupPermissions.Can(GroupAction.Invite, role, group));
        Assert.Equal(allowed, GroupPermissions.Can(GroupAction.Remove, role, group));
    }

    [Theory]
    [InlineData(GroupRole.Owner, true)]
    [InlineData(GroupRole.Admin, false)]
    [InlineData(GroupRole.Member, false)]
    public void An_owner_only_level_excludes_admins(string role, bool allowed)
    {
        var group = Group(rename: PermissionLevel.Owner);

        Assert.Equal(allowed, GroupPermissions.Can(GroupAction.Rename, role, group));
    }

    [Theory]
    [InlineData(GroupRole.Owner)]
    [InlineData(GroupRole.Admin)]
    [InlineData(GroupRole.Member)]
    public void Everyone_means_every_member(string role)
    {
        var group = Group(rename: PermissionLevel.Everyone);

        Assert.True(GroupPermissions.Can(GroupAction.Rename, role, group));
    }

    [Fact]
    public void A_non_member_is_refused_even_at_everyone()
    {
        // 'everyone' means every member, not every user. A null role is someone with no
        // membership row, and the whole point of that table is that a missing row is a
        // refusal rather than a fall-through.
        var group = Group(rename: PermissionLevel.Everyone, invite: PermissionLevel.Everyone,
                          remove: PermissionLevel.Everyone);

        Assert.False(GroupPermissions.Can(GroupAction.Rename, null, group));
        Assert.False(GroupPermissions.Can(GroupAction.Invite, null, group));
        Assert.False(GroupPermissions.Can(GroupAction.Remove, null, group));
        Assert.False(GroupPermissions.Can(GroupAction.SetRole, null, group));
    }

    [Fact]
    public void An_unrecognised_level_denies_rather_than_defaults()
    {
        // A typo in the database should close a door, not open one.
        var group = Group(rename: "anyone-really");

        Assert.False(GroupPermissions.Can(GroupAction.Rename, GroupRole.Owner, group));
        Assert.False(GroupPermissions.Can(GroupAction.Rename, GroupRole.Admin, group));
    }

    [Theory]
    [InlineData(GroupRole.Owner, true)]
    [InlineData(GroupRole.Admin, false)]
    [InlineData(GroupRole.Member, false)]
    public void Only_the_owner_edits_the_map_or_transfers(string role, bool allowed)
    {
        var group = Group();

        Assert.Equal(allowed, GroupPermissions.Can(GroupAction.SetPermissions, role, group));
        Assert.Equal(allowed, GroupPermissions.Can(GroupAction.TransferOwnership, role, group));
    }

    [Fact]
    public void The_map_cannot_grant_permission_editing_to_anyone_else()
    {
        // Even at 'everyone' on every action, the map does not govern itself - otherwise an
        // owner could hand away the ability to take the group back.
        var group = Group(rename: PermissionLevel.Everyone, invite: PermissionLevel.Everyone,
                          remove: PermissionLevel.Everyone);

        Assert.False(GroupPermissions.Can(GroupAction.SetPermissions, GroupRole.Admin, group));
        Assert.False(GroupPermissions.Can(GroupAction.TransferOwnership, GroupRole.Admin, group));
    }

    [Theory]
    [InlineData(GroupRole.Owner, true)]
    [InlineData(GroupRole.Admin, true)]
    [InlineData(GroupRole.Member, false)]
    public void Role_changes_are_admin_work_and_not_configurable(string role, bool allowed)
    {
        // Not in the permission map: an admin who could not manage roles could not do the
        // job, and a member who could would make the map meaningless.
        var group = Group(remove: PermissionLevel.Everyone);

        Assert.Equal(allowed, GroupPermissions.Can(GroupAction.SetRole, role, group));
    }

    [Fact]
    public void The_owner_cannot_be_removed_by_anyone_at_any_level()
    {
        // The rule that keeps a group recoverable: an owner who has been removed leaves
        // nobody able to transfer ownership.
        var permissive = Group(remove: PermissionLevel.Everyone);

        Assert.False(GroupPermissions.CanRemove(GroupRole.Owner, GroupRole.Owner, permissive));
        Assert.False(GroupPermissions.CanRemove(GroupRole.Admin, GroupRole.Owner, permissive));
        Assert.False(GroupPermissions.CanRemove(GroupRole.Member, GroupRole.Owner, permissive));
    }

    [Fact]
    public void An_admin_may_remove_a_member_and_another_admin()
    {
        var group = Group();

        Assert.True(GroupPermissions.CanRemove(GroupRole.Admin, GroupRole.Member, group));
        Assert.True(GroupPermissions.CanRemove(GroupRole.Admin, GroupRole.Admin, group));
    }

    [Fact]
    public void Nobody_is_promoted_straight_to_owner()
    {
        // Ownership moves by transfer, which demotes the previous owner in the same
        // transaction. Allowing it here would be the one path to a group with two owners.
        var group = Group();

        Assert.False(GroupPermissions.CanSetRole(GroupRole.Owner, GroupRole.Owner, group));
        Assert.False(GroupPermissions.CanSetRole(GroupRole.Admin, GroupRole.Owner, group));
    }

    [Theory]
    [InlineData(GroupRole.Admin)]
    [InlineData(GroupRole.Member)]
    public void An_admin_may_promote_and_demote(string target)
    {
        Assert.True(GroupPermissions.CanSetRole(GroupRole.Admin, target, Group()));
    }

    [Fact]
    public void An_invalid_target_role_is_refused()
    {
        Assert.False(GroupPermissions.CanSetRole(GroupRole.Owner, "superuser", Group()));
    }

    [Theory]
    [InlineData(GroupRole.Owner, false)]
    [InlineData(GroupRole.Admin, true)]
    [InlineData(GroupRole.Member, true)]
    public void The_owner_must_transfer_before_leaving(string role, bool canLeave)
    {
        // The UI shows "Transfer ownership before leaving" rather than "Leave group", and
        // this is the rule behind it.
        Assert.Equal(canLeave, GroupPermissions.CanLeave(role));
    }
}
