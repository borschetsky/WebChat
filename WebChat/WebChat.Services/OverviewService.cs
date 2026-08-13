using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using WebChat.Connection;
using WebChat.Models;
using WebChat.Models.ViewModels;

namespace WebChat.Services
{
    /// <summary>
    /// Counts the Overview's numbers.
    ///
    /// **The funnel stages are cumulative and each is a subset of the one above.** Registered
    /// ⊇ confirmed ⊇ joined a conversation ⊇ sent a message. That is what makes a funnel
    /// readable at a glance - a stage that is not a subset produces a shape that looks like a
    /// funnel and cannot be reasoned about like one.
    ///
    /// "Sent a message" is the last stage rather than something softer like "signed in",
    /// because it is the only one this app actually records. There is no general activity
    /// timestamp; see <c>AdminMemberViewModel.LastActiveUtc</c>, which has the same limit and
    /// says so.
    /// </summary>
    public class OverviewService : IOverviewService
    {
        // A note on `m.Type != MessageType.System`, which appears twice below and does not
        // mean what the same text means in SQL.
        //
        // Messages written before the Type column existed have Type NULL, and they are
        // ordinary user messages. EF translates `!=` with null semantics - roughly
        // `"Type" <> 'system' OR "Type" IS NULL` - so those rows are counted, which is
        // right. Hand-written `WHERE "Type" <> 'system'` drops them silently, because
        // `NULL <> 'system'` is NULL rather than true.
        //
        // This was found by cross-checking these counts against psql and getting 2 where the
        // endpoint said 7. The endpoint was right. Anyone auditing these numbers by hand
        // needs `("Type" IS NULL OR "Type" <> 'system')` or they will "find" a bug that is
        // in their query.

        /// <summary>Matches the chart the design draws, and what the client renders.</summary>
        private const int ChartDays = 14;

        private const int RecentJoinDays = 30;

        private const int ExpiringSoonDays = 7;

        private readonly WebChatContext ctx;

        public OverviewService(WebChatContext ctx)
        {
            this.ctx = ctx;
        }

        public async Task<AdminOverviewViewModel> GetAsync()
        {
            var now = DateTime.UtcNow;

            // Midnight UTC today, so the fourteenth bucket is today-so-far rather than a
            // rolling 24 hours - the chart is read as days, and a bucket that slides through
            // the afternoon would make yesterday's bar change every time the page reloads.
            var today = new DateTime(now.Year, now.Month, now.Day, 0, 0, 0, DateTimeKind.Utc);
            var from = today.AddDays(-(ChartDays - 1));

            var byStatus = await this.ctx.User
                .AsNoTracking()
                .Where(u => !u.isDeleted)
                .GroupBy(u => u.Status)
                .Select(g => new { Status = g.Key, Count = g.Count() })
                .ToDictionaryAsync(g => g.Status ?? string.Empty, g => g.Count);

            var counted = await this.ctx.Message
                .AsNoTracking()
                .Where(m => m.CreatedOn >= from && m.Type != MessageType.System)
                .GroupBy(m => m.CreatedOn.Date)
                .Select(g => new { Day = g.Key, Count = g.Count() })
                .ToListAsync();

            var volume = counted.ToDictionary(x => x.Day, x => x.Count);

            // Every day in the window, not just the ones with messages. A gap-filled series
            // is what makes the chart mean anything: without it a quiet Sunday disappears and
            // the bars silently re-space, so two charts of the same fortnight look different.
            var chart = Enumerable.Range(0, ChartDays)
                .Select(offset =>
                {
                    var day = from.AddDays(offset);
                    return new AdminChartPointViewModel
                    {
                        DayUtc = day,
                        Value = volume.TryGetValue(day.Date, out var count) ? count : 0,
                    };
                })
                .ToList();

            return new AdminOverviewViewModel
            {
                Total = byStatus.Values.Sum(),
                Active = Count(byStatus, AccountStatus.Active),
                Pending = Count(byStatus, AccountStatus.Pending),
                Blocked = Count(byStatus, AccountStatus.Blocked) + Count(byStatus, AccountStatus.Deactivated),

                JoinedRecently = await this.ctx.User
                    .CountAsync(u => !u.isDeleted && u.CreatedOn >= now.AddDays(-RecentJoinDays)),

                ExpiringSoon = await this.ctx.Invitation
                    .CountAsync(i => i.RedeemedAtUtc == null && i.RevokedAtUtc == null &&
                                     i.ExpiresAtUtc > now &&
                                     i.ExpiresAtUtc <= now.AddDays(ExpiringSoonDays)),

                Chart = chart,
                Funnel = await this.FunnelAsync(),
            };
        }

        private static int Count(IReadOnlyDictionary<string, int> byStatus, string status) =>
            byStatus.TryGetValue(status, out var count) ? count : 0;

        private async Task<List<AdminFunnelStageViewModel>> FunnelAsync()
        {
            var registered = await this.ctx.User.CountAsync(u => !u.isDeleted);

            var confirmed = await this.ctx.User.CountAsync(u => !u.isDeleted && u.EmailConfirmed);

            // Subsets of confirmed, deliberately: somebody in a conversation who has somehow
            // not confirmed would otherwise widen a lower stage and break the funnel's shape.
            var joined = await this.ctx.User.CountAsync(u =>
                !u.isDeleted && u.EmailConfirmed &&
                this.ctx.ThreadParticipant.Any(p => p.UserId == u.Id && !p.isDeleted));

            var wrote = await this.ctx.User.CountAsync(u =>
                !u.isDeleted && u.EmailConfirmed &&
                this.ctx.ThreadParticipant.Any(p => p.UserId == u.Id && !p.isDeleted) &&
                this.ctx.Message.Any(m => m.SenderId == u.Id && m.Type != MessageType.System));

            // Keys, not sentences - the client supplies the wording, same rule as system
            // messages and audit entries.
            return new List<AdminFunnelStageViewModel>
            {
                new() { Key = "registered", Value = registered },
                new() { Key = "confirmed", Value = confirmed },
                new() { Key = "joined", Value = joined },
                new() { Key = "wrote", Value = wrote },
            };
        }
    }
}
