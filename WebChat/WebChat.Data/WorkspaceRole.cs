namespace WebChat.Models
{
    /// <summary>
    /// A user's role across the whole workspace, stored on <see cref="User.Role"/>.
    ///
    /// **Not related to <see cref="GroupRole"/>, and deliberately so.** `SPEC-groups-and-admin.md`
    /// §2: "A workspace Admin has no authority inside a group they do not administer. This is
    /// deliberate: it stops the admin console being a backdoor into private conversations."
    /// <c>GroupPermissions</c> must never read this type - if it ever needs to, that is a
    /// product decision requiring an explicit, audited, confirmed action, not a quiet grant.
    ///
    /// String constants rather than an enum, matching <see cref="GroupRole"/>: the values
    /// cross the wire to a TypeScript client that has no enum to bind to.
    /// </summary>
    public static class WorkspaceRole
    {
        /// <summary>Can do anything, including appointing and removing admins.</summary>
        public const string Owner = "owner";

        /// <summary>Runs the admin console. Cannot change who owns the workspace.</summary>
        public const string Admin = "admin";

        /// <summary>Everyone else. The default, and what registration assigns.</summary>
        public const string Member = "member";

        public static bool IsValid(string role) =>
            role == Owner || role == Admin || role == Member;

        /// <summary>
        /// Whether the role may reach the admin console at all. Used for the coarse gate;
        /// anything finer belongs with the action it guards.
        /// </summary>
        public static bool CanAdminister(string role) => role == Owner || role == Admin;
    }
}
