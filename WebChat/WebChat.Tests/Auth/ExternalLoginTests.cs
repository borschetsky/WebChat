using System;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using WebChat.Connection;
using WebChat.Models;
using WebChat.Services;
using Xunit;

namespace WebChat.Tests.Auth
{
    /// <summary>
    /// Signing in with an external provider's token: which account it resolves to, and when
    /// it must refuse.
    ///
    /// The assertion most of these lean on is that <c>/api/users/getprofile</c> answers with
    /// the *local* id. Every controller reads <c>User.Identity.Name</c> as that id; an external
    /// token whose name claim resolved to anything else - the display name, the oid - would
    /// make each of them quietly act on the wrong row, which is the shape of #99.
    /// </summary>
    public class ExternalLoginTests : IClassFixture<ExternalLoginFactory>
    {
        private readonly ExternalLoginFactory factory;

        public ExternalLoginTests(ExternalLoginFactory factory) => this.factory = factory;

        private static string NewEmail() => $"{Guid.NewGuid():N}@example.com";

        private async Task<string> ProfileId(string token)
        {
            var response = await this.factory.ClientWithToken(token).GetAsync("/api/users/getprofile");
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);

            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            return json.RootElement.EnumerateObject()
                .First(p => string.Equals(p.Name, "id", StringComparison.OrdinalIgnoreCase))
                .Value.GetString()!;
        }

        private async Task<HttpStatusCode> Status(string token) =>
            (await this.factory.ClientWithToken(token).GetAsync("/api/users/getprofile")).StatusCode;

        private T Db<T>(Func<WebChatContext, T> query)
        {
            using var scope = this.factory.Services.CreateScope();
            return query(scope.ServiceProvider.GetRequiredService<WebChatContext>());
        }

        private User Insert(string email, bool confirmed = true, string? username = null, string status = AccountStatus.Active)
        {
            var user = new User
            {
                Id = Guid.NewGuid().ToString(),
                Username = username ?? Guid.NewGuid().ToString("N")[..12],
                Email = email,
                Password = "local-password-hash",
                Role = WorkspaceRole.Member,
                Status = status,
                EmailConfirmed = confirmed,
                CreatedOn = DateTime.UtcNow,
                SecurityStamp = Guid.NewGuid().ToString(),
            };
            this.Db(db => { db.User.Add(user); return db.SaveChanges(); });
            return user;
        }

        [Fact]
        public async Task First_sign_in_creates_an_active_confirmed_member_and_names_it_by_local_id()
        {
            var subject = Guid.NewGuid().ToString();
            var email = NewEmail();

            var id = await this.ProfileId(ExternalLoginFactory.Token(subject: subject, email: email, name: "Ada Lovelace"));

            var login = this.Db(db => db.UserLogin.Single(l => l.Subject == subject));
            Assert.Equal(ExternalLoginFactory.Verified, login.Provider);
            Assert.Equal(login.UserId, id);

            var user = this.Db(db => db.User.Single(u => u.Id == id));
            Assert.Equal(email, user.Email);
            Assert.Equal(WorkspaceRole.Member, user.Role);
            Assert.Equal(AccountStatus.Active, user.Status);
            Assert.True(user.EmailConfirmed);
            Assert.Equal(AuthService.NoLocalPassword, user.Password);
            Assert.False(string.IsNullOrWhiteSpace(user.Username));
        }

        [Fact]
        public async Task Signing_in_again_reuses_the_same_account()
        {
            var token = ExternalLoginFactory.Token(email: NewEmail(), name: "Repeat");

            var first = await this.ProfileId(token);
            var second = await this.ProfileId(token);

            Assert.Equal(first, second);
            Assert.Equal(1, this.Db(db => db.UserLogin.Count(l => l.UserId == first)));
        }

        [Fact]
        public async Task A_vouched_email_links_to_the_existing_confirmed_account()
        {
            var existing = this.Insert(NewEmail());

            var id = await this.ProfileId(ExternalLoginFactory.Token(email: existing.Email.ToUpperInvariant()));

            Assert.Equal(existing.Id, id);
            // The local password survives linking: the person can still use either.
            Assert.Equal("local-password-hash", this.Db(db => db.User.Single(u => u.Id == id).Password));
        }

