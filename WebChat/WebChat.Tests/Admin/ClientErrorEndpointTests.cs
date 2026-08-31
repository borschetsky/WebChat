using System.Net;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading.Tasks;
using WebChat.Models;

namespace WebChat.Tests.Admin
{
    /// <summary>
    /// The two endpoints, through the real host.
    ///
    /// Worth an in-memory host rather than a direct controller call for the same reason
    /// <see cref="AdminAuthorizationTests"/> is: what is being checked is the chain that turns
    /// a bearer token into a role and an identity, none of which a hand-built
    /// <c>ClaimsPrincipal</c> would exercise. And one property here is genuinely surprising
    /// otherwise - <c>POST api/client-errors</c> is reachable by an ordinary **member**, which
    /// is the only endpoint in this feature that is not administrative.
    /// </summary>
    public class ClientErrorEndpointTests : IClassFixture<AdminApiFactory>
    {
        private readonly AdminApiFactory factory;

        public ClientErrorEndpointTests(AdminApiFactory factory) => this.factory = factory;

        private static object AReport() => new
        {
            level = "fatal",
            name = "TypeError",
            message = "Cannot read properties of undefined",
            component = "AdminOverview",
            function = "render",
            route = "/admin",
            release = "web@0.1.0",
            stack = new[] { "TypeError: Cannot read properties of undefined" },
            crumbs = new[] { new { t = "12:04:02", k = "ui.click", v = "button" } },
        };

        /// <summary>
        /// 202 and nothing else. The report is queued, not written, so this asserts the
        /// contract the client depends on: the call returns before any database work happens.
        /// </summary>
        [Fact]
        public async Task A_member_may_report_an_error_and_is_accepted()
        {
            var client = this.factory.ClientFor(WorkspaceRole.Member, out _);

            var response = await client.PostAsJsonAsync("/api/client-errors", AReport());

            Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        }

        /// <summary>
        /// The consequence worth naming: an error on the sign-in or invitation screens is not
        /// reported at all, because nobody is signed in. The alternative is an unauthenticated
        /// write endpoint anyone on the internet can put rows in.
        /// </summary>
        [Fact]
        public async Task An_anonymous_report_is_refused()
        {
            var response = await this.factory.Client()
                .PostAsJsonAsync("/api/client-errors", AReport());

            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        }

        /// <summary>
        /// The name is half the fingerprint, so a report without one would group every
        /// nameless failure in the app into a single meaningless row.
        /// </summary>
        [Fact]
        public async Task A_report_with_no_error_name_is_refused()
        {
            var client = this.factory.ClientFor(WorkspaceRole.Member, out _);

            var response = await client.PostAsJsonAsync(
                "/api/client-errors", new { message = "something went wrong" });

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }

        [Theory]
        [InlineData(WorkspaceRole.Owner)]
        [InlineData(WorkspaceRole.Admin)]
        public async Task An_administering_role_reaches_the_errors_section(string role)
        {
            var client = this.factory.ClientFor(role, out _);

            var response = await client.GetAsync("/api/admin/errors");

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);

            // The content type as well as the status, for the reason AdminAuthorizationTests
            // gives: an unmatched path falls through to UseSpa and answers 200 with index.html.
            Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        }

        /// <summary>
        /// The route guard on the client is navigation, never authorization. Reading other
        /// people's stack traces is an administrative act and the server is what decides it.
        /// </summary>
        [Fact]
        public async Task A_member_cannot_read_the_errors_section()
        {
            var client = this.factory.ClientFor(WorkspaceRole.Member, out _);

            var response = await client.GetAsync("/api/admin/errors");

            Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        }

        [Fact]
        public async Task A_member_cannot_triage()
        {
            var client = this.factory.ClientFor(WorkspaceRole.Member, out _);

            var response = await client.PostAsJsonAsync(
                "/api/admin/errors/any-id/status", new { status = "resolved" });

            Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        }

        [Fact]
        public async Task Triaging_something_that_is_not_there_is_refused_rather_than_500()
        {
            var client = this.factory.ClientFor(WorkspaceRole.Owner, out _);

            var response = await client.PostAsJsonAsync(
                "/api/admin/errors/no-such-issue/status", new { status = "resolved" });

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }

        [Fact]
        public async Task Triaging_with_an_invented_status_is_refused()
        {
            var client = this.factory.ClientFor(WorkspaceRole.Owner, out _);

            var response = await client.PostAsJsonAsync(
                "/api/admin/errors/no-such-issue/status", new { status = "wontfix" });

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }

        /// <summary>
        /// The whole round trip, and the one test that proves the background drain loop is
        /// actually running in a real host rather than merely registered.
        /// </summary>
        [Fact]
        public async Task A_reported_error_reaches_the_errors_section()
        {
            var member = this.factory.ClientFor(WorkspaceRole.Member, out _);
            var owner = this.factory.ClientFor(WorkspaceRole.Owner, out _);

            var report = new
            {
                level = "fatal",
                name = "IngestionRoundTripError",
                message = "reported through the real host",
                component = "ClientErrorEndpointTests",
                function = "render",
                route = "/admin",
                release = "web@0.1.0",
                stack = new[] { "IngestionRoundTripError: reported through the real host" },
                crumbs = new[] { new { t = "12:04:02", k = "ui.click", v = "button" } },
            };

            Assert.Equal(
                HttpStatusCode.Accepted,
                (await member.PostAsJsonAsync("/api/client-errors", report)).StatusCode);

            // The endpoint answers before the write, so the read has to be retried. That is the
            // feature, not a flaky test: if this ever needed no wait at all, the write would be
            // happening on the request thread.
            var found = await Eventually(async () =>
            {
                var body = await owner.GetStringAsync("/api/admin/errors");
                return body.Contains("IngestionRoundTripError") ? body : (string?)null;
            });

            Assert.NotNull(found);
            Assert.Contains("ClientErrorEndpointTests in render", found);
        }

        private static async Task<string?> Eventually(System.Func<Task<string?>> read)
        {
            for (var attempt = 0; attempt < 50; attempt++)
            {
                var result = await read();
                if (result != null) return result;

                await Task.Delay(100);
            }

            return null;
        }
    }
}
