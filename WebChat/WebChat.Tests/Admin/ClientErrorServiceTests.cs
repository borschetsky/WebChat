using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using WebChat.Connection;
using WebChat.Models;
using WebChat.Services;
using WebChat.Services.ClientErrors;

namespace WebChat.Tests.Admin
{
    /// <summary>
    /// Grouping, the sparkline, triage and retention.
    ///
    /// The grouping tests are the ones worth having. Everything else on this screen degrades
    /// gracefully when it is wrong - a browser list that says "Unknown" is obviously wrong -
    /// but a fingerprint that includes the message turns the section into a log of thousands of
    /// one-off rows, and it does that while looking like it is working.
    /// </summary>
    public class ClientErrorServiceTests : IDisposable
    {
        private readonly SqliteConnection connection = new("DataSource=:memory:");
        private readonly WebChatContext ctx;
        private readonly ClientErrorOptions options = new();
        private readonly ClientErrorService service;

        public ClientErrorServiceTests()
        {
            this.connection.Open();

            // Postgres always enforces a cascade; SQLite only does when this is on, and EF
            // does not set it on a connection it did not open. Without it the retention test
            // would pass against a database that behaves differently from production.
            using (var pragma = this.connection.CreateCommand())
            {
                pragma.CommandText = "PRAGMA foreign_keys = ON;";
                pragma.ExecuteNonQuery();
            }

            this.ctx = new WebChatContext(new DbContextOptionsBuilder<WebChatContext>()
                .UseSqlite(this.connection).Options);
            this.ctx.Database.EnsureCreated();

            this.service = new ClientErrorService(this.ctx, new AuditService(this.ctx), this.options);
        }

        private static ClientErrorReport Report(
            string name = "TypeError",
            string component = "ThreadHeader",
            string function = "renderPresence",
            string message = "Cannot read properties of undefined",
            string level = ClientErrorLevel.Fatal,
            string userId = "user-1",
            string? browser = "Chrome 141",
            DateTime? at = null)
        {
            var report = new ClientErrorReport
            {
                Level = level,
                Name = name,
                Component = component,
                Function = function,
                Message = message,
                Route = "/dashboard",
                Release = "web@0.1.0",
                Stack = new List<string> { $"{name}: {message}", "    at t (index-a1b2.js:1:1)" },
                Crumbs = new List<ClientErrorCrumb>
                {
                    new() { T = "12:04:02", K = "ui.click", V = "button[aria-label=\"Settings\"]" },
                },
                UserId = userId,
                Browser = browser,
                OccurredAtUtc = at ?? DateTime.UtcNow,
            };

            report.Truncate();
            return report;
        }

        private Task Record(ClientErrorReport report) => this.service.RecordAsync(report);

        // --- grouping -------------------------------------------------------------------

        /// <summary>
        /// The point of the whole design. A message carrying an interpolated value would open a
        /// fresh issue per occurrence, and the section would become a log rather than a set of
        /// problems worth fixing.
        /// </summary>
        [Fact]
        public async Task Two_occurrences_differing_only_in_the_message_are_one_issue()
        {
            await this.Record(Report(message: "thread t3 not found"));
            await this.Record(Report(message: "thread g1741 not found"));

            var errors = await this.service.ListAsync();

            Assert.Single(errors);
            Assert.Equal(2, errors[0].Events);

            // The latest message is kept as a sample, so the row shows something concrete.
            Assert.Equal("thread g1741 not found", errors[0].Message);
        }

        [Fact]
        public async Task A_different_component_is_a_different_issue()
        {
            await this.Record(Report(component: "ThreadHeader"));
            await this.Record(Report(component: "AdminOverview"));

            Assert.Equal(2, (await this.service.ListAsync()).Count);
        }

        [Fact]
        public async Task A_different_error_name_is_a_different_issue()
        {
            await this.Record(Report(name: "TypeError"));
            await this.Record(Report(name: "ChunkLoadError"));

            Assert.Equal(2, (await this.service.ListAsync()).Count);
        }

        /// <summary>
        /// Versioned so the scheme can be changed later without a migration - and so that when
        /// it is changed, the change is visible rather than silently re-opening every issue.
        /// </summary>
        [Fact]
        public void The_fingerprint_is_versioned_and_holds_only_the_three_parts()
        {
            var fingerprint = ClientErrorService.Fingerprint("AdminOverview", "render", "TypeError");

            Assert.Equal("v1|AdminOverview|render|TypeError", fingerprint);
        }

        [Fact]
        public async Task The_culprit_reads_as_component_in_function()
        {
            await this.Record(Report(component: "ThreadHeader", function: "renderPresence"));

            Assert.Equal("ThreadHeader in renderPresence", (await this.service.ListAsync())[0].Culprit);
        }

        // --- the sparkline ---------------------------------------------------------------

