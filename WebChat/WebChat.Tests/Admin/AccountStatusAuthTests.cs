using System.Net;
using System.Threading.Tasks;
using WebChat.Models;

namespace WebChat.Tests.Admin
{
    /// <summary>
    /// That a blocked or deactivated account cannot use a token it already holds.
    ///
    /// Blocking rotates the security stamp, which alone refuses every token issued *before*
    /// the block. These tests cover the other half: a token that carries the *current* stamp
    /// and is refused purely on status. Without that, any path that issues a token without
    /// consulting the status - now or later - reopens the account.
    ///
    /// 401 rather than 403, because this is authentication failing, not authorization: the
    /// bearer is not a usable identity at all, so there is nothing to check permissions
    /// against.
    /// </summary>
    public class AccountStatusAuthTests : IClassFixture<AdminApiFactory>
    {
        private readonly AdminApiFactory factory;

        public AccountStatusAuthTests(AdminApiFactory factory) => this.factory = factory;

        [Theory]
        [InlineData(AccountStatus.Blocked)]
        [InlineData(AccountStatus.Deactivated)]
        public async Task A_denied_status_refuses_a_token_carrying_the_current_stamp(string status)
        {
            var client = this.factory.ClientFor(WorkspaceRole.Owner, out _, status);

            var response = await client.GetAsync("/api/admin/audit");

            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        }

        /// <summary>
        /// Pending is not a denial the *token* path has to make - a pending account has never
        /// signed in, so it has no token. It is still refused here, because the alternative
        /// is a status that means "never activated" silently behaving like an active one if
        /// a token ever reaches it.
        /// </summary>
        [Fact]
        public async Task Pending_is_refused_too()
        {
            var client = this.factory.ClientFor(WorkspaceRole.Owner, out _, AccountStatus.Pending);

            var response = await client.GetAsync("/api/admin/audit");

            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        }

        [Fact]
        public async Task An_active_owner_is_unaffected()
        {
            var client = this.factory.ClientFor(WorkspaceRole.Owner, out _, AccountStatus.Active);

            var response = await client.GetAsync("/api/admin/audit");

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }
    }
}
