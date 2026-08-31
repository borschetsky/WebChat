using System;
using System.Collections.Generic;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Net.Http.Headers;
using WebChat.Services.ClientErrors;

namespace WebChat.Controllers
{
    /// <summary>
    /// Where the browser reports its own crashes.
    ///
    /// **It answers 202 and it never blocks.** The report is truncated, stamped with the things
    /// the browser is not trusted to state, dropped into a bounded queue and acknowledged - no
    /// database work happens on this thread at all. The client does not await the call either,
    /// so the whole path from "a screen threw" to "the user sees the fallback" is unaffected by
    /// how the server is doing.
    ///
    /// **Authenticated, and that has a consequence worth naming**: an error thrown on the
    /// sign-in, registration or invitation screens is *not* reported, because nobody is signed
    /// in yet. Opening it up would mean an unauthenticated write endpoint that anyone on the
    /// internet can put rows in, which is a much worse trade than a blind spot on four screens.
    ///
    /// Not under <c>api/admin</c>: every caller is an ordinary member, and this is the one
    /// endpoint in the feature that is not an administrative one.
    /// </summary>
    [Authorize]
    [ApiController]
    [Route("api/client-errors")]
    public class ClientErrorsController : ControllerBase
    {
        private readonly IClientErrorQueue queue;

        public ClientErrorsController(IClientErrorQueue queue)
        {
            this.queue = queue;
        }

        /// <summary>
        /// Accepts one report.
        ///
        /// Rate-limited by <see cref="Startup.ClientErrorPolicy"/>, which partitions by remote
        /// IP exactly as the email limiter does - and therefore depends on
        /// <c>ForwardedHeaders__Enabled</c> behind a proxy in exactly the same way. One
        /// mechanism rather than two: the alternative, partitioning by the caller's id, cannot
        /// work here because <c>UseRateLimiter</c> runs before <c>UseAuthentication</c> in the
        /// pipeline, so there is no identity to partition on yet.
        ///
        /// The limiter is the outer guard against a client stuck in an error loop; the bounded
        /// queue is the inner one, and the reporter caps itself per page load as well. All
        /// three shed rather than fail, because the one thing a crash reporter must never do is
        /// make the crash worse.
        /// </summary>
        [EnableRateLimiting(Startup.ClientErrorPolicy)]
        [HttpPost]
        public IActionResult Report([FromBody] ClientErrorRequest request)
        {
            if (request == null || string.IsNullOrWhiteSpace(request.Name))
            {
                // The name is half the fingerprint. A report without one would group every
                // nameless failure in the app into a single meaningless row.
                return this.BadRequest(new { error = "name_required" });
            }

            var report = new ClientErrorReport
            {
                Level = request.Level,
                Name = request.Name,
                Message = request.Message,
                Component = request.Component,
                Function = request.Function,
                Route = request.Route,
                Release = request.Release,
                Stack = request.Stack,
                Crumbs = request.Crumbs,

                // The three the body does not get a say in. The id comes from the token for
                // the same reason it does everywhere else here - an id in a request body never
                // decides which row is written - and the time is when the report arrived,
                // because a client clock set a year ahead would pin the sparkline's last
                // bucket forever.
                UserId = this.User.Identity?.Name,
                Browser = BrowserName.From(this.Request.Headers[HeaderNames.UserAgent]),
                OccurredAtUtc = DateTime.UtcNow,
            };

            // Before queueing, not after: a 60 KiB stack should not occupy the space of a
            // hundred ordinary reports while it waits to be shortened.
            report.Truncate();

            this.queue.Enqueue(report);

            return this.Accepted();
        }

        /// <summary>
        /// The request body. Every field is untrusted; <see cref="ClientErrorReport.Truncate"/>
        /// is what bounds it.
        /// </summary>
        public class ClientErrorRequest
        {
            /// <summary>One of <c>ClientErrorLevel</c>. An unknown value becomes "error".</summary>
            public string Level { get; set; }

            public string Name { get; set; }

            public string Message { get; set; }

            /// <summary>
            /// A **literal** boundary name. Never a component's runtime name: the production
            /// minifier renames `AdminOverviewCard` to `t`, so anything derived from
            /// `componentStack` would be a single letter that changes every deploy - and it is
            /// half the fingerprint.
            /// </summary>
            public string Component { get; set; }

            public string Function { get; set; }

            /// <summary>The path it happened on. Not part of the fingerprint.</summary>
            public string Route { get; set; }

            public string Release { get; set; }

            public List<string> Stack { get; set; }

            public List<ClientErrorCrumb> Crumbs { get; set; }
        }
    }
}
