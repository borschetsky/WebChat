namespace WebChat.Models
{
    /// <summary>
    /// How bad a reported client error is, stored on <see cref="ClientErrorIssue.Level"/>.
    ///
    /// String constants rather than an enum, matching <see cref="AccountStatus"/> and
    /// <see cref="WorkspaceRole"/>: the value crosses the wire to a TypeScript client that has
    /// no enum to bind to, and it is stored, so an enum's integer would make the column
    /// unreadable without the code.
    ///
    /// **Only <see cref="Fatal"/> and <see cref="Error"/> are ever produced today.** An error
    /// boundary tripping is fatal - a screen stopped rendering - and anything the global
    /// handlers catch is an error. <see cref="Warning"/> is accepted so that a client which
    /// starts reporting one is not silently downgraded, but nothing in this build sends it.
    /// </summary>
    public static class ClientErrorLevel
    {
        /// <summary>An error boundary caught it: a screen unmounted and the user saw a fallback.</summary>
        public const string Fatal = "fatal";

        /// <summary>Reached a global handler. The app kept running.</summary>
        public const string Error = "error";

        /// <summary>Worth knowing, nothing broke. Nothing in this build reports one.</summary>
        public const string Warning = "warning";

        public static bool IsValid(string level) =>
            level == Fatal || level == Error || level == Warning;

        /// <summary>
        /// The level to store for an unrecognised or missing one. Deliberately not a refusal:
        /// a report from a client one deploy ahead is still worth keeping, and the level only
        /// decides the colour of a dot.
        /// </summary>
        public static string Normalise(string level) => IsValid(level) ? level : Error;
    }
}
