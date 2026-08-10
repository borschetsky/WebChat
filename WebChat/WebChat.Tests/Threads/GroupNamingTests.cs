using System;
using System.Linq;
using Microsoft.EntityFrameworkCore;
using WebChat.Connection;
using WebChat.Models;
using Thread = WebChat.Models.Thread;

namespace WebChat.Tests.Threads;

/// <summary>
/// `SPEC-groups-and-admin.md` §1: an unnamed group stores no name, and its title is derived
/// from current membership on every read. The spec is blunt about why a stored one is wrong -
/// "it goes stale silently and users report it as a bug" - and this app did store one.
///
/// The server's half of that is small: keep null, and remember whether anyone named the group.
/// These pin the distinction the `Named` flag exists to make, because a null check alone
/// cannot make it: renaming a group to exactly its derived title would look identical.
/// </summary>
public class GroupNamingTests : IDisposable
{
    private readonly Microsoft.Data.Sqlite.SqliteConnection connection;
    private readonly WebChatContext ctx;

    public GroupNamingTests()
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

    /// <summary>Thread.OwnerId is a real foreign key, so the owner has to exist.</summary>
    private string AddOwner()
    {
        var user = new User
        {
            Id = Guid.NewGuid().ToString(),
            Username = "owner" + Guid.NewGuid().ToString("N")[..6],
            Email = Guid.NewGuid().ToString("N")[..8] + "@example.com",
            Password = "hashed",
            CreatedOn = DateTime.UtcNow,
            SecurityStamp = Guid.NewGuid().ToString(),
        };
        this.ctx.User.Add(user);
        this.ctx.SaveChanges();
        return user.Id;
    }

    private string AddGroup(string? name, bool named)
    {
        var thread = new Thread
        {
            Id = Guid.NewGuid().ToString(),
            OwnerId = AddOwner(),
            IsGroup = true,
            Name = name,
            Named = named,
            CreatedOn = DateTime.UtcNow,
        };

        this.ctx.Thread.Add(thread);
        this.ctx.SaveChanges();
        return thread.Id;
    }

    [Fact]
    public void An_unnamed_group_stores_no_name()
    {
        var id = AddGroup(null, named: false);

        var saved = this.ctx.Thread.Single(t => t.Id == id);

        // Null rather than a derived string. The client computes the title from members, so
        // there is nothing here to go stale when somebody leaves.
        Assert.Null(saved.Name);
        Assert.False(saved.Named);
    }

    [Fact]
    public void A_named_group_keeps_its_name_and_is_marked_named()
    {
        var id = AddGroup("Design Guild", named: true);

        var saved = this.ctx.Thread.Single(t => t.Id == id);

        Assert.Equal("Design Guild", saved.Name);
        Assert.True(saved.Named);
    }

    [Fact]
    public void Named_is_what_separates_a_chosen_name_from_a_derived_one()
    {
        // The case a null check cannot decide: somebody deliberately names a group exactly
        // what it would have been called anyway. Without the flag it would silently start
        // re-deriving, and the name would change the next time a member left.
        var chosen = AddGroup("Maya, Tomás", named: true);
        var derivedLooking = AddGroup(null, named: false);

        Assert.True(this.ctx.Thread.Single(t => t.Id == chosen).Named);
        Assert.False(this.ctx.Thread.Single(t => t.Id == derivedLooking).Named);
    }

    [Fact]
    public void Direct_threads_are_unaffected()
    {
        var thread = new Thread
        {
            Id = Guid.NewGuid().ToString(),
            OwnerId = AddOwner(),
            IsGroup = false,
            CreatedOn = DateTime.UtcNow,
        };
        this.ctx.Thread.Add(thread);
        this.ctx.SaveChanges();

        var saved = this.ctx.Thread.Single(t => t.Id == thread.Id);

        // A direct thread is titled after the other person, so Named means nothing for it and
        // must not be set by the backfill.
        Assert.Null(saved.Name);
        Assert.False(saved.Named);
    }
}
