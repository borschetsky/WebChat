using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using WebChat.Connection;
using WebChat.Hubs.ConnectionMapper;
using WebChat.Models;
using WebChat.Services;

namespace WebChat.Tests.Admin
{
    /// <summary>
    /// The member actions, and above all the guards on them.
    ///
    /// These are the assertions worth having: everything else on this screen is a list, but
    /// these four decisions are the ones that can lock an administrator out of their own
    /// workspace, hand it to somebody who should not have it, or leave a group with nobody
    /// able to manage it.
    /// </summary>
    public class MemberAdminTests : IDisposable
    {
        private readonly SqliteConnection connection = new("DataSource=:memory:");
        private readonly WebChatContext ctx;
        private readonly ConnectionAborter aborter = new();
        private readonly ConnectionMapping<string> connections = new();
        private readonly MemberAdminService service;

        public MemberAdminTests()
        {
            this.connection.Open();
            this.ctx = new WebChatContext(new DbContextOptionsBuilder<WebChatContext>()
                .UseSqlite(this.connection).Options);
            this.ctx.Database.EnsureCreated();

            this.service = new MemberAdminService(
                this.ctx, new AuditService(this.ctx), this.aborter, this.connections);
        }

        private User Add(string name, string role = WorkspaceRole.Member, string status = AccountStatus.Active)
        {
            var user = new User
            {
                Id = Guid.NewGuid().ToString(),
                Username = name,
                Email = name + "@example.com",
                Password = "hashed",
                Role = role,
                Status = status,
                EmailConfirmed = true,
                CreatedOn = DateTime.UtcNow,
                SecurityStamp = Guid.NewGuid().ToString(),
            };

            this.ctx.User.Add(user);
            this.ctx.SaveChanges();
            return user;
        }

        private Models.Thread AddGroup(params (User user, string gRole)[] members)
        {
            // OwnerId as well as the participant's GRole: ownership is stored in both places
            // and a fixture that set only one would not be a group the app could produce.
            var thread = new Models.Thread
            {
                Id = Guid.NewGuid().ToString(),
                IsGroup = true,
                OwnerId = members.First(m => m.gRole == GroupRole.Owner).user.Id,
                CreatedOn = DateTime.UtcNow,
            };
            this.ctx.Thread.Add(thread);

            foreach (var (user, gRole) in members)
            {
                this.ctx.ThreadParticipant.Add(new ThreadParticipant
                {
                    Id = Guid.NewGuid().ToString(),
                    ThreadId = thread.Id,
                    UserId = user.Id,
                    GRole = gRole,
                    CreatedOn = DateTime.UtcNow,
                });
            }

            this.ctx.SaveChanges();
            return thread;
        }

        private User Reload(string id) => this.ctx.User.AsNoTracking().Single(u => u.Id == id);

        // --- the guards --------------------------------------------------------------

        [Fact]
        public async Task An_administrator_cannot_block_themselves()
        {
            var owner = this.Add("owner", WorkspaceRole.Owner);

            var result = await this.service.SetStatusAsync(
                owner.Id, new[] { owner.Id }, AccountStatus.Blocked);

            Assert.Equal(MemberAdminError.SelfAction, result.Error);
            Assert.Equal(AccountStatus.Active, this.Reload(owner.Id).Status);
        }

        /// <summary>
        /// A bulk call is refused whole. Applying the part that passes would leave an
        /// administrator working out which half of their click landed.
        /// </summary>
        [Fact]
        public async Task A_bulk_action_containing_the_actor_is_refused_entirely()
        {
            var owner = this.Add("owner", WorkspaceRole.Owner);
            var ben = this.Add("ben");

            var result = await this.service.SetStatusAsync(
                owner.Id, new[] { ben.Id, owner.Id }, AccountStatus.Blocked);

            Assert.Equal(MemberAdminError.SelfAction, result.Error);
            Assert.Equal(AccountStatus.Active, this.Reload(ben.Id).Status);
        }

        [Fact]
        public async Task The_last_owner_cannot_be_blocked()
        {
            var owner = this.Add("owner", WorkspaceRole.Owner);
            var admin = this.Add("admin", WorkspaceRole.Admin);

            var result = await this.service.SetStatusAsync(
                admin.Id, new[] { owner.Id }, AccountStatus.Blocked);

            Assert.Equal(MemberAdminError.LastOwner, result.Error);
        }