        /// <summary>
        /// Gap-filling, for the same reason the Overview chart does it: without it a quiet day
        /// disappears and the bars re-space, so two sparklines of the same fortnight look like
        /// different data.
        /// </summary>
        [Fact]
        public async Task The_sparkline_is_fourteen_days_including_empty_ones()
        {
            await this.Record(Report(at: DateTime.UtcNow));

            var spark = (await this.service.ListAsync())[0].Spark;

            Assert.Equal(14, spark.Count);
            Assert.Equal(1, spark[13]);
            Assert.All(spark.Take(13), value => Assert.Equal(0, value));
        }

        [Fact]
        public async Task The_sparkline_counts_into_the_right_day()
        {
            var today = DateTime.UtcNow.Date;

            await this.Record(Report(at: today.AddHours(9)));
            await this.Record(Report(at: today.AddHours(17)));
            await this.Record(Report(at: today.AddDays(-1).AddHours(12)));

            var spark = (await this.service.ListAsync())[0].Spark;

            Assert.Equal(2, spark[13]);
            Assert.Equal(1, spark[12]);
        }

        [Fact]
        public async Task The_sparkline_ignores_occurrences_older_than_the_window()
        {
            await this.Record(Report(at: DateTime.UtcNow.AddDays(-20)));

            var error = (await this.service.ListAsync())[0];

            Assert.All(error.Spark, value => Assert.Equal(0, value));

            // But the issue is still there, still counted, and still says when it began.
            Assert.Equal(1, error.Events);
        }

        // --- users and browsers ----------------------------------------------------------

        [Fact]
        public async Task Counts_distinct_people_rather_than_occurrences()
        {
            await this.Record(Report(userId: "a"));
            await this.Record(Report(userId: "a"));
            await this.Record(Report(userId: "b"));

            var error = (await this.service.ListAsync())[0];

            Assert.Equal(3, error.Events);
            Assert.Equal(2, error.Users);
        }

        [Fact]
        public async Task Lists_the_distinct_browsers_and_says_so_when_there_are_none()
        {
            await this.Record(Report(browser: "Chrome 141"));
            await this.Record(Report(browser: "Chrome 141"));
            await this.Record(Report(browser: "Safari 18"));

            Assert.Equal("Chrome 141 · Safari 18", (await this.service.ListAsync())[0].Browsers);

            await this.Record(Report(component: "Composer", browser: null));

            var second = (await this.service.ListAsync()).Single(e => e.Culprit.StartsWith("Composer"));
            Assert.Equal("Unknown", second.Browsers);
        }

        // --- triage ----------------------------------------------------------------------

        [Fact]
        public async Task A_new_issue_starts_as_new()
        {
            await this.Record(Report());

            Assert.Equal(ClientErrorStatus.New, (await this.service.ListAsync())[0].Status);
        }

        /// <summary>
        /// Marking an issue resolved is a claim about a fix, and a recurrence must not erase
        /// the fact that somebody made it. What moves instead is the count and the last-seen,
        /// which is what makes a regression visible without rewriting anyone's triage.
        /// </summary>
        [Fact]
        public async Task A_recurrence_does_not_reopen_a_resolved_issue()
        {
            await this.Record(Report(at: DateTime.UtcNow.AddHours(-2)));
            var id = (await this.service.ListAsync())[0].Id;

            await this.service.SetStatusAsync("admin-1", id, ClientErrorStatus.Resolved);
            await this.Record(Report(at: DateTime.UtcNow));

            var error = (await this.service.ListAsync())[0];

            Assert.Equal(ClientErrorStatus.Resolved, error.Status);
            Assert.Equal(2, error.Events);
            Assert.True(error.LastSeenUtc > error.FirstSeenUtc);
        }

        [Fact]
        public async Task Triage_is_audited()
        {
            await this.Record(Report());
            var id = (await this.service.ListAsync())[0].Id;

            await this.service.SetStatusAsync("admin-1", id, ClientErrorStatus.Resolved);

            var entry = Assert.Single(this.ctx.AuditEntry.ToList());

            Assert.Equal(AuditAction.Error, entry.Action);
            Assert.Equal("admin-1", entry.ActorId);
            Assert.Equal(id, entry.TargetId);
            Assert.Contains("resolved", entry.DetailJson);

            // The name, not the fingerprint: the log is read by a person, and
            // "v1|ThreadHeader|renderPresence|TypeError" is not something anyone recognises.
            Assert.Contains("TypeError", entry.DetailJson);
        }

        [Fact]
        public async Task Refuses_an_unknown_status_and_an_unknown_issue()
        {
            await this.Record(Report());
            var id = (await this.service.ListAsync())[0].Id;

            Assert.Null(await this.service.SetStatusAsync("admin-1", id, "wontfix"));
            Assert.Null(await this.service.SetStatusAsync("admin-1", "no-such-id", ClientErrorStatus.Resolved));

            // And nothing was audited for either.
            Assert.Empty(this.ctx.AuditEntry.ToList());
        }

        // --- retention -------------------------------------------------------------------

