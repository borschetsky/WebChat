using System;
using System.Linq;
using Microsoft.EntityFrameworkCore;
using WebChat.Connection;
using WebChat.Models;
using WebChat.Services;
using Thread = WebChat.Models.Thread;

namespace WebChat.Tests.Threads;

/// <summary>
/// `SPEC-groups-and-admin.md` §2: "New groups are created with the creator as group Owner,
/// everyone else as Member."
///
/// This is the half the #63 migration could not cover. The migration backfilled every
/// *existing* group from <c>Thread.OwnerId</c>, which made the model look correct in a
/// database that already had groups - and hid the fact that the creation path still wrote
/// every row at the column default. A group created after that migration had **no owner at
/// all**: nobody could transfer ownership, nobody could edit the permission map, and the one
/// invariant the whole model rests on ("exactly one owner per group") was violated the moment
/// the group existed.
///
/// Found by fetching a freshly created group through the new GET endpoint and reading
/// <c>gRole</c> on the creator.
/// </summary>
public class GroupCreationRoleTests : IDisposable
{
    private readonly Microsoft.Data.Sqlite.SqliteConnection connection;
    private readonly WebChatContext ctx;
    private readonly ThreadService threads;

    public GroupCreationRoleTests()
    {
        this.connection = new Microsoft.Data.Sqlite.SqliteConnection("DataSource=:memory:");
        this.connection.Open();
        this.ctx = new WebChatContext(new DbContextOptionsBuilder<WebChatContext>()
            .UseSqlite(this.connection).Options);
        this.ctx.Database.EnsureCreated();
        this.threads = new ThreadService(this.ctx, null);
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

    private string AddGroup(string ownerId)
    {
        var thread = new Thread
        {
            Id = Guid.NewGuid().ToString(),
            OwnerId = ownerId,
            IsGroup = true,
            CreatedOn = DateTime.UtcNow,
        };
        this.ctx.Thread.Add(thread);
        this.ctx.SaveChanges();
        return thread.Id;
    }

    [Fact]
    public void The_creator_owns_the_new_group_and_nobody_else_does()
    {
        var creator = AddUser("creator");
        var second = AddUser("second");
        var third = AddUser("third");
        var groupId = AddGroup(creator);

        this.threads.AddParticipants(groupId, new[] { creator, second, third }, creator);

        var roles = this.ctx.ThreadParticipant
            .Where(p => p.ThreadId == groupId)
            .ToDictionary(p => p.UserId, p => p.GRole);

        Assert.Equal(GroupRole.Owner, roles[creator]);
        Assert.Equal(GroupRole.Member, roles[second]);
        Assert.Equal(GroupRole.Member, roles[third]);

        // The invariant, stated as the spec states it: exactly one, never zero, never two.
        Assert.Single(roles.Values, r => r == GroupRole.Owner);
    }

    [Fact]
    public void A_direct_thread_has_no_owner_among_its_participants()
    {
        // Roles are meaningless on a direct thread and nothing reads them there, but leaving
        // one participant marked 'owner' would invite someone to infer a meaning.
        var a = AddUser("a");
        var b = AddUser("b");
        var threadId = AddGroup(a);

        this.threads.AddParticipants(threadId, new[] { a, b });

        var roles = this.ctx.ThreadParticipant
            .Where(p => p.ThreadId == threadId)
            .Select(p => p.GRole)
            .ToList();

        Assert.All(roles, r => Assert.Equal(GroupRole.Member, r));
    }
}
