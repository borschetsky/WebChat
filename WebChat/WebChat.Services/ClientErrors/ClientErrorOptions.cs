namespace WebChat.Services.ClientErrors
{
    /// <summary>
    /// Client-error ingestion and retention, bound from the "ClientErrors" configuration
    /// section. Nothing here is a secret; every value belongs in appsettings.json.
    ///
    /// **The defaults have to be safe on a fresh deploy**, which for the retention numbers
    /// means "delete nothing that exists yet": on a database that has been collecting errors
    /// for a day, a 30-day event window and a 90-day issue window both remove exactly zero
    /// rows. A retention job that quietly empties the section the first time it runs is worse
    /// than no retention at all, because the section still looks like it is working.
    /// </summary>
    public class ClientErrorOptions
    {
        public const string SectionName = "ClientErrors";

        /// <summary>
        /// How many reports may wait to be written before further ones are dropped.
        ///
        /// The queue is bounded and drops the *newest* on overflow, so a client stuck in an
        /// error loop sheds its own repeats instead of pushing out reports from everyone else,
        /// and memory stops growing. Losing occurrences of an error that is firing hundreds of
        /// times a second costs nothing: the issue is already recorded and its count is already
        /// alarming.
        /// </summary>
        public int QueueCapacity { get; set; } = 500;

        /// <summary>
        /// How long an individual occurrence is kept. Must stay comfortably above the 14 days
        /// the sparkline draws, or the chart starts losing its oldest bars to the pruner.
        /// </summary>
        public int EventRetentionDays { get; set; } = 30;

        /// <summary>
        /// How long an issue nobody has seen is kept.
        ///
        /// **Not "resolved issues after N days".** Two reasons. An issue that is resolved and
        /// then happens again must not be deleted - that is a regression, and the whole value
        /// of keeping the row is that its count and last-seen carry on from where they were.
        /// And the growth risk is not resolved issues at all: it is the long tail of one-off
        /// failures from browser extensions and flaky networks that nobody will ever triage,
        /// which "resolved after N days" would keep forever. "Not seen for N days" retires
        /// both, and retires a resolved issue exactly when it stops recurring.
        /// </summary>
        public int IssueRetentionDays { get; set; } = 90;

        /// <summary>
        /// How often the pruner runs. Six hours rather than at start-up only, so a long-lived
        /// instance keeps pruning, and rather than hourly, because deleting a day's rows once
        /// a day is the same work spread differently.
        /// </summary>
        public int PruneIntervalHours { get; set; } = 6;

        /// <summary>
        /// Set false to stop the pruner entirely - for an investigation where old rows are the
        /// point. Nothing else changes; ingestion carries on.
        /// </summary>
        public bool PruningEnabled { get; set; } = true;

        /// <summary>
        /// The most issues <c>GET api/admin/errors</c> will return. The screen filters and
        /// searches client-side over what it is given, so this is a bound on the response
        /// rather than a page size - if it is ever reached, the section needs paging, not a
        /// bigger number.
        /// </summary>
        public int MaxIssuesReturned { get; set; } = 200;
    }
}