        /// <summary>
        /// The property that matters most about a retention job: on a database that has been
        /// collecting for a day, the first run must remove nothing. A default that empties the
        /// section the first time it fires is worse than no retention, because the section
        /// still looks like it is working.
        /// </summary>
        [Fact]
        public async Task Retention_deletes_nothing_on_a_fresh_deploy()
        {
            await this.Record(Report(at: DateTime.UtcNow));
            await this.Record(Report(component: "Composer", at: DateTime.UtcNow.AddDays(-3)));

            var (events, issues) = await this.service.PruneAsync();

            Assert.Equal(0, events);
            Assert.Equal(0, issues);
            Assert.Equal(2, (await this.service.ListAsync()).Count);
        }

        [Fact]
        public async Task Retention_removes_old_occurrences_but_keeps_the_issue_and_its_count()
        {
            var old = DateTime.UtcNow.AddDays(-40);

            await this.Record(Report(at: old));
            await this.Record(Report(at: DateTime.UtcNow));

            var (events, issues) = await this.service.PruneAsync();

            Assert.Equal(1, events);
            Assert.Equal(0, issues);

            var error = Assert.Single(await this.service.ListAsync());

            // The counter is cumulative and does not fall when occurrences are pruned - which
            // is exactly why it is a counter and not a COUNT(*).
            Assert.Equal(2, error.Events);
            Assert.Equal(old.Date, error.FirstSeenUtc.Date);
        }

        [Fact]
        public async Task Retention_removes_an_issue_nobody_has_seen_for_the_window()
        {
            await this.Record(Report(at: DateTime.UtcNow.AddDays(-100)));

            var (_, issues) = await this.service.PruneAsync();

            Assert.Equal(1, issues);
            Assert.Empty(await this.service.ListAsync());

            // The cascade took the occurrences with it rather than leaving orphans.
            Assert.Empty(this.ctx.ClientErrorEvent.ToList());
        }

        /// <summary>
        /// "Not seen for N days", not "resolved N days ago". An issue somebody resolved months
        /// ago that is still happening today is a regression, and deleting it would be deleting
        /// the evidence of one.
        /// </summary>
        [Fact]
        public async Task Retention_keeps_a_resolved_issue_that_is_still_happening()
        {
            await this.Record(Report(at: DateTime.UtcNow.AddDays(-200)));
            var id = (await this.service.ListAsync())[0].Id;
            await this.service.SetStatusAsync("admin-1", id, ClientErrorStatus.Resolved);

            await this.Record(Report(at: DateTime.UtcNow));

            var (_, issues) = await this.service.PruneAsync();

            Assert.Equal(0, issues);
            Assert.Single(await this.service.ListAsync());
        }

        /// <summary>
        /// A misconfigured zero would otherwise mean "delete everything written so far", which
        /// is the one outcome a retention job must not be one typo away from.
        /// </summary>
        [Fact]
        public async Task Retention_refuses_to_prune_inside_the_sparkline_window()
        {
            this.options.EventRetentionDays = 0;
            this.options.IssueRetentionDays = 0;

            await this.Record(Report(at: DateTime.UtcNow.AddDays(-10)));

            var (events, issues) = await this.service.PruneAsync();

            Assert.Equal(0, events);
            Assert.Equal(0, issues);
        }

        // --- storage rules ---------------------------------------------------------------

        /// <summary>
        /// Npgsql throws outright on a Local or Unspecified Kind rather than guessing, so a
        /// non-UTC instant is an insert-time failure in production and nothing at all under
        /// SQLite. Asserted here because SQLite will not catch it.
        /// </summary>
        [Fact]
        public async Task Every_stored_instant_is_utc()
        {
            await this.Record(Report());

            var issue = this.ctx.ClientErrorIssue.Single();
            var occurrence = this.ctx.ClientErrorEvent.Single();

            Assert.Equal(DateTimeKind.Utc, issue.FirstSeenUtc.Kind);
            Assert.Equal(DateTimeKind.Utc, issue.LastSeenUtc.Kind);
            Assert.Equal(DateTimeKind.Utc, occurrence.OccurredAtUtc.Kind);
        }

        [Fact]
        public async Task The_stack_and_breadcrumbs_survive_the_round_trip()
        {
            await this.Record(Report());

            var error = (await this.service.ListAsync())[0];

            Assert.Equal(2, error.Stack.Count);
            Assert.StartsWith("TypeError:", error.Stack[0]);

            var crumb = Assert.Single(error.Crumbs);
            Assert.Equal("ui.click", crumb.K);
            Assert.Equal("12:04:02", crumb.T);
        }

        [Fact]
        public async Task The_list_is_newest_activity_first()
        {
            await this.Record(Report(component: "Old", at: DateTime.UtcNow.AddHours(-5)));
            await this.Record(Report(component: "New", at: DateTime.UtcNow));

            var errors = await this.service.ListAsync();

            Assert.Equal("New", errors[0].Culprit.Split(' ')[0]);
        }

        public void Dispose()
        {
            this.ctx.Dispose();
            this.connection.Dispose();
            GC.SuppressFinalize(this);
        }
    }
}
