using System;
using System.Collections.Generic;

namespace WebChat.Models.ViewModels
{
    /// <summary>One day of the message-volume chart.</summary>
    public class AdminChartPointViewModel
    {
        /// <summary>
        /// Midnight UTC of the day counted. An instant, not a weekday letter: the client
        /// derives "M"/"T" at render, in the reader's locale and week convention, and a
        /// server-side letter would also be wrong for anyone not in UTC.
        /// </summary>
        public DateTime DayUtc { get; set; }

        public int Value { get; set; }
    }

    /// <summary>
    /// One stage of the activation funnel.
    ///
    /// A funnel and not a pie: each stage is a subset of the one above it, so the widths mean
    /// "how far people get", which is the question an administrator actually has. A breakdown
    /// by status answers a different one and the members table already answers it better.
    /// </summary>
    public class AdminFunnelStageViewModel
    {
        public string Key { get; set; }

        public int Value { get; set; }
    }

    /// <summary>
    /// The admin console's Overview.
    ///
    /// Every number here is counted from the database. The screen used to carry two invented
    /// hints - "+3 in the last 30 days" and "2 expire within a week" - which is the worst
    /// kind of fiction on a dashboard: specific, plausible, and load-bearing for a decision.
    /// </summary>
    public class AdminOverviewViewModel
    {
        public int Total { get; set; }

        public int Active { get; set; }

        public int Pending { get; set; }

        /// <summary>Blocked and deactivated together - both mean sign-in is refused.</summary>
        public int Blocked { get; set; }

        /// <summary>Accounts created in the last 30 days, for the total's hint.</summary>
        public int JoinedRecently { get; set; }

        /// <summary>Outstanding invitations lapsing within a week, for the pending hint.</summary>
        public int ExpiringSoon { get; set; }

        /// <summary>Fourteen days, oldest first, including days with no messages at all.</summary>
        public List<AdminChartPointViewModel> Chart { get; set; } = new();

        public List<AdminFunnelStageViewModel> Funnel { get; set; } = new();
    }
}
