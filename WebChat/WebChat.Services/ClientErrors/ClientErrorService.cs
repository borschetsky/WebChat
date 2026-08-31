using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using WebChat.Connection;
using WebChat.Models;
using WebChat.Models.ViewModels;

namespace WebChat.Services.ClientErrors
{
    /// <inheritdoc />
    public class ClientErrorService : IClientErrorService
    {
        /// <summary>
        /// The fingerprint scheme's version. Bumping it re-opens every historical issue as a
        /// new one, which is why it is a version rather than a silent change: the old rows
        /// stay readable and age out through retention instead of being migrated.
        /// </summary>
        public const string FingerprintVersion = "v1";

        /// <summary>Matches the sparkline the client draws, and the Overview's chart.</summary>
        public const int SparkDays = 14;

        /// <summary>How many browser names the "Browsers" line lists before it stops.</summary>
        private const int MaxBrowsersShown = 4;

        // System.Text.Json for the two JSON columns, not Newtonsoft, and that is not an
        // inconsistency - the same reasoning as AuditService. Newtonsoft is load-bearing at
        // the *wire* boundary, where the client parses Dictionary<DateTime,...> keys as dates.
        // This is a blob going into a column nobody queries inside.
        private static readonly JsonSerializerOptions Json = new();

        private readonly WebChatContext ctx;
        private readonly IAuditService audit;
        private readonly ClientErrorOptions options;

        public ClientErrorService(WebChatContext ctx, IAuditService audit, ClientErrorOptions options)
        {
            this.ctx = ctx;
            this.audit = audit;
            this.options = options;
        }

        /// <summary>
        /// <c>v1|component|function|name</c>.
        ///
        /// Pipes inside a part are replaced rather than escaped: the fingerprint is a grouping
        /// key, not something that gets parsed back apart, so the only property it needs is
        /// that two different triples cannot collide - and a component called "a|b" colliding
        /// with one called "a_b" is not a situation this app can produce.
        /// </summary>
        public static string Fingerprint(string component, string function, string name)
        {
            var key = string.Join('|', FingerprintVersion, Part(component), Part(function), Part(name));

            return key.Length <= ClientErrorIssue.FingerprintLength
                ? key
                : key.Substring(0, ClientErrorIssue.FingerprintLength);

            static string Part(string value) =>
                string.IsNullOrWhiteSpace(value) ? "unknown" : value.Trim().Replace('|', '_');
        }

        public async Task RecordAsync(ClientErrorReport report, CancellationToken cancellationToken = default)
        {
            var fingerprint = Fingerprint(report.Component, report.Function, report.Name);

            var issue = await this.ctx.ClientErrorIssue
                .FirstOrDefaultAsync(i => i.Fingerprint == fingerprint, cancellationToken);

            if (issue == null)
            {
                issue = new ClientErrorIssue
                {
                    Id = Guid.NewGuid().ToString(),
                    Fingerprint = fingerprint,
                    Name = report.Name,
                    FirstSeenUtc = report.OccurredAtUtc,
                    Status = ClientErrorStatus.New,
                    Events = 0,
                };

                this.ctx.ClientErrorIssue.Add(issue);
            }

            // Everything below is the *latest* occurrence overwriting the sample, including
            // the level: an issue that starts being caught by an error boundary has become
            // more serious than it was, and the row should say so.
            issue.Level = report.Level;
            issue.Message = report.Message;
            issue.Culprit = Culprit(report);
            issue.Route = report.Route;
            issue.Release = report.Release;
            issue.LastSeenUtc = report.OccurredAtUtc;
            issue.Events += 1;
            issue.StackJson = JsonSerializer.Serialize(report.Stack ?? new List<string>(), Json);
            issue.CrumbsJson = JsonSerializer.Serialize(
                (report.Crumbs ?? new List<ClientErrorCrumb>())
                    .Select(c => new AdminErrorCrumbViewModel { T = c.T, K = c.K, V = c.V })
                    .ToList(),
                Json);

            // Deliberately *not* reopened. Marking an issue resolved is a claim about a fix,
            // and silently flipping it back to "new" would erase the fact that somebody made
            // that claim. The count and the last-seen both move, which is what makes a
            // regression visible on the screen without rewriting anyone's triage.
            this.ctx.ClientErrorEvent.Add(new ClientErrorEvent
            {
                Id = Guid.NewGuid().ToString(),
                IssueId = issue.Id,
                Issue = issue,
                OccurredAtUtc = report.OccurredAtUtc,
                UserId = report.UserId,
                Browser = report.Browser,
            });

            await this.ctx.SaveChangesAsync(cancellationToken);
        }

