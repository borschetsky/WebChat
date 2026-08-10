namespace WebChat.Models
{
    /// <summary>
    /// A member's role **within one conversation**, stored on the membership row rather than
    /// on the user.
    ///
    /// Deliberately independent of any workspace-level role. A workspace administrator has no
    /// authority inside a group they do not administer, which is what stops an admin console
    /// becoming a backdoor into private conversations. If that is ever relaxed it must be an
    /// explicit, audited action with its own confirmation - never an implicit grant.
    ///
    /// Strings rather than an enum column: the values cross the wire to a TypeScript client
    /// that has no enum to bind to, and a stored integer whose meaning lives only in C# is the
    /// kind of thing a later migration reorders by accident.
    /// </summary>
    public static class GroupRole
    {
        /// <summary>Exactly one per group. Cannot be removed, and must transfer before leaving.</summary>
        public const string Owner = "owner";

        /// <summary>Everything the permission map grants to admins.</summary>
        public const string Admin = "admin";

        /// <summary>Read and post.</summary>
        public const string Member = "member";

        public static bool IsValid(string role) =>
            role == Owner || role == Admin || role == Member;
    }

    /// <summary>
    /// Who may perform one group action, stored per group as part of the permission map.
    /// </summary>
    public static class PermissionLevel
    {
        public const string Owner = "owner";

        public const string Admins = "admins";

        public const string Everyone = "everyone";

        public static bool IsValid(string level) =>
            level == Owner || level == Admins || level == Everyone;
    }
}
