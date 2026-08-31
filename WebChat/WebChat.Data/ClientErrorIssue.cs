using System;
using System.ComponentModel.DataAnnotations;

namespace WebChat.Models
{
    /// <summary>
    /// One *problem*, not one occurrence: the row an administrator triages.
    ///
    /// **The grouping key is <see cref="Fingerprint"/> and it is deliberately narrow** -
    /// component, function and error name, nothing else. Two things are excluded on purpose:
    ///
    /// - **The message.** A message with an interpolated value in it ("thread t3 not found")
    ///   opens a fresh issue per occurrence, and the section stops being a list of problems
    ///   worth fixing and becomes a log.
    /// - **Any filename or line number.** `vite build` emits content-hashed chunk names and
    ///   ships no production sourcemap, so a hashed name in the key would re-open every issue
    ///   on every deploy - and the line numbers would be minified ones, pointing nowhere.
    ///
    /// The component name therefore has to be supplied by hand rather than read off the stack:
    /// Vite 8's minifier renames `AdminOverviewCard` to `t`. See `AppErrorBoundary` on the
    /// client, which takes a literal `name` prop for exactly this reason.
    ///
    /// **The fingerprint is versioned** (`v1|...`). Re-grouping later - adding the route, say -
    /// means writing `v2|...` and letting the old rows age out through retention, rather than
    /// a migration that would re-open a year of history at once.
    ///
    /// Deliberately not a <see cref="Abstractions.BaseEntity"/>: <c>isDeleted</c> would be a
    /// third status alongside <see cref="Status"/> with no screen behind it, and retention -
    /// not an administrator - is what removes rows here.
    /// </summary>
    public class ClientErrorIssue
    {
        /// <summary>The longest fingerprint that will be stored. Longer ones are truncated.</summary>
        public const int FingerprintLength = 300;

        [Key]
        public string Id { get; set; }

        /// <summary>
        /// <c>v1|{component}|{function}|{name}</c>. Unique - it *is* the identity of the row,
        /// and the id above exists only because the client and the URL need a stable opaque
        /// handle that is not full of pipes and dots.
        /// </summary>
        [Required]
        [MaxLength(FingerprintLength)]
        public string Fingerprint { get; set; }

        /// <summary>One of <see cref="ClientErrorLevel"/>.</summary>
        [Required]
        [MaxLength(20)]
        public string Level { get; set; }

        /// <summary>
        /// The error's <c>name</c> - "TypeError", "ChunkLoadError". Part of the fingerprint,
        /// so a custom error class must set <c>this.name</c> as a **string literal**: a class
        /// name is renamed by the minifier exactly as a component name is.
        /// </summary>
        [Required]
        [MaxLength(100)]
        public string Name { get; set; }

        /// <summary>
        /// The most recent message seen for this fingerprint. Displayed, never grouped on -
        /// see the note on the class. Overwritten by each new occurrence, so it is a sample
        /// rather than a summary.
        /// </summary>
        [MaxLength(500)]
        public string Message { get; set; }

        /// <summary>"ThreadHeader in renderPresence". Component plus function, as reported.</summary>
        [MaxLength(200)]
        public string Culprit { get; set; }

        /// <summary>The path the most recent occurrence happened on.</summary>
        [MaxLength(200)]
        public string Route { get; set; }

        /// <summary>The client release the most recent occurrence came from - "web@0.1.0".</summary>
        [MaxLength(50)]
        public string Release { get; set; }

        /// <summary>
        /// Every occurrence ever ingested, including ones whose event rows retention has since
        /// removed. A cumulative counter, so it does not fall when the events table is pruned -
        /// which means it can legitimately exceed the sum of the sparkline.
        /// </summary>
        public int Events { get; set; }

        /// <summary>
        /// UTC, like everything stored here: the column is <c>timestamp with time zone</c> and
        /// Npgsql throws on a Local or Unspecified Kind rather than guessing.
        /// </summary>
        [DataType(DataType.DateTime)]
        public DateTime FirstSeenUtc { get; set; }

        /// <summary>UTC. Indexed descending - the list is only ever read newest-first.</summary>
        [DataType(DataType.DateTime)]
        public DateTime LastSeenUtc { get; set; }

        /// <summary>One of <see cref="ClientErrorStatus"/>.</summary>
        [Required]
        [MaxLength(20)]
        public string Status { get; set; }

        /// <summary>The most recent stack trace, as a JSON array of frame strings.</summary>
        public string StackJson { get; set; }

        /// <summary>
        /// The most recent breadcrumb trail, as a JSON array of <c>{t,k,v}</c> objects. The
        /// trail belongs to one occurrence and is replaced wholesale by the next: merging
        /// trails from different sessions would produce a sequence that never happened.
        /// </summary>
        public string CrumbsJson { get; set; }
    }
}
