namespace WebChat.Models
{
    /// <summary>
    /// What an audit entry records.
    ///
    /// String constants rather than an enum, for the same reason as <see cref="GroupRole"/>
    /// and <see cref="WorkspaceRole"/>: the value crosses the wire to a TypeScript client
    /// that has no enum to bind to. It is also stored, so an enum's integer would make the
    /// table unreadable without the code.
    ///
    /// These names are the client's rendering key - <c>AuditRow</c> maps each to an icon and
    /// a colour, and <c>auditSentence.ts</c> maps each to a sentence. Renaming one silently
    /// drops both, so a new value needs a case on the client before it is ever written.
    /// </summary>
    public static class AuditAction
    {
        /// <summary>An account was blocked. Sessions ended, history kept.</summary>
        public const string Block = "block";

        /// <summary>A blocked account was let back in.</summary>
        public const string Unblock = "unblock";

        /// <summary>An account was offboarded and removed from every group.</summary>
        public const string Deactivate = "deactivate";

        /// <summary>A deactivated or pending account became usable.</summary>
        public const string Activate = "activate";

        /// <summary>A workspace role changed. Not a group role - those are system messages.</summary>
        public const string Role = "role";

        /// <summary>An invitation was issued, resent, extended or revoked.</summary>
        public const string Invite = "invite";

        /// <summary>A workspace policy was changed.</summary>
        public const string Policy = "policy";

        /// <summary>A sign-in worth noticing - currently a refusal, not every success.</summary>
        public const string Login = "login";
    }
}
