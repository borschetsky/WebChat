namespace WebChat.Models
{
    /// <summary>
    /// Where an account stands with the workspace, stored on <see cref="User.Status"/>.
    ///
    /// **The four are genuinely distinct and must not be collapsed** - `SPEC-groups-and-admin.md`
    /// is explicit, and the distinctions are the ones an administrator is actually asked
    /// about: "has this person ever signed in", "can they sign in now", "did we keep what
    /// they wrote". Folding blocked and deactivated together loses the difference between a
    /// suspension and an offboarding.
    ///
    /// String constants rather than an enum, matching <see cref="WorkspaceRole"/> and
    /// <see cref="GroupRole"/>: the values cross the wire to a TypeScript client that has no
    /// enum to bind to, and they are stored, so an enum's integer would make the column
    /// unreadable without the code.
    /// </summary>
    public static class AccountStatus
    {
        /// <summary>Signed in and usable.</summary>
        public const string Active = "active";

        /// <summary>Invited, never activated. No sign-in has ever happened.</summary>
        public const string Pending = "pending";

        /// <summary>
        /// Suspended. The account and everything it wrote are kept, every session is ended,
        /// and sign-in is refused. Reversible, and meant to be.
        /// </summary>
        public const string Blocked = "blocked";

        /// <summary>
        /// Offboarded: sessions ended, and removed from every group. History is still kept -
        /// this is not a delete - but rejoining is a new act, not an unblock.
        /// </summary>
        public const string Deactivated = "deactivated";

        public static bool IsValid(string status) =>
            status == Active || status == Pending || status == Blocked || status == Deactivated;

        /// <summary>
        /// Whether the account may authenticate. Read on every request, alongside the
        /// security stamp - see <c>Startup.OnTokenValidated</c>.
        /// </summary>
        public static bool CanSignIn(string status) => status == Active;

        /// <summary>
        /// Whether moving to this status must end existing sessions. Both denying statuses
        /// do; the pair is named here so a caller cannot implement one and forget the other.
        /// </summary>
        public static bool EndsSessions(string status) => status == Blocked || status == Deactivated;
    }
}