        /// <summary>
        /// An unconfirmed local registration proves nothing about who typed the address - it
        /// may be somebody squatting on it. The provider has just proved the address belongs to
        /// the person signing in, so they get the row, and the squatter's password must stop
        /// working. Linking without clearing it would hand the squatter a confirmed account.
        /// </summary>
        [Fact]
        public async Task An_unconfirmed_local_registration_is_taken_over_and_its_password_cleared()
        {
            var squatted = this.Insert(NewEmail(), confirmed: false);

            var id = await this.ProfileId(ExternalLoginFactory.Token(email: squatted.Email));

            Assert.Equal(squatted.Id, id);
            var user = this.Db(db => db.User.Single(u => u.Id == id));
            Assert.Equal(AuthService.NoLocalPassword, user.Password);
            Assert.True(user.EmailConfirmed);
            Assert.NotEqual(squatted.SecurityStamp, user.SecurityStamp);
        }

        [Fact]
        public async Task A_provider_that_does_not_vouch_for_email_cannot_link_to_an_existing_account()
        {
            var existing = this.Insert(NewEmail());

            var status = await this.Status(ExternalLoginFactory.Token(
                issuer: ExternalLoginFactory.UnverifiedIssuer, subjectClaim: "sub", email: existing.Email));

            Assert.Equal(HttpStatusCode.Unauthorized, status);
            Assert.False(this.Db(db => db.UserLogin.Any(l => l.UserId == existing.Id)));
        }

        [Fact]
        public async Task An_unvouched_email_still_creates_a_new_unconfirmed_account_when_unused()
        {
            var email = NewEmail();

            var id = await this.ProfileId(ExternalLoginFactory.Token(
                issuer: ExternalLoginFactory.UnverifiedIssuer, subjectClaim: "sub", email: email));

            var user = this.Db(db => db.User.Single(u => u.Id == id));
            Assert.Equal(email, user.Email);
            Assert.False(user.EmailConfirmed);
        }

        [Fact]
        public async Task An_account_already_linked_to_another_identity_of_the_same_provider_is_refused()
        {
            var email = NewEmail();
            var owner = await this.ProfileId(ExternalLoginFactory.Token(email: email));

            var status = await this.Status(ExternalLoginFactory.Token(email: email));

            Assert.Equal(HttpStatusCode.Unauthorized, status);
            Assert.Equal(1, this.Db(db => db.UserLogin.Count(l => l.UserId == owner)));
        }

        [Fact]
        public async Task A_blocked_account_is_refused()
        {
            var token = ExternalLoginFactory.Token(email: NewEmail());
            var id = await this.ProfileId(token);
            this.Db(db =>
            {
                db.User.Single(u => u.Id == id).Status = AccountStatus.Blocked;
                return db.SaveChanges();
            });

            Assert.Equal(HttpStatusCode.Unauthorized, await this.Status(token));
        }

        [Fact]
        public async Task A_token_without_an_email_cannot_create_an_account()
        {
            Assert.Equal(HttpStatusCode.Unauthorized, await this.Status(ExternalLoginFactory.Token(email: (string?)null)));
        }

        [Fact]
        public async Task A_token_without_the_required_scope_is_refused()
        {
            var token = ExternalLoginFactory.Token(email: NewEmail(), scope: "openid profile");
            Assert.Equal(HttpStatusCode.Unauthorized, await this.Status(token));
        }

        [Fact]
        public async Task A_token_for_another_audience_is_refused()
        {
            var token = ExternalLoginFactory.Token(email: NewEmail(), audience: "someone-elses-api");
            Assert.Equal(HttpStatusCode.Unauthorized, await this.Status(token));
        }

        [Fact]
        public async Task A_token_from_an_unconfigured_issuer_is_refused()
        {
            var token = ExternalLoginFactory.Token(issuer: "https://evil.test/v2.0", email: NewEmail());
            Assert.Equal(HttpStatusCode.Unauthorized, await this.Status(token));
        }

