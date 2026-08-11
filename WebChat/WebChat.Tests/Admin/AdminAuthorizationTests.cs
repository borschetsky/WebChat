using System.Net;
using System.Threading.Tasks;
using WebChat.Models;

namespace WebChat.Tests.Admin
{
    /// <summary>
    /// What <c>[Authorize(Roles = ...)]</c> on the admin controller actually does.
    ///
    /// This is the first test written for the admin API and it is written before any of its
    /// endpoints, because the mechanism it checks is invisible from the code: the workspace
    /// role is never issued in the token. It is attached in <c>OnTokenValidated</c> from the
    /// database read that already checks the security stamp, and the authorization filter
    /// then matches it using the identity's <c>RoleClaimType</c> - a default nothing in this
    /// repo sets explicitly.
    ///
    /// The reason to spend an in-memory host on it: if that claim never arrives, the owner
    /// gets 403 exactly like everyone else. There is no error, no log line, and the obvious
    /// diagnosis is that the attribute is wrong - so the obvious fix is to weaken it.
    /// </summary>
    public class AdminAuthorizationTests : IClassFixture<AdminApiFactory>
    {
        private readonly AdminApiFactory factory;

        public AdminAuthorizationTests(AdminApiFactory factory) => this.factory = factory;

        /// <summary>
        /// Asserts the content type as well as the status, and that is not belt-and-braces.
        /// An unmatched path falls through to <c>UseSpa</c>, which answers <c>200</c> with
        /// <c>index.html</c> - so a test that checked only the status code would pass against
        /// an endpoint that does not exist. It did, before this endpoint was written.
        /// </summary>
        [Theory]
        [InlineData(WorkspaceRole.Owner)]
        [InlineData(WorkspaceRole.Admin)]
        public async Task An_administering_role_reaches_the_audit_log(string role)
        {
            var client = this.factory.ClientFor(role, out _);

            var response = await client.GetAsync("/api/admin/audit");

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        }

        [Fact]
        public async Task A_member_is_refused()
        {
            var client = this.factory.ClientFor(WorkspaceRole.Member, out _);

            var response = await client.GetAsync("/api/admin/audit");

            Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        }

        /// <summary>
        /// 401, not 403. The distinction matters to the client: it retries or signs out on
        /// one and shows "you cannot do that" on the other.
        /// </summary>
        [Fact]
        public async Task An_anonymous_caller_is_challenged()
        {
            var response = await this.factory.Client().GetAsync("/api/admin/audit");

            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        }
    }
}