        /// <summary>
        /// The check that a per-account guard would miss: two owners, each individually safe
        /// to block, named in one call.
        /// </summary>
        [Fact]
        public async Task Blocking_every_owner_at_once_is_refused()
        {
            var first = this.Add("first", WorkspaceRole.Owner);
            var second = this.Add("second", WorkspaceRole.Owner);
            var admin = this.Add("admin", WorkspaceRole.Admin);

            var result = await this.service.SetStatusAsync(
                admin.Id, new[] { first.Id, second.Id }, AccountStatus.Blocked);

            Assert.Equal(MemberAdminError.LastOwner, result.Error);
            Assert.Equal(AccountStatus.Active, this.Reload(first.Id).Status);
            Assert.Equal(AccountStatus.Active, this.Reload(second.Id).Status);
        }

        [Fact]
        public async Task One_of_two_owners_can_be_blocked()
        {
            var first = this.Add("first", WorkspaceRole.Owner);
            var second = this.Add("second", WorkspaceRole.Owner);

            var result = await this.service.SetStatusAsync(
                second.Id, new[] { first.Id }, AccountStatus.Blocked);

            Assert.True(result.Ok);
            Assert.Equal(AccountStatus.Blocked, this.Reload(first.Id).Status);
        }

        [Theory]
        [InlineData(WorkspaceRole.Admin)]
        [InlineData(WorkspaceRole.Owner)]
        public async Task An_admin_cannot_appoint_into_the_administering_tier(string target)
        {
            var admin = this.Add("admin", WorkspaceRole.Admin);
            var ben = this.Add("ben");

            var result = await this.service.SetRoleAsync(admin.Id, WorkspaceRole.Admin, ben.Id, target);

            Assert.Equal(MemberAdminError.OwnerOnly, result.Error);
            Assert.Equal(WorkspaceRole.Member, this.Reload(ben.Id).Role);
        }

        /// <summary>
        /// The other half, and the one that matters more: without it an admin could demote
        /// the owner and take the workspace.
        /// </summary>
        [Fact]
        public async Task An_admin_cannot_demote_the_owner()
        {
            var owner = this.Add("owner", WorkspaceRole.Owner);
            var admin = this.Add("admin", WorkspaceRole.Admin);

            var result = await this.service.SetRoleAsync(
                admin.Id, WorkspaceRole.Admin, owner.Id, WorkspaceRole.Member);

            Assert.Equal(MemberAdminError.OwnerOnly, result.Error);
            Assert.Equal(WorkspaceRole.Owner, this.Reload(owner.Id).Role);
        }

        [Fact]
        public async Task An_owner_can_appoint_an_admin()
        {
            var owner = this.Add("owner", WorkspaceRole.Owner);
            var ben = this.Add("ben");

            var result = await this.service.SetRoleAsync(
                owner.Id, WorkspaceRole.Owner, ben.Id, WorkspaceRole.Admin);

            Assert.True(result.Ok);
            Assert.Equal(WorkspaceRole.Admin, this.Reload(ben.Id).Role);
        }

        // --- blocking and deactivating -----------------------------------------------

        [Fact]
        public async Task Blocking_rotates_the_security_stamp()
        {
            var owner = this.Add("owner", WorkspaceRole.Owner);
            var ben = this.Add("ben");
            var before = ben.SecurityStamp;

            await this.service.SetStatusAsync(owner.Id, new[] { ben.Id }, AccountStatus.Blocked);

            Assert.NotEqual(before, this.Reload(ben.Id).SecurityStamp);
        }

        /// <summary>
        /// Blocking keeps the account's groups - it is a suspension, and an unblock has to be
        /// able to put things back. Deactivation is the one that empties them.
        /// </summary>
        [Fact]
        public async Task Blocking_leaves_group_membership_alone()
        {
            var owner = this.Add("owner", WorkspaceRole.Owner);
            var ben = this.Add("ben");
            var group = this.AddGroup((owner, GroupRole.Owner), (ben, GroupRole.Member));

            await this.service.SetStatusAsync(owner.Id, new[] { ben.Id }, AccountStatus.Blocked);

            Assert.True(this.ctx.ThreadParticipant.Any(p => p.ThreadId == group.Id && p.UserId == ben.Id));
        }