        [Fact]
        public async Task A_taken_username_gets_a_distinct_one()
        {
            this.Insert(NewEmail(), username: "grace");

            var id = await this.ProfileId(ExternalLoginFactory.Token(email: NewEmail(), name: "Grace"));

            var username = this.Db(db => db.User.Single(u => u.Id == id).Username);
            Assert.NotEqual("grace", username, StringComparer.OrdinalIgnoreCase);
            Assert.StartsWith("grace", username, StringComparison.OrdinalIgnoreCase);
        }

        /// <summary>
        /// The role is attached from the row on every request, exactly as for a local token -
        /// so an owner signing in externally reaches the admin console, and a demotion takes
        /// effect on their next request.
        /// </summary>
        [Fact]
        public async Task The_workspace_role_comes_from_the_row()
        {
            var token = ExternalLoginFactory.Token(email: NewEmail());
            var id = await this.ProfileId(token);
            var client = this.factory.ClientWithToken(token);

            Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/admin/audit")).StatusCode);

            this.Db(db =>
            {
                db.User.Single(u => u.Id == id).Role = WorkspaceRole.Owner;
                return db.SaveChanges();
            });

            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/admin/audit")).StatusCode);
        }

        /// <summary>
        /// The browser's WebSocket cannot send an Authorization header, so the hub reads the
        /// token from the query string. The scheme selector has to look there too, or every
        /// external user loses real-time delivery while REST keeps working.
        /// </summary>
        [Fact]
        public async Task The_hub_accepts_an_external_token_from_the_query_string()
        {
            var token = ExternalLoginFactory.Token(email: NewEmail());

            var response = await this.factory.Client().PostAsync(
                $"/chat/negotiate?negotiateVersion=1&access_token={token}", content: null);

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }

        [Fact]
        public async Task A_local_token_still_works_beside_the_external_providers()
        {
            var client = this.factory.ClientFor(WorkspaceRole.Owner, out _);

            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/admin/audit")).StatusCode);
        }

        /// <summary>
        /// An account created by an external sign-in has no password, and the password column
        /// holds a marker rather than a hash. Feeding that marker to the hash verifier used to
        /// be a 500 waiting to happen; it must read as an ordinary wrong password.
        /// </summary>
        [Fact]
        public async Task Password_sign_in_to_an_external_only_account_is_an_ordinary_failure()
        {
            var email = NewEmail();
            await this.ProfileId(ExternalLoginFactory.Token(email: email));

            var response = await this.factory.Client().PostAsync(
                "/api/auth/login",
                new StringContent(
                    JsonSerializer.Serialize(new { identifier = email, password = AuthService.NoLocalPassword }),
                    Encoding.UTF8,
                    "application/json"));

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }
    }

    /// <summary>
    /// <c>Auth:Local:Enabled = false</c>: the password endpoints disappear and a locally
    /// signed token is no longer accepted, while external sign-in carries on.
    /// </summary>
    public class LocalAuthDisabledTests : IClassFixture<LocalDisabledFactory>
    {
        private readonly LocalDisabledFactory factory;

        public LocalAuthDisabledTests(LocalDisabledFactory factory) => this.factory = factory;

        [Fact]
        public async Task The_password_endpoints_answer_404()
        {
            var response = await this.factory.Client().PostAsync(
                "/api/auth/login",
                new StringContent("{\"identifier\":\"a@b.c\",\"password\":\"whatever\"}", Encoding.UTF8, "application/json"));

            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        }

        [Fact]
        public async Task A_locally_signed_token_is_refused()
        {
            var client = this.factory.ClientFor(WorkspaceRole.Owner, out _);

            Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/admin/audit")).StatusCode);
        }

        [Fact]
        public async Task External_sign_in_still_works()
        {
            var client = this.factory.ClientWithToken(ExternalLoginFactory.Token(email: $"{Guid.NewGuid():N}@example.com"));

            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/users/getprofile")).StatusCode);
        }
    }
}
