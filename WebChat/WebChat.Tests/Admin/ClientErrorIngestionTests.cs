using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using WebChat.Models;
using WebChat.Services.ClientErrors;

namespace WebChat.Tests.Admin
{
    /// <summary>
    /// The parts of ingestion that run before anything touches the database: the bounded
    /// queue, the truncation, and the User-Agent reduction.
    ///
    /// These are the pieces that have to hold when the app is already in trouble - a client in
    /// a render loop, a 60 KiB stack, a header from something that is not a browser at all -
    /// so they are tested apart from the database rather than through it.
    /// </summary>
    public class ClientErrorIngestionTests
    {
        // --- the bounded queue -----------------------------------------------------------

        /// <summary>
        /// Shedding load rather than growing is the point. An unbounded queue turns one looping
        /// client into unbounded memory growth in the server process, and the failure arrives
        /// long after its cause.
        /// </summary>
        [Fact]
        public void The_queue_drops_rather_than_growing_past_its_capacity()
        {
            var queue = new ClientErrorQueue(new ClientErrorOptions { QueueCapacity = 2 });

            for (var i = 0; i < 5; i++) queue.Enqueue(new ClientErrorReport { Name = "TypeError" });

            Assert.Equal(3, queue.Dropped);
        }

        /// <summary>
        /// DropWrite, not DropOldest: the reports already queued belong to whoever got there
        /// first, and dropping those would let one looping client evict everyone else's errors.
        /// </summary>
        [Fact]
        public async Task The_queue_keeps_the_reports_that_arrived_first()
        {
            var queue = new ClientErrorQueue(new ClientErrorOptions { QueueCapacity = 2 });

            queue.Enqueue(new ClientErrorReport { Name = "First" });
            queue.Enqueue(new ClientErrorReport { Name = "Second" });
            queue.Enqueue(new ClientErrorReport { Name = "Third" });

            var read = new List<string>();

            // Break rather than cancel: the queue is never completed, so the loop would
            // otherwise sit waiting for a fourth report that is not coming.
            await foreach (var report in queue.ReadAllAsync(CancellationToken.None))
            {
                read.Add(report.Name);
                if (read.Count == 2) break;
            }

            Assert.Equal(new[] { "First", "Second" }, read);
        }

        // --- truncation ------------------------------------------------------------------

        /// <summary>
        /// `fetch(keepalive)` caps a body at 64 KiB, so the client truncates - but the server
        /// cannot rely on it having done so, and a column has a length.
        /// </summary>
        [Fact]
        public void Truncation_bounds_every_field_a_browser_supplies()
        {
            var report = new ClientErrorReport
            {
                Name = new string('n', 5000),
                Message = new string('m', 90_000),
                Component = new string('c', 5000),
                Function = new string('f', 5000),
                Route = new string('r', 5000),
                Release = new string('v', 5000),
                Stack = Enumerable.Range(0, 500).Select(_ => new string('s', 5000)).ToList(),
                Crumbs = Enumerable.Range(0, 500)
                    .Select(_ => new ClientErrorCrumb { T = "12:04:02", K = "fetch", V = new string('v', 5000) })
                    .ToList(),
            };

            report.Truncate();

            Assert.Equal(ClientErrorReport.NameLength, report.Name.Length);
            Assert.Equal(ClientErrorReport.MessageLength, report.Message.Length);
            Assert.Equal(ClientErrorReport.ComponentLength, report.Component.Length);
            Assert.Equal(ClientErrorReport.FunctionLength, report.Function.Length);
            Assert.Equal(ClientErrorReport.RouteLength, report.Route.Length);
            Assert.Equal(ClientErrorReport.ReleaseLength, report.Release.Length);
            Assert.Equal(ClientErrorReport.MaxStackFrames, report.Stack.Count);
            Assert.All(report.Stack, frame => Assert.Equal(ClientErrorReport.StackFrameLength, frame.Length));
            Assert.Equal(ClientErrorReport.MaxCrumbs, report.Crumbs.Count);
            Assert.All(report.Crumbs, crumb => Assert.Equal(ClientErrorReport.CrumbFieldLength, crumb.V.Length));
        }

        /// <summary>
        /// The breadcrumbs nearest the failure are the ones worth keeping. Taking the first few
        /// instead would keep whatever happened when the page loaded.
        /// </summary>
        [Fact]
        public void Truncation_keeps_the_last_breadcrumbs_not_the_first()
        {
            var report = new ClientErrorReport
            {
                Name = "TypeError",
                Crumbs = Enumerable.Range(0, 30)
                    .Select(i => new ClientErrorCrumb { T = "12:04:02", K = "fetch", V = $"crumb-{i}" })
                    .ToList(),
            };

            report.Truncate();

            Assert.Equal("crumb-29", report.Crumbs.Last().V);
            Assert.Equal($"crumb-{30 - ClientErrorReport.MaxCrumbs}", report.Crumbs.First().V);
        }

        [Fact]
        public void An_empty_report_becomes_a_storable_one_rather_than_a_refusal()
        {
            var report = new ClientErrorReport();

            report.Truncate();

            Assert.Equal(ClientErrorLevel.Error, report.Level);
            Assert.Equal("Error", report.Name);
            Assert.Equal("unknown", report.Component);
            Assert.Equal("unknown", report.Function);
            Assert.Empty(report.Stack);
            Assert.Empty(report.Crumbs);
        }

        [Fact]
        public void An_unknown_level_becomes_error_rather_than_being_refused()
        {
            var report = new ClientErrorReport { Name = "TypeError", Level = "catastrophe" };

            report.Truncate();

            Assert.Equal(ClientErrorLevel.Error, report.Level);
        }

        // --- the User-Agent --------------------------------------------------------------

        /// <summary>
        /// Order is the only subtle part: every one of these lies about the others. Edge's UA
        /// contains both "Chrome" and "Safari", Chrome's contains "Safari".
        /// </summary>
        [Theory]
        [InlineData(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
            "Chrome 141")]
        [InlineData(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.3537.57",
            "Edge 141")]
        [InlineData(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15",
            "Safari 18")]
        [InlineData(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
            "Firefox 133")]
        [InlineData(
            "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 OPR/125.0.0.0",
            "Opera 125")]
        public void The_user_agent_is_reduced_to_a_name_and_a_major_version(string userAgent, string expected)
        {
            Assert.Equal(expected, BrowserName.From(userAgent));
        }

        [Theory]
        [InlineData(null)]
        [InlineData("")]
        [InlineData("curl/8.5.0")]
        public void An_unparseable_user_agent_becomes_Unknown(string? userAgent)
        {
            Assert.Equal(BrowserName.Unknown, BrowserName.From(userAgent));
        }
    }
}
