using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using System;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using WebChat.Models;
using WebChat.Services;

namespace WebChat.Auth
{
    /// <summary>
    /// Wires every configured way of signing in behind one default scheme.
    ///
    /// <code>
    ///                       ┌─ no iss ─────────────▶ Bearer (local HS256, security stamp)
    /// request ─▶ "WebChat" ─┤
    ///   (policy scheme,     └─ iss == provider ────▶ oidc:&lt;name&gt; ─▶ IExternalLoginService
    ///    reads iss only)                                              (UserLogin → local user)
    /// </code>
    ///
    /// Both branches end in the same principal: <c>Identity.Name</c> is the local user id and
    /// a <see cref="ClaimTypes.Role"/> claim carries the workspace role, read from the row on
    /// every request. That is the whole contract with the rest of the app, which is why it
    /// does not need to know which provider was used.
    /// </summary>
    public static class AuthenticationSetup
    {
        /// <summary>The default scheme. A policy scheme: it only picks which real one runs.</summary>
        public const string SelectorScheme = "WebChat";

        /// <summary>The app's own HS256 tokens. Kept as "Bearer" so nothing that names it changes.</summary>
        public const string LocalScheme = JwtBearerDefaults.AuthenticationScheme;

        /// <summary>
        /// Carries the local user id on an external principal, and is that principal's
        /// <c>NameClaimType</c>. Not <c>name</c>: Entra puts the display name there, and every
        /// controller reads <c>Identity.Name</c> as an id.
        /// </summary>
        public const string UserIdClaim = "webchat_uid";

        /// <summary>Which provider signed the person in. Informational; nothing authorizes on it.</summary>
        public const string ProviderClaim = "webchat_provider";

        private const string HubPath = "/chat";

        public static string SchemeFor(string provider) => "oidc:" + provider;

        public static IServiceCollection AddWebChatAuthentication(
            this IServiceCollection services, AuthOptions auth, Action<JwtBearerOptions> configureLocal)
        {
            ArgumentNullException.ThrowIfNull(auth);

            services.AddSingleton(auth);
            services.AddScoped<IExternalLoginService, ExternalLoginService>();

            var fallback = auth.Local.Enabled ? LocalScheme : SchemeFor(auth.Oidc[0].Name);

            var builder = services
                .AddAuthentication(SelectorScheme)
                .AddPolicyScheme(SelectorScheme, SelectorScheme, options =>
                    options.ForwardDefaultSelector = context => Select(context, auth, fallback));

            if (auth.Local.Enabled)
            {
                builder.AddJwtBearer(LocalScheme, configureLocal);
            }

            foreach (var provider in auth.Oidc)
            {
                builder.AddJwtBearer(SchemeFor(provider.Name), options => ConfigureProvider(options, provider));
            }

            return services;
        }

        /// <summary>
        /// Routes by the token's unverified <c>iss</c>. Reading it unverified is safe: the
        /// chosen scheme then validates issuer, audience and signature in full, so a forged
        /// <c>iss</c> only selects a scheme that will refuse the forgery.
        ///
        /// No <c>iss</c> means a local token - the app has never put one in. An <c>iss</c> no
        /// provider claims falls back too, and fails there.
        /// </summary>
        internal static string Select(HttpContext context, AuthOptions auth, string fallback)
        {
            var token = BearerToken(context);
            if (token == null)
            {
                return fallback;
            }

            string issuer;
            try
            {
                var handler = new JsonWebTokenHandler();
                if (!handler.CanReadToken(token))
                {
                    return fallback;
                }
                issuer = handler.ReadJsonWebToken(token).Issuer;
            }
            catch (ArgumentException)
            {
                return fallback;
            }

            if (string.IsNullOrEmpty(issuer))
            {
                return fallback;
            }

            var provider = auth.Oidc.FirstOrDefault(p => string.Equals(p.Issuer, issuer, StringComparison.Ordinal));
            return provider != null ? SchemeFor(provider.Name) : fallback;
        }

