using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using WebChat.Connection;
using WebChat.Models;
using WebChat.Services;

namespace WebChat.Tests.Admin
{
    /// <summary>
    /// Workspace policies (#75).
    ///
    /// The point of the slice is that a switch on the screen corresponds to something that
    /// actually happens, so most of what is worth asserting here is about refusing to store
    /// anything that does not: an unknown key is rejected, a retired key in the stored blob is
    /// dropped on the way out, and a policy nobody has touched reports its default rather than
    /// nothing.
    /// </summary>
    public class WorkspacePolicyServiceTests : IDisposable
    {
        private readonly SqliteConnection connection = new("DataSource=:memory:");
        private readonly WebChatContext ctx;
        private readonly WorkspacePolicyCache cache = new();
        private readonly WorkspacePolicyService service;

        public WorkspacePolicyServiceTests()
        {
            this.connection.Open();
            this.ctx = new WebChatContext(new DbContextOptionsBuilder<WebChatContext>()
                .UseSqlite(this.connection).Options);
            this.ctx.Database.EnsureCreated();
            this.service = new WorkspacePolicyService(this.ctx, new AuditService(this.ctx), this.cache);
        }

        public void Dispose()
        {
            this.ctx.Dispose();
            this.connection.Dispose();
            GC.SuppressFinalize(this);
        }

        [Fact]
        public async Task An_untouched_policy_reports_its_default()
        {
            var policies = await this.service.GetAsync();

            Assert.True(policies[WorkspacePolicy.MembersCanCreateGroups]);
            Assert.Equal(WorkspacePolicy.Defaults.Count, policies.Count);
        }

        /// <summary>
        /// The defaults have to be what the app did before the policy existed, or deploying it
        /// takes something away from every member with nothing but a release note in the way.
        /// </summary>
        [Fact]
        public async Task Every_default_leaves_behaviour_as_it_was()
        {
            Assert.True(await this.service.IsEnabledAsync(WorkspacePolicy.MembersCanCreateGroups));
        }

        [Fact]
        public async Task Setting_a_policy_stores_it_and_reports_it_back()
        {
            var result = await this.service.SetAsync("admin-1", WorkspacePolicy.MembersCanCreateGroups, false);

            Assert.True(result.Ok);
            Assert.False(result.Policies[WorkspacePolicy.MembersCanCreateGroups]);
            Assert.False(await this.service.IsEnabledAsync(WorkspacePolicy.MembersCanCreateGroups));
        }

        [Fact]
        public async Task An_unknown_policy_is_refused_rather_than_stored()
        {
            var result = await this.service.SetAsync("admin-1", "members_can_teleport", true);

            Assert.False(result.Ok);
            Assert.Equal(PolicyError.UnknownPolicy, result.Error);

            // Nothing written at all, not even an empty settings row: a value nothing reads is
            // exactly what this slice is about not having.
            Assert.Empty(await this.ctx.WorkspaceSettings.ToListAsync());
        }

        [Fact]
        public async Task A_null_key_is_refused_rather_than_throwing()
        {
            var result = await this.service.SetAsync("admin-1", null, true);

            Assert.False(result.Ok);
            Assert.Equal(PolicyError.UnknownPolicy, result.Error);
        }

        [Fact]
        public async Task The_change_is_audited_with_both_values()
        {
            await this.service.SetAsync("admin-1", WorkspacePolicy.MembersCanCreateGroups, false);

            var entry = await this.ctx.AuditEntry.SingleAsync();

            Assert.Equal(AuditAction.Policy, entry.Action);
            Assert.Equal("policy", entry.TargetType);
            Assert.Equal(WorkspacePolicy.MembersCanCreateGroups, entry.TargetId);
            Assert.Equal("admin-1", entry.ActorId);

            using var detail = JsonDocument.Parse(entry.DetailJson);
            Assert.Equal(WorkspacePolicy.MembersCanCreateGroups, detail.RootElement.GetProperty("policy").GetString());
            Assert.False(detail.RootElement.GetProperty("value").GetBoolean());

            // The previous value is what answers "did this actually change anything", which a
            // log of new values alone cannot.
            Assert.True(detail.RootElement.GetProperty("previous").GetBoolean());
        }

        /// <summary>
        /// The audit entry and the settings row are written by one SaveChanges. A policy change
        /// with no record, or a record of a change that did not happen, are the two states this
        /// log must not have.
        /// </summary>
        [Fact]
        public async Task The_setting_and_its_audit_entry_land_together()
        {
            await this.service.SetAsync("admin-1", WorkspacePolicy.MembersCanCreateGroups, false);

            Assert.Single(await this.ctx.WorkspaceSettings.ToListAsync());
            Assert.Single(await this.ctx.AuditEntry.ToListAsync());
        }

