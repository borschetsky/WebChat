using System;
using System.Collections.Generic;

namespace WebChat.Models.ViewModels
{
    /// <summary>One breadcrumb: a time, a kind, and what happened.</summary>
    public class AdminErrorCrumbViewModel
    {
        /// <summary>
        /// A wall-clock time as the *client* saw it - "12:04:02". A string rather than an
        /// instant, and that is the one deliberate exception to this console's "never send a
        /// rendered value" rule: a breadcrumb trail is read as a sequence relative to the
        /// error, in the timezone of the person who hit it, and re-deriving that from a
        /// server-side instant would show the reader their own clock instead of the user's.
        /// </summary>
        public string T { get; set; }

        /// <summary>"navigation", "fetch", "ui.click", "exception".</summary>
        public string K { get; set; }

        public string V { get; set; }
    }

    /// <summary>
    /// One row of the UI errors section: a fingerprint, with everything the screen shows.
    ///
    /// Shaped to the client's existing <c>AdminError</c> view model rather than the other way
    /// round - the shape was written when the section was a mock, and it is a good shape, so
    /// this is the DTO that fits it.
    /// </summary>
    public class AdminErrorViewModel
    {
        public string Id { get; set; }

        /// <summary>One of <see cref="ClientErrorLevel"/>.</summary>
        public string Level { get; set; }

        public string Name { get; set; }

        /// <summary>The most recent message, which is a sample and not the grouping key.</summary>
        public string Message { get; set; }

        public string Culprit { get; set; }

        public string Route { get; set; }

        public string Release { get; set; }

        /// <summary>Every occurrence ever ingested - see <see cref="ClientErrorIssue.Events"/>.</summary>
        public int Events { get; set; }

        /// <summary>
        /// Distinct people **within the retained event window**, not for all time. Counting it
        /// for all time would need a row per user kept forever, which is the growth this design
        /// exists to avoid; and "how many people is this hitting now" is the question an
        /// administrator is actually asking.
        /// </summary>
        public int Users { get; set; }

        public DateTime FirstSeenUtc { get; set; }

        public DateTime LastSeenUtc { get; set; }

        /// <summary>One of <see cref="ClientErrorStatus"/>.</summary>
        public string Status { get; set; }

        /// <summary>
        /// "Chrome 141 · Safari 18", or "Unknown" when no retained event carries one. A
        /// rendered join rather than a list, matching what the screen draws; if it ever needs
        /// to be sorted or filtered on, that is the moment to change this to a list.
        /// </summary>
        public string Browsers { get; set; }

        /// <summary>
        /// Fourteen daily counts, oldest first, **including days with none**. Gap-filled for
        /// the same reason the Overview chart is: without it a quiet day disappears and the
        /// bars silently re-space, so two sparklines of the same fortnight look different.
        /// </summary>
        public List<int> Spark { get; set; } = new();

        /// <summary>The most recent stack trace, one frame per entry.</summary>
        public List<string> Stack { get; set; } = new();

        public List<AdminErrorCrumbViewModel> Crumbs { get; set; } = new();
    }
}
