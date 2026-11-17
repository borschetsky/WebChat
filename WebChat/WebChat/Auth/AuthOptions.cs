using Microsoft.Extensions.Configuration;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace WebChat.Auth
{
    /// <summary>
    /// The <c>Auth</c> configuration section: which ways of signing in this deployment accepts.
    ///
    /// <code>
    /// "Auth": {
    ///   "Local": { "Enabled": true },
    ///   "Oidc": [
    ///     { "Name": "entra",
    ///       "Authority": "https://webchatdev.ciamlogin.com/&lt;tenant-id&gt;/v2.0",
    ///       "Issuer":    "https://&lt;tenant-id&gt;.ciamlogin.com/&lt;tenant-id&gt;/v2.0",
    ///       "Audiences": [ "&lt;api-client-id&gt;" ],
    ///       "RequiredScope": "chat.access",
    ///       "SubjectClaim": "oid",
    ///       "EmailIsVerified": true }
    ///   ]
    /// }
    /// </code>
    ///
    /// Switching provider is a change here and nowhere else: every entry becomes its own
    /// bearer scheme, and a token is routed to the one whose <see cref="OidcProviderOptions.Issuer"/>
    /// it names. The application past authentication never learns which provider it was.
    /// </summary>
    public sealed class AuthOptions
    {
        public const string SectionName = "Auth";

        public LocalAuthOptions Local { get; set; } = new();

        public List<OidcProviderOptions> Oidc { get; set; } = new();

        public static AuthOptions From(IConfiguration configuration) =>
            configuration.GetSection(SectionName).Get<AuthOptions>() ?? new AuthOptions();

        /// <summary>
        /// Every reason this configuration cannot work, so boot fails naming all of them at
        /// once rather than one per deploy. Checked in every environment, Development
        /// included: a provider half-configured on a laptop is as broken as one in production.
        /// </summary>
        public IReadOnlyList<string> Problems()
        {
            var problems = new List<string>();

            if (!this.Local.Enabled && this.Oidc.Count == 0)
            {
                problems.Add("Auth: local sign-in is disabled and no Auth:Oidc provider is configured, so nobody could sign in");
            }

            for (var i = 0; i < this.Oidc.Count; i++)
            {
                var p = this.Oidc[i];
                var at = $"Auth:Oidc:{i}";

                if (string.IsNullOrWhiteSpace(p.Name) || !OidcProviderOptions.NamePattern.IsMatch(p.Name))
                    problems.Add($"{at}:Name must be 1-50 lowercase letters, digits or hyphens");
                if (!Uri.TryCreate(p.Authority, UriKind.Absolute, out _))
                    problems.Add($"{at}:Authority must be an absolute URL");
                if (string.IsNullOrWhiteSpace(p.Issuer))
                    problems.Add($"{at}:Issuer is required - it is how a token is routed to this provider");
                if (p.Audiences == null || p.Audiences.Count(a => !string.IsNullOrWhiteSpace(a)) == 0)
                    problems.Add($"{at}:Audiences needs at least one value");
                if (string.IsNullOrWhiteSpace(p.SubjectClaim))
                    problems.Add($"{at}:SubjectClaim must not be empty");
            }

            foreach (var dup in this.Oidc.GroupBy(p => p.Name).Where(g => g.Count() > 1))
                problems.Add($"Auth:Oidc: provider name '{dup.Key}' is used more than once");
            foreach (var dup in this.Oidc.GroupBy(p => p.Issuer).Where(g => g.Count() > 1))
                problems.Add($"Auth:Oidc: issuer '{dup.Key}' is used more than once, so its tokens cannot be routed");

            return problems;
        }
    }

    public sealed class LocalAuthOptions
    {
        /// <summary>
        /// The app's own sign-in: passwords, HS256 tokens, email confirmation and reset. On by
        /// default so a deployment that has never heard of this section behaves as it always
        /// has. Off, the <c>api/auth</c> endpoints answer 404 and a locally signed token is
        /// refused - <c>JWTSecretKey</c> is then no longer required.
        /// </summary>
        public bool Enabled { get; set; } = true;
    }

    public sealed class OidcProviderOptions
    {
        internal static readonly Regex NamePattern = new("^[a-z0-9-]{1,50}$", RegexOptions.CultureInvariant);

        /// <summary>
        /// Stored in <c>UserLogin.Provider</c>, so it must never change once anybody has signed
        /// in with it - renaming orphans every link. Lowercase and short on purpose.
        /// </summary>
        public string Name { get; set; }

        /// <summary>Where the discovery document and signing keys are fetched from.</summary>
        public string Authority { get; set; }

        /// <summary>
        /// The exact <c>iss</c> the provider puts in its tokens. Configured rather than read
        /// from discovery because the selector has to pick a scheme *before* any scheme has
        /// loaded its metadata. For Entra External ID it is
        /// <c>https://&lt;tenant-id&gt;.ciamlogin.com/&lt;tenant-id&gt;/v2.0</c> - the tenant id
        /// as the host, not the tenant's name.
        /// </summary>
        public string Issuer { get; set; }

        /// <summary>
        /// Accepted <c>aud</c> values. Entra v2 access tokens carry the API's client id, not
        /// its <c>api://</c> URI, so list the client id.
        /// </summary>
        public List<string> Audiences { get; set; } = new();

        /// <summary>
        /// A delegated scope the token must carry in <c>scp</c> (or <c>scope</c>). Empty means
        /// no check. Without it, any token the provider issued for this audience is accepted,
        /// including ones a different client obtained for a narrower purpose.
        /// </summary>
        public string RequiredScope { get; set; }

        /// <summary>The provider's stable person id. <c>oid</c> for Entra, <c>sub</c> elsewhere.</summary>
        public string SubjectClaim { get; set; } = "sub";

        public string EmailClaim { get; set; } = "email";

        public string NameClaim { get; set; } = "name";

        /// <summary>
        /// True when every address this provider issues has been proved to belong to the person
        /// - an Entra External ID tenant whose only sign-up methods verify the email. False
        /// means only a per-token <c>email_verified: true</c> counts.
        ///
        /// **This decides whether a token can be linked to an existing account by email**, so
        /// it is the account-takeover switch. Turn it on only for a provider that verifies, and
        /// revisit it whenever an identity provider is added to that tenant.
        /// </summary>
        public bool EmailIsVerified { get; set; }
    }
}