        [Fact]
        public async Task Deactivating_removes_them_from_every_group()
        {
            var owner = this.Add("owner", WorkspaceRole.Owner);
            var ben = this.Add("ben");
            var first = this.AddGroup((owner, GroupRole.Owner), (ben, GroupRole.Member));
            var second = this.AddGroup((owner, GroupRole.Owner), (ben, GroupRole.Member));

            await this.service.SetStatusAsync(owner.Id, new[] { ben.Id }, AccountStatus.Deactivated);

            Assert.Empty(this.ctx.ThreadParticipant.Where(p => p.UserId == ben.Id));
            Assert.Equal(2, this.ctx.Message.Count(m => m.SystemKind == SystemKind.MemberDeactivated));
            Assert.Contains(this.ctx.Message, m => m.ThreadId == first.Id);
            Assert.Contains(this.ctx.Message, m => m.ThreadId == second.Id);
        }

        /// <summary>
        /// A deactivation is a workspace act; the administrator behind it has no standing
        /// inside the group. So the group is told what happened to the person, using a kind
        /// of its own, rather than being told an admin removed them - which would assert an
        /// authority the spec deliberately withholds.
        /// </summary>
        [Fact]
        public async Task The_departure_is_not_recorded_as_a_removal_by_an_admin()
        {
            var owner = this.Add("owner", WorkspaceRole.Owner);
            var ben = this.Add("ben");
            this.AddGroup((owner, GroupRole.Owner), (ben, GroupRole.Member));

            await this.service.SetStatusAsync(owner.Id, new[] { ben.Id }, AccountStatus.Deactivated);

            Assert.DoesNotContain(this.ctx.Message, m => m.SystemKind == SystemKind.MemberRemoved);
        }

        /// <summary>
        /// The ownerless-group bug from #63, reached from the other direction: removing a
        /// group's owner leaves nobody who can rename it, manage it or transfer it.
        /// </summary>
        [Fact]
        public async Task Deactivating_a_group_owner_hands_the_group_on()
        {
            var owner = this.Add("owner", WorkspaceRole.Owner);
            var ben = this.Add("ben");
            var maya = this.Add("maya");
            var group = this.AddGroup((ben, GroupRole.Owner), (maya, GroupRole.Admin));

            await this.service.SetStatusAsync(owner.Id, new[] { ben.Id }, AccountStatus.Deactivated);

            var remaining = this.ctx.ThreadParticipant.Where(p => p.ThreadId == group.Id).ToList();
            Assert.Single(remaining);
            Assert.Equal(GroupRole.Owner, remaining[0].GRole);
            Assert.Equal(maya.Id, remaining[0].UserId);
            Assert.Contains(this.ctx.Message, m => m.SystemKind == SystemKind.OwnerTransferred);

            // Ownership is stored twice; a group whose permissions say one thing and whose
            // row says another is the failure this asserts against.
            Assert.Equal(maya.Id, this.ctx.Thread.AsNoTracking().Single(t => t.Id == group.Id).OwnerId);
        }

        [Fact]
        public async Task A_direct_thread_is_left_intact()
        {
            var owner = this.Add("owner", WorkspaceRole.Owner);
            var ben = this.Add("ben");

            var direct = new Models.Thread
            {
                Id = Guid.NewGuid().ToString(),
                IsGroup = false,
                OwnerId = ben.Id,
                CreatedOn = DateTime.UtcNow,
            };
            this.ctx.Thread.Add(direct);
            this.ctx.ThreadParticipant.Add(new ThreadParticipant
            {
                Id = Guid.NewGuid().ToString(),
                ThreadId = direct.Id,
                UserId = ben.Id,
                CreatedOn = DateTime.UtcNow,
            });
            this.ctx.SaveChanges();

            await this.service.SetStatusAsync(owner.Id, new[] { ben.Id }, AccountStatus.Deactivated);

            Assert.True(this.ctx.ThreadParticipant.Any(p => p.ThreadId == direct.Id && p.UserId == ben.Id));
        }

        // --- the audit trail ----------------------------------------------------------

