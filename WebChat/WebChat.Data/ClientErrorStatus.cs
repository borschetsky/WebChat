namespace WebChat.Models
{
    /// <summary>
    /// Where an administrator has got to with a client-error issue.
    ///
    /// Three states rather than a boolean, because "somebody has looked at this" and "this is
    /// fixed" are different answers and the screen filters on both. String constants for the
    /// same wire and storage reasons as <see cref="AccountStatus"/>.
    /// </summary>
    public static class ClientErrorStatus
    {
        /// <summary>Nobody has triaged it. The state every new issue starts in.</summary>
        public const string New = "new";

        /// <summary>Seen and accepted as a real problem; not fixed.</summary>
        public const string Acknowledged = "acknowledged";

        /// <summary>
        /// Believed fixed. **Not a delete and not a mute** - a resolved issue that happens
        /// again keeps counting events and moves its last-seen forward, which is the only way
        /// a regression is visible at all. Retention is what eventually removes it; see
        /// <c>ClientErrorOptions</c>.
        /// </summary>
        public const string Resolved = "resolved";

        public static bool IsValid(string status) =>
            status == New || status == Acknowledged || status == Resolved;
    }
}