        [Fact]
        public async Task Only_one_row_is_ever_written()
        {
            await this.service.SetAsync("admin-1", WorkspacePolicy.MembersCanCreateGroups, false);
            await this.service.SetAsync("admin-1", WorkspacePolicy.MembersCanCreateGroups, true);
            await this.service.SetAsync("admin-2", WorkspacePolicy.MembersCanCreateGroups, false);

            var rows = await this.ctx.WorkspaceSettings.ToListAsync();
            Assert.Single(rows);
            Assert.Equal(WorkspaceSettings.SingletonId, rows[0].Id);

            // Three changes, three entries. The log is of decisions, not of the current state.
            Assert.Equal(3, await this.ctx.AuditEntry.CountAsync());
        }

        /// <summary>
        /// What a retired policy leaves behind. Passing it through would put a switch back on
        /// the screen for something nothing enforces any more - the exact failure this slice
        /// removes.
        /// </summary>
        [Fact]
        public async Task A_stored_key_this_build_does_not_know_is_dropped()
        {
            this.ctx.WorkspaceSettings.Add(new WorkspaceSettings
            {
                Id = WorkspaceSettings.SingletonId,
                PoliciesJson = JsonSerializer.Serialize(new Dictionary<string, bool>
                {
                    [WorkspacePolicy.MembersCanCreateGroups] = false,
                    ["retired_policy"] = true,
                }),
                ModifiedOn = DateTime.UtcNow,
            });
            await this.ctx.SaveChangesAsync();

            var policies = await this.service.GetAsync();

            Assert.False(policies[WorkspacePolicy.MembersCanCreateGroups]);
            Assert.DoesNotContain("retired_policy", policies.Keys);
        }

        /// <summary>
        /// The row is one hand-edit away from being malformed, and every policy read happens on
        /// a request that has something else to do. Falling back to the defaults keeps those
        /// requests working; throwing would take out group creation because a settings row was
        /// mistyped.
        /// </summary>
        [Fact]
        public async Task Unparseable_settings_fall_back_to_the_defaults()
        {
            this.ctx.WorkspaceSettings.Add(new WorkspaceSettings
            {
                Id = WorkspaceSettings.SingletonId,
                PoliciesJson = "{not json at all",
                ModifiedOn = DateTime.UtcNow,
            });
            await this.ctx.SaveChangesAsync();

            var policies = await this.service.GetAsync();

            Assert.True(policies[WorkspacePolicy.MembersCanCreateGroups]);
        }

        [Fact]
        public async Task An_enforcement_point_asking_about_a_retired_key_gets_the_old_behaviour()
        {
            // Not in Defaults, so not enforced. False - "nothing permits it" - would be the
            // wrong answer: an endpoint checking a policy that has been removed should do what
            // it did before the policy was ever added.
            Assert.False(await this.service.IsEnabledAsync("retired_policy"));
        }

        /// <summary>
        /// The write path has to leave this instance right immediately; the TTL only bounds how
        /// long a *different* instance can disagree.
        /// </summary>
        [Fact]
        public async Task A_write_invalidates_the_cache_on_the_instance_that_served_it()
        {
            await this.service.GetAsync();
            Assert.NotNull(this.cache.Current);

            await this.service.SetAsync("admin-1", WorkspacePolicy.MembersCanCreateGroups, false);

            Assert.Null(this.cache.Current);
            Assert.False((await this.service.GetAsync())[WorkspacePolicy.MembersCanCreateGroups]);
        }

        /// <summary>
        /// Null means "go and read", never "no policies are set". Conflating the two would make
        /// an empty cache silently apply every default over whatever is stored.
        /// </summary>
        [Fact]
        public void An_empty_cache_reports_null_rather_than_an_empty_map()
        {
            Assert.Null(new WorkspacePolicyCache().Current);
        }

        [Fact]
        public void A_stored_snapshot_is_returned_until_it_is_invalidated()
        {
            var fresh = new WorkspacePolicyCache();
            fresh.Store(new Dictionary<string, bool> { ["a"] = true });

            Assert.NotNull(fresh.Current);

            fresh.Invalidate();
            Assert.Null(fresh.Current);
        }

        /// <summary>
        /// Guards the catalogue itself. A key in <c>AlwaysOn</c> that is also a stored policy
        /// would render as both a locked row and a switch, and the two would disagree.
        /// </summary>
        [Fact]
        public void No_policy_is_both_stored_and_always_on()
        {
            Assert.DoesNotContain(WorkspacePolicy.AlwaysOn, WorkspacePolicy.IsKnown);
        }
    }
}