        [Fact]
        public async Task Every_action_writes_one_audit_entry_naming_the_actor()
        {
            var owner = this.Add("owner", WorkspaceRole.Owner);
            var ben = this.Add("ben");
            var maya = this.Add("maya");

            await this.service.SetStatusAsync(owner.Id, new[] { ben.Id, maya.Id }, AccountStatus.Blocked);

            var entries = this.ctx.AuditEntry.AsNoTracking().ToList();

            // One per account, not one per call: a search for a person has to find
            // everything that was done to them.
            Assert.Equal(2, entries.Count);
            Assert.All(entries, e => Assert.Equal(owner.Id, e.ActorId));
            Assert.All(entries, e => Assert.Equal(AuditAction.Block, e.Action));
            Assert.Contains(entries, e => e.TargetId == ben.Id);
            Assert.Contains(entries, e => e.TargetId == maya.Id);
        }

        [Theory]
        [InlineData(AccountStatus.Blocked, AuditAction.Block)]
        [InlineData(AccountStatus.Deactivated, AuditAction.Deactivate)]
        public async Task The_action_names_what_happened(string status, string expected)
        {
            var owner = this.Add("owner", WorkspaceRole.Owner);
            var ben = this.Add("ben");

            await this.service.SetStatusAsync(owner.Id, new[] { ben.Id }, status);

            Assert.Equal(expected, this.ctx.AuditEntry.AsNoTracking().Single().Action);
        }

        /// <summary>Unblocking is its own action, not a generic "activate".</summary>
        [Fact]
        public async Task Unblocking_is_recorded_as_an_unblock()
        {
            var owner = this.Add("owner", WorkspaceRole.Owner);
            var ben = this.Add("ben", WorkspaceRole.Member, AccountStatus.Blocked);

            await this.service.SetStatusAsync(owner.Id, new[] { ben.Id }, AccountStatus.Active);

            Assert.Equal(AuditAction.Unblock, this.ctx.AuditEntry.AsNoTracking().Single().Action);
        }

        /// <summary>
        /// A refused action must leave no trace. An audit entry for something that did not
        /// happen is the one failure mode the log cannot survive.
        /// </summary>
        [Fact]
        public async Task A_refused_action_writes_nothing()
        {
            var owner = this.Add("owner", WorkspaceRole.Owner);

            await this.service.SetStatusAsync(owner.Id, new[] { owner.Id }, AccountStatus.Blocked);

            Assert.Empty(this.ctx.AuditEntry.AsNoTracking().ToList());
        }

        [Fact]
        public async Task Setting_a_status_that_is_already_set_records_nothing()
        {
            var owner = this.Add("owner", WorkspaceRole.Owner);
            var ben = this.Add("ben");

            await this.service.SetStatusAsync(owner.Id, new[] { ben.Id }, AccountStatus.Active);

            Assert.Empty(this.ctx.AuditEntry.AsNoTracking().ToList());
        }

        [Fact]
        public async Task An_unknown_status_is_refused()
        {
            var owner = this.Add("owner", WorkspaceRole.Owner);
            var ben = this.Add("ben");

            var result = await this.service.SetStatusAsync(owner.Id, new[] { ben.Id }, "retired");

            Assert.Equal(MemberAdminError.InvalidStatus, result.Error);
        }

        // --- the list -----------------------------------------------------------------

        [Fact]
        public async Task The_list_reports_presence_from_live_connections()
        {
            this.Add("owner", WorkspaceRole.Owner);
            var ben = this.Add("ben");
            this.connections.Add(ben.Id, "conn-1");
            this.connections.Add(ben.Id, "conn-2");

            var members = await this.service.ListAsync();

            var row = members.Single(m => m.Id == ben.Id);
            Assert.True(row.Online);
            Assert.Equal(2, row.Connections);
            Assert.False(members.Single(m => m.Name == "owner").Online);
        }

        /// <summary>
        /// Null, not a fabricated date. The app records no general activity timestamp, so
        /// somebody who has never sent a message has no last-active value at all.
        /// </summary>
        [Fact]
        public async Task Someone_who_has_never_written_has_no_last_active()
        {
            var ben = this.Add("ben");

            var members = await this.service.ListAsync();

            Assert.Null(members.Single(m => m.Id == ben.Id).LastActiveUtc);
        }

        public void Dispose()
        {
            this.ctx.Dispose();
            this.connection.Dispose();
            GC.SuppressFinalize(this);
        }
    }
}