        /// <summary>
        /// The header, or - for the hub only - the <c>access_token</c> query parameter, because
        /// a browser WebSocket cannot send headers. Mirrors <see cref="ReadHubToken"/>; the two
        /// must agree or the selector routes one token while the scheme validates another.
        /// </summary>
        private static string BearerToken(HttpContext context)
        {
            string header = context.Request.Headers.Authorization;
            if (header != null && header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            {
                return header["Bearer ".Length..].Trim();
            }

            if (context.Request.Path.StartsWithSegments(HubPath))
            {
                string query = context.Request.Query["access_token"];
                return string.IsNullOrEmpty(query) ? null : query;
            }

            return null;
        }

        public static Task ReadHubToken(MessageReceivedContext context)
        {
            var accessToken = context.Request.Query["access_token"];
            if (!string.IsNullOrEmpty(accessToken) && context.HttpContext.Request.Path.StartsWithSegments(HubPath))
            {
                context.Token = accessToken;
            }
            return Task.CompletedTask;
        }

        private static void ConfigureProvider(JwtBearerOptions options, OidcProviderOptions provider)
        {
            options.Authority = provider.Authority;

            // Raw claim names - "oid", "scp", "email" - exactly as the provider wrote them, so
            // SubjectClaim and friends in configuration mean what they say. The default mapping
            // renames them to long WS-Fed URIs and does so differently per claim.
            options.MapInboundClaims = false;

            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidIssuer = provider.Issuer,
                ValidateAudience = true,
                ValidAudiences = provider.Audiences.Where(a => !string.IsNullOrWhiteSpace(a)).ToArray(),
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                NameClaimType = UserIdClaim,
                RoleClaimType = ClaimTypes.Role,
            };

            options.Events = new JwtBearerEvents
            {
                OnMessageReceived = ReadHubToken,
                OnTokenValidated = context => OnExternalTokenValidated(context, provider),
            };
        }

        /// <summary>
        /// The external counterpart of the local scheme's stamp check, and it does the same
        /// three things on the same single row read: find the account, refuse it if it may
        /// not sign in, attach its current role.
        ///
        /// There is no security stamp here - an external token cannot carry ours. What ends an
        /// external session is the status check below (blocking takes effect on the next
        /// request) and the token's own lifetime, an hour for Entra.
        /// </summary>
        private static async Task OnExternalTokenValidated(TokenValidatedContext context, OidcProviderOptions provider)
        {
            var principal = context.Principal;
            var logger = context.HttpContext.RequestServices
                .GetRequiredService<ILoggerFactory>()
                .CreateLogger("WebChat.Auth");

            string Claim(string type) => principal?.FindFirst(type)?.Value;

            if (!string.IsNullOrWhiteSpace(provider.RequiredScope))
            {
                var scopes = (Claim("scp") ?? Claim("scope") ?? string.Empty)
                    .Split(' ', StringSplitOptions.RemoveEmptyEntries);
                if (!scopes.Contains(provider.RequiredScope, StringComparer.Ordinal))
                {
                    context.Fail($"Token lacks the '{provider.RequiredScope}' scope.");
                    return;
                }
            }

            var subject = Claim(provider.SubjectClaim);
            if (string.IsNullOrWhiteSpace(subject))
            {
                context.Fail($"Token has no '{provider.SubjectClaim}' claim.");
                return;
            }

            var emailVerified = provider.EmailIsVerified ||
                                string.Equals(Claim("email_verified"), "true", StringComparison.OrdinalIgnoreCase);

            var result = await context.HttpContext.RequestServices
                .GetRequiredService<IExternalLoginService>()
                .ResolveAsync(
                    new ExternalIdentity(provider.Name, subject, Claim(provider.EmailClaim), emailVerified, Claim(provider.NameClaim)),
                    context.HttpContext.RequestAborted);

            if (!result.Succeeded)
            {
                // Logged because the client only ever sees a bare 401. The subject is an
                // opaque id, not personal data; the email is deliberately left out.
                logger.LogWarning(
                    "External sign-in via {Provider} for subject {Subject} refused: {Error}",
                    provider.Name, subject, result.Error);
                context.Fail(result.Error);
                return;
            }

            if (!AccountStatus.CanSignIn(result.Status))
            {
                context.Fail("Account cannot sign in.");
                return;
            }

            if (principal?.Identity is ClaimsIdentity identity)
            {
                identity.AddClaim(new Claim(UserIdClaim, result.UserId));
                identity.AddClaim(new Claim(ProviderClaim, provider.Name));
                if (!string.IsNullOrEmpty(result.Role))
                {
                    identity.AddClaim(new Claim(ClaimTypes.Role, result.Role));
                }
            }
        }
    }

    /// <summary>
    /// Makes a controller answer 404 when <c>Auth:Local:Enabled</c> is false. 404 rather than
    /// 403: with local sign-in off these endpoints do not exist, and saying so is less to
    /// explain than "forbidden" for an anonymous caller.
    /// </summary>
    [AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
    public sealed class RequiresLocalAuthAttribute : Attribute, IResourceFilter
    {
        public void OnResourceExecuting(ResourceExecutingContext context)
        {
            var auth = context.HttpContext.RequestServices.GetRequiredService<AuthOptions>();
            if (!auth.Local.Enabled)
            {
                context.Result = new NotFoundResult();
            }
        }

        public void OnResourceExecuted(ResourceExecutedContext context)
        {
        }
    }
}