        public async Task<IReadOnlyList<AdminErrorViewModel>> ListAsync()
        {
            var issues = await this.ctx.ClientErrorIssue
                .AsNoTracking()
                .OrderByDescending(i => i.LastSeenUtc)
                .Take(Math.Max(1, this.options.MaxIssuesReturned))
                .ToListAsync();

            if (issues.Count == 0) return Array.Empty<AdminErrorViewModel>();

            var ids = issues.Select(i => i.Id).ToList();

            // Midnight UTC, so the last bucket is today-so-far rather than a rolling 24 hours.
            // Same reasoning as the Overview chart: a bucket that slides through the afternoon
            // makes yesterday's bar change on every reload.
            var today = DateTime.UtcNow.Date;
            var from = DateTime.SpecifyKind(today.AddDays(-(SparkDays - 1)), DateTimeKind.Utc);

            var window = this.ctx.ClientErrorEvent
                .AsNoTracking()
                .Where(e => ids.Contains(e.IssueId) && e.OccurredAtUtc >= from);

            var buckets = await window
                .GroupBy(e => new { e.IssueId, Day = e.OccurredAtUtc.Date })
                .Select(g => new { g.Key.IssueId, g.Key.Day, Count = g.Count() })
                .ToListAsync();

            var userCounts = await window
                .Where(e => e.UserId != null)
                .Select(e => new { e.IssueId, e.UserId })
                .Distinct()
                .GroupBy(x => x.IssueId)
                .Select(g => new { IssueId = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.IssueId, x => x.Count);

            var browsers = await window
                .Where(e => e.Browser != null)
                .Select(e => new { e.IssueId, e.Browser })
                .Distinct()
                .ToListAsync();

            var byIssue = buckets
                .GroupBy(b => b.IssueId)
                .ToDictionary(g => g.Key, g => g.ToDictionary(b => b.Day.Date, b => b.Count));

            var browsersByIssue = browsers
                .GroupBy(b => b.IssueId)
                .ToDictionary(
                    g => g.Key,
                    g => g.Select(b => b.Browser).OrderBy(b => b, StringComparer.Ordinal).ToList());

            return issues.Select(issue => new AdminErrorViewModel
            {
                Id = issue.Id,
                Level = issue.Level,
                Name = issue.Name,
                Message = issue.Message ?? string.Empty,
                Culprit = issue.Culprit ?? string.Empty,
                Route = issue.Route ?? string.Empty,
                Release = issue.Release ?? string.Empty,
                Events = issue.Events,
                Users = userCounts.TryGetValue(issue.Id, out var users) ? users : 0,
                FirstSeenUtc = issue.FirstSeenUtc,
                LastSeenUtc = issue.LastSeenUtc,
                Status = issue.Status,
                Browsers = BrowsersLine(browsersByIssue, issue.Id),
                Spark = Spark(byIssue, issue.Id, from),
                Stack = Deserialize<List<string>>(issue.StackJson) ?? new List<string>(),
                Crumbs = Deserialize<List<AdminErrorCrumbViewModel>>(issue.CrumbsJson)
                         ?? new List<AdminErrorCrumbViewModel>(),
            }).ToList();
        }

        public async Task<IReadOnlyList<AdminErrorViewModel>> SetStatusAsync(
            string actorId, string id, string status)
        {
            if (string.IsNullOrWhiteSpace(id) || !ClientErrorStatus.IsValid(status)) return null;

            var issue = await this.ctx.ClientErrorIssue.FirstOrDefaultAsync(i => i.Id == id);
            if (issue == null) return null;

            var previous = issue.Status;
            issue.Status = status;

            // Triage is audited like every other admin mutation. The question it answers turns
            // up whenever a resolved issue starts happening again: somebody decided this was
            // fixed, and "who, and when" is exactly what makes that decision reviewable.
            // Facts, not a sentence - `auditSentence.ts` supplies the wording.
            this.audit.Record(actorId, AuditAction.Error, "client_error", issue.Id, new
            {
                status,
                from = previous,

                // The name rather than the fingerprint: the log is read by a person, and
                // "v1|AdminOverview|render|TypeError" is not a thing anyone recognises.
                name = issue.Name,
            });

            await this.ctx.SaveChangesAsync();

            return await this.ListAsync();
        }

        public async Task<(int Events, int Issues)> PruneAsync(CancellationToken cancellationToken = default)
        {
            var now = DateTime.UtcNow;

            // Clamped rather than trusted. A misconfigured zero would mean "delete everything
            // written so far", which is the one outcome a retention job must not be one typo
            // away from - and the clamp keeps the events window at least a day wider than the
            // sparkline it feeds.
            var eventDays = Math.Max(SparkDays + 1, this.options.EventRetentionDays);
            var issueDays = Math.Max(eventDays, this.options.IssueRetentionDays);

            var events = await this.ctx.ClientErrorEvent
                .Where(e => e.OccurredAtUtc < now.AddDays(-eventDays))
                .ExecuteDeleteAsync(cancellationToken);

            // "Not seen for N days", not "resolved N days ago" - see ClientErrorOptions. The
            // cascade on ClientErrorEvent.IssueId takes the remaining occurrences with it.
            var issues = await this.ctx.ClientErrorIssue
                .Where(i => i.LastSeenUtc < now.AddDays(-issueDays))
                .ExecuteDeleteAsync(cancellationToken);

            return (events, issues);
        }

        /// <summary>"ThreadHeader in renderPresence", or just the component when there is no function.</summary>
        private static string Culprit(ClientErrorReport report) =>
            string.IsNullOrWhiteSpace(report.Function)
                ? report.Component
                : $"{report.Component} in {report.Function}";

        private static string BrowsersLine(IReadOnlyDictionary<string, List<string>> byIssue, string issueId)
        {
            if (!byIssue.TryGetValue(issueId, out var names) || names.Count == 0)
            {
                return BrowserName.Unknown;
            }

            var shown = string.Join(" · ", names.Take(MaxBrowsersShown));

            return names.Count > MaxBrowsersShown
                ? $"{shown} +{names.Count - MaxBrowsersShown}"
                : shown;
        }

        private static List<int> Spark(
            IReadOnlyDictionary<string, Dictionary<DateTime, int>> byIssue,
            string issueId,
            DateTime from)
        {
            byIssue.TryGetValue(issueId, out var days);

            return Enumerable.Range(0, SparkDays)
                .Select(offset =>
                {
                    var day = from.AddDays(offset).Date;
                    return days != null && days.TryGetValue(day, out var count) ? count : 0;
                })
                .ToList();
        }

        private static T Deserialize<T>(string json)
            where T : class
        {
            if (string.IsNullOrWhiteSpace(json)) return null;

            try
            {
                return JsonSerializer.Deserialize<T>(json, Json);
            }
            catch (JsonException)
            {
                // A column this service wrote should always parse, so this is only reachable
                // if something else has written to it. A row that renders without its stack
                // beats an endpoint that 500s over one bad blob.
                return null;
            }
        }
    }
}
