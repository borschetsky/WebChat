using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;
using WebChat.Auth;
using WebChat.Tests.Admin;

namespace WebChat.Tests.Auth
{
    /// <summary>
    /// The real host with two external OpenID Connect providers configured, plus the local
    /// password scheme, so a test can present a token from any of them.
    ///
    /// **Nothing here talks to Microsoft.** Each provider's discovery document is replaced by
    /// a static one carrying a test signing key, so the tokens below are validated by the real
    /// JwtBearer handler - issuer, audience, lifetime, signature - without a network call.
    /// What is being tested is everything after that: the scheme selector, the scope check,
    /// the claim mapping and the account resolution, which is where every interesting failure
    /// lives.
    ///
    /// Two providers because email trust is per provider, and the difference between them is
    /// an account-takeover question: <c>verified</c> vouches for the address (as an Entra
    /// External ID tenant does), <c>unverified</c> does not.
    /// </summary>
    public class ExternalLoginFactory : AdminApiFactory
    {
        public const string Verified = "verified";
        public const string Unverified = "unverified";

        public const string VerifiedIssuer = "https://verified.test/tenant/v2.0";
        public const string UnverifiedIssuer = "https://unverified.test/v2.0";
        public const string Audience = "11111111-2222-3333-4444-555555555555";
        public const string Scope = "chat.access";

        private static readonly SymmetricSecurityKey SigningKey =
            new(Encoding.UTF8.GetBytes("external-provider-test-key-at-least-32-bytes"));

        /// <summary>Overridden by <see cref="LocalDisabledFactory"/>.</summary>
        protected virtual bool LocalEnabled => true;

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);

            // App configuration, not UseSetting. UseSetting writes *host* settings, and
            // appsettings.json is loaded after them and wins - it declares
            // Auth:Local:Enabled = true, so a UseSetting("false") was silently overridden and
            // the local-disabled tests ran with local sign-in on. A source added here is added
            // last, so it is the one that counts.
            var settings = new Dictionary<string, string?>
            {
                ["Auth:Local:Enabled"] = this.LocalEnabled ? "true" : "false",
            };
            Provider(settings, 0, Verified, VerifiedIssuer, subjectClaim: "oid", emailIsVerified: true);
            Provider(settings, 1, Unverified, UnverifiedIssuer, subjectClaim: "sub", emailIsVerified: false);

            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(settings));

            builder.ConfigureTestServices(services =>
            {
                StaticDiscovery(services, Verified, VerifiedIssuer);
                StaticDiscovery(services, Unverified, UnverifiedIssuer);
            });
        }

        private static void Provider(
            IDictionary<string, string?> settings, int index, string name, string issuer, string subjectClaim, bool emailIsVerified)
        {
            var prefix = $"Auth:Oidc:{index}:";
            settings[prefix + "Name"] = name;
            settings[prefix + "Authority"] = issuer;
            settings[prefix + "Issuer"] = issuer;
            settings[prefix + "Audiences:0"] = Audience;
            settings[prefix + "RequiredScope"] = Scope;
            settings[prefix + "SubjectClaim"] = subjectClaim;
            settings[prefix + "EmailIsVerified"] = emailIsVerified ? "true" : "false";
        }

        private static void StaticDiscovery(IServiceCollection services, string provider, string issuer)
        {
            services.PostConfigure<JwtBearerOptions>(AuthenticationSetup.SchemeFor(provider), options =>
            {
                var configuration = new OpenIdConnectConfiguration { Issuer = issuer };
                configuration.SigningKeys.Add(SigningKey);
                options.ConfigurationManager = new StaticConfigurationManager<OpenIdConnectConfiguration>(configuration);
            });
        }

        /// <summary>
        /// A token shaped like the one Entra issues to the SPA: <c>oid</c> or <c>sub</c> for
        /// the person, <c>scp</c> as a space-separated list. Every argument can be nulled out
        /// to produce the malformed variants.
        /// </summary>
        public static string Token(
            string issuer = VerifiedIssuer,
            string? subject = null,
            string? email = null,
            string? name = null,
            string? scope = Scope,
            string audience = Audience,
            string subjectClaim = "oid")
        {
            var claims = new Dictionary<string, object>
            {
                [subjectClaim] = subject ?? Guid.NewGuid().ToString(),
            };
            if (email != null) claims["email"] = email;
            if (name != null) claims["name"] = name;
            if (scope != null) claims["scp"] = scope;

            return new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
            {
                Issuer = issuer,
                Audience = audience,
                Claims = claims,
                Expires = DateTime.UtcNow.AddMinutes(30),
                SigningCredentials = new SigningCredentials(SigningKey, SecurityAlgorithms.HmacSha256),
            });
        }

        public HttpClient ClientWithToken(string token)
        {
            var client = this.Client();
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
            return client;
        }
    }

    /// <summary>The same providers with the local password scheme switched off.</summary>
    public class LocalDisabledFactory : ExternalLoginFactory
    {
        protected override bool LocalEnabled => false;
    }
}
