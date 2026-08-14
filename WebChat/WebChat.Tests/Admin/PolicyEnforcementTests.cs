using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using WebChat.Models;
using WebChat.Services;

namespace WebChat.Tests.Admin
{
    /// <summary>
    /// The half of #75 that makes the switch worth having.
    ///
    /// A policy that is stored and read back is not enforced; it is a preference nobody
    /// consults. These go through the real host to the endpoint the client actually calls, so
    /// what is asserted is that turning the switch off changes what the API does - which is the
    /// issue's entire definition of done.
    /// </summary>
    public class PolicyEnforcementTests : IClassFixture<AdminApiFactory>
    {
        private readonly AdminApiFactory factory;

        public PolicyEnforcementTests(AdminApiFactory factory)
        {
            this.factory = factory;
        }

        /// <summary>
        /// The cache is a process singleton and this fixture is shared across the class, so a
        /// test that changed a policy would otherwise leak into the next one through it - and
        /// through the settings row underneath.
        /// </summary>
        private async Task SetPolicyAsync(string key, bool value)
        {
            using var scope = this.factory.Services.CreateScope();
            var policies = scope.ServiceProvider.GetRequiredService<IWorkspacePolicyService>();
            await policies.SetAsync("test-admin", key, value);
        }

        private static HttpContent Group(params string[] memberIds) =>
            JsonContent.Create(new { Name = "A group", MemberIds = new List<string>(memberIds) });

        [Fact]
        public async Task A_member_can_create_a_group_while_the_policy_allows_it()
        {
            await this.SetPolicyAsync(WorkspacePolicy.MembersCanCreateGroups, true);

            var creator = this.factory.ClientFor(WorkspaceRole.Member, out _);
            this.factory.ClientFor(WorkspaceRole.Member, out var other).Dispose();

            var response = await creator.PostAsync("/api/hey/creategroup", Group(other));

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }

        [Fact]
        public async Task Turning_the_policy_off_actually_refuses_a_member()
        {
            await this.SetPolicyAsync(WorkspacePolicy.MembersCanCreateGroups, false);

            var creator = this.factory.ClientFor(WorkspaceRole.Member, out _);
            this.factory.ClientFor(WorkspaceRole.Member, out var other).Dispose();

            var response = await creator.PostAsync("/api/hey/creategroup", Group(other));

            Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);

            // A code the client can branch on, not a sentence - same rule as every other
            // refusal in this API.
            using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            Assert.Equal("groups_admin_only", body.RootElement.GetProperty("error").GetString());

            await this.SetPolicyAsync(WorkspacePolicy.MembersCanCreateGroups, true);
        }

        /// <summary>
        /// A workspace that turned this off still has to be able to create a group, or the
        /// policy is a way to disable the feature outright rather than to restrict it.
        /// </summary>
        [Fact]
        public async Task An_admin_creates_groups_whatever_the_policy_says()
        {
            await this.SetPolicyAsync(WorkspacePolicy.MembersCanCreateGroups, false);

            var admin = this.factory.ClientFor(WorkspaceRole.Admin, out _);
            this.factory.ClientFor(WorkspaceRole.Member, out var other).Dispose();

            var response = await admin.PostAsync("/api/hey/creategroup", Group(other));

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);

            await this.SetPolicyAsync(WorkspacePolicy.MembersCanCreateGroups, true);
        }

        [Fact]
        public async Task An_owner_creates_groups_whatever_the_policy_says()
        {
            await this.SetPolicyAsync(WorkspacePolicy.MembersCanCreateGroups, false);

            var owner = this.factory.ClientFor(WorkspaceRole.Owner, out _);
            this.factory.ClientFor(WorkspaceRole.Member, out var other).Dispose();

            var response = await owner.PostAsync("/api/hey/creategroup", Group(other));

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);

            await this.SetPolicyAsync(WorkspacePolicy.MembersCanCreateGroups, true);
        }

        [Fact]
        public async Task A_member_cannot_read_the_policies()
        {
            var member = this.factory.ClientFor(WorkspaceRole.Member, out _);

            var response = await member.GetAsync("/api/admin/policies");

            Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        }

        [Fact]
        public async Task A_member_cannot_change_a_policy()
        {
            var member = this.factory.ClientFor(WorkspaceRole.Member, out _);

            var response = await member.PostAsync(
                $"/api/admin/policies/{WorkspacePolicy.MembersCanCreateGroups}",
                JsonContent.Create(new { Value = false }));

            Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        }

        /// <summary>
        /// The response is what tells the client which rows are real switches, so its shape is
        /// the contract that keeps the screen honest.
        /// </summary>
        [Fact]
        public async Task The_endpoint_reports_the_enforced_policies_and_the_always_on_ones()
        {
            var admin = this.factory.ClientFor(WorkspaceRole.Admin, out _);

            var response = await admin.GetAsync("/api/admin/policies");
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);

            // Without this the SPA fallback's index.html would satisfy every assertion below
            // that only checks a status code.
            Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);

            using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());

            var policies = body.RootElement.GetProperty("policies");
            Assert.True(policies.TryGetProperty(WorkspacePolicy.MembersCanCreateGroups, out _));

            var alwaysOn = body.RootElement.GetProperty("alwaysOn");
            Assert.Equal(WorkspacePolicy.AlwaysOn.Count, alwaysOn.GetArrayLength());
        }

        [Fact]
        public async Task An_unknown_policy_key_is_refused_by_the_endpoint()
        {
            var admin = this.factory.ClientFor(WorkspaceRole.Admin, out _);

            var response = await admin.PostAsync(
                "/api/admin/policies/members_can_teleport",
                JsonContent.Create(new { Value = true }));

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

            using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            Assert.Equal("unknown_policy", body.RootElement.GetProperty("error").GetString());
        }

        /// <summary>
        /// A missing value must not read as false. With a non-nullable bool it would, and a
        /// malformed request would quietly turn a policy off.
        /// </summary>
        [Fact]
        public async Task A_request_with_no_value_is_refused_rather_than_read_as_false()
        {
            var admin = this.factory.ClientFor(WorkspaceRole.Admin, out _);

            var response = await admin.PostAsync(
                $"/api/admin/policies/{WorkspacePolicy.MembersCanCreateGroups}",
                JsonContent.Create(new { }));

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

            using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            Assert.Equal("value_required", body.RootElement.GetProperty("error").GetString());

            // And it really did not change anything.
            Assert.True(await this.IsEnabledAsync(WorkspacePolicy.MembersCanCreateGroups));
        }

        private async Task<bool> IsEnabledAsync(string key)
        {
            using var scope = this.factory.Services.CreateScope();
            return await scope.ServiceProvider
                .GetRequiredService<IWorkspacePolicyService>()
                .IsEnabledAsync(key);
        }
    }
}
