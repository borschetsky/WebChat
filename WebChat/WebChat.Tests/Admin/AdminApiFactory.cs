using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using WebChat;
using WebChat.Connection;
using WebChat.Models;
using WebChat.Services;

namespace WebChat.Tests.Admin
{
    /// <summary>
    /// Boots the real host in memory so a test can prove what <c>[Authorize(Roles = ...)]</c>
    /// actually does.
    ///
    /// **Why the whole host rather than calling the controller directly.** The thing worth
    /// testing here is not the controller body - it is the chain that turns a bearer token
    /// into a role: <c>JwtBearer</c> validates it, <c>OnTokenValidated</c> reads the row and
    /// attaches a <see cref="System.Security.Claims.ClaimTypes.Role"/> claim, and the
    /// authorization filter compares that against the attribute using the identity's
    /// <c>RoleClaimType</c>. Any one of those three can be wrong in a way a unit test on a
    /// hand-built <c>ClaimsPrincipal</c> cannot see, because the test would be constructing
    /// the very thing it is trying to verify.
    ///
    /// The failure mode this exists to catch is quiet: if the role claim never arrives,
    /// *everybody* gets 403 - including the owner - which reads as "the attribute is wrong"
    /// and invites deleting it.
    ///
    /// Development environment, because <c>Startup.ValidateRequiredConfiguration</c> returns
    /// early there; outside it the host refuses to start without R2, SMTP and the rest, none
    /// of which this is testing.
    /// </summary>
    public class AdminApiFactory : WebApplicationFactory<Startup>
    {
        /// <summary>
        /// Any 32+ byte key will do - nothing here validates a token this factory did not
        /// also issue. It must be constant for the lifetime of the factory, which is why it
        /// is not regenerated per call.
        /// </summary>
        private const string JwtKey = "test-only-signing-key-at-least-32-bytes-long";

        // Held open for the lifetime of the factory: an in-memory SQLite database exists only
        // while a connection to it does, and closing the last one drops the schema.
        private readonly SqliteConnection connection = new("DataSource=:memory:");

        private readonly IAuthService auth = new AuthService(JwtKey, 3600);

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            // Deliberately *not* Development. In Development `UseSpa` proxies every unmatched
            // request to the Vite dev server, and with no dev server running a request that
            // does not match an endpoint - a 404, or an endpoint that has not been written
            // yet - sits in the proxy's retry loop for over a minute before answering 502.
            // That turns "this route does not exist" into a two-minute test.
            //
            // The price is that `ValidateRequiredConfiguration` now runs for real, so both
            // keys it insists on have to be supplied. That is two lines, and it means this
            // factory exercises the same boot path a deployment does.
            builder.UseEnvironment("Testing");

            builder.UseSetting("JWTSecretKey", JwtKey);
            builder.UseSetting("ConnectionStrings:DefaultConnection", "unused");

            builder.ConfigureServices(services =>
            {
                // Replace Npgsql with SQLite. Every part of the original registration has to
                // go, not just the provider: two providers on one context throws at resolve
                // time rather than picking the last one, and since EF Core 9 the provider is
                // pinned by an IDbContextOptionsConfiguration<T> that survives removing
                // DbContextOptions alone. The error names both providers and points at
                // UseInternalServiceProvider, which is not what is wrong.
                services.RemoveAll<IDbContextOptionsConfiguration<WebChatContext>>();
                services.RemoveAll<DbContextOptions<WebChatContext>>();
                services.RemoveAll<DbContextOptions>();
                services.RemoveAll<WebChatContext>();

                this.connection.Open();
                services.AddDbContext<WebChatContext>(options => options.UseSqlite(this.connection));
            });
        }

        /// <summary>
        /// The schema is created after the host's own container exists. Doing it inside
        /// <c>ConfigureServices</c> would need a second provider built from a half-configured
        /// collection, which resolves a different <see cref="WebChatContext"/> than the app
        /// will use.
        /// </summary>
        protected override IHost CreateHost(IHostBuilder builder)
        {
            var host = base.CreateHost(builder);

            using var scope = host.Services.CreateScope();
            scope.ServiceProvider.GetRequiredService<WebChatContext>().Database.EnsureCreated();

            return host;
        }

        /// <summary>
        /// Inserts a confirmed account and returns a client whose every request carries its
        /// token - including the security stamp, without which <c>OnTokenValidated</c> fails
        /// the request before authorization is ever consulted.
        /// </summary>
        public HttpClient ClientFor(string role, out string userId)
        {
            var user = new User
            {
                Id = Guid.NewGuid().ToString(),
                Username = role,
                Email = $"{Guid.NewGuid():N}@example.com",
                Password = "irrelevant",
                Role = role,
                EmailConfirmed = true,
                CreatedOn = DateTime.UtcNow,
                SecurityStamp = Convert.ToBase64String(RandomNumberGenerator.GetBytes(16)),
            };

            using (var scope = this.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<WebChatContext>();
                db.User.Add(user);
                db.SaveChanges();
            }

            userId = user.Id;

            var client = this.Client();
            client.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", this.auth.GetToken(user.Id, user.SecurityStamp).Token);

            return client;
        }

        /// <summary>
        /// A client addressing the server over **https**, and that is load-bearing rather than
        /// tidy.
        ///
        /// <c>UseHttpsRedirection</c> answers a plain-http request with a 307. The factory's
        /// handler follows redirects by default and routes every scheme back to the same test
        /// server, so the request does arrive - but <c>HttpClient</c> strips the
        /// <c>Authorization</c> header when a redirect changes scheme or host, exactly as it
        /// is meant to. The retried request is therefore anonymous, and every authenticated
        /// call answers 401 with a bare <c>WWW-Authenticate: Bearer</c> and no error detail:
        /// the handler saw no token at all, so there is nothing for it to complain about.
        ///
        /// It reads as "the token is wrong" and it is not. Addressing https directly means
        /// there is no redirect to lose the header to.
        /// </summary>
        public HttpClient Client() =>
            this.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });

        protected override void Dispose(bool disposing)
        {
            base.Dispose(disposing);
            if (disposing) this.connection.Dispose();
        }
    }
}
