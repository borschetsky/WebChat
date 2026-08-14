using System.Collections.Generic;

namespace WebChat.Models
{
    /// <summary>
    /// The workspace policies that actually enforce something.
    ///
    /// **This catalogue is deliberately shorter than the screen.** The design draws nine
    /// switches; eight of them had no code path that reads them. A toggle with no enforcement
    /// point is worse than a mock: a mock is obviously a mock, while a switch backed by a
    /// database tells the one person whose job is to know how the workspace is configured
    /// that it is configured a way it is not. So a key appears here only once something reads
    /// it, and the client renders every other row as not yet enforced rather than as a
    /// working control.
    ///
    /// That also makes the wire contract the safe way round: the server says which policies
    /// are real, so a client that is one deploy *ahead* shows a row as inert rather than
    /// offering a switch nothing honours.
    ///
    /// String constants rather than an enum, for the reason <see cref="AuditAction"/> gives:
    /// the value crosses the wire to a TypeScript client and is also stored, and an enum's
    /// integer would make the stored JSON unreadable without the code.
    /// </summary>
    public static class WorkspacePolicy
    {
        /// <summary>
        /// Whether a plain member may create a group. Read by <c>POST /hey/creategroup</c>;
        /// owners and admins are unaffected either way.
        /// </summary>
        public const string MembersCanCreateGroups = "members_can_create_groups";

        /// <summary>
        /// The enforced policies and the value each has until somebody changes it.
        ///
        /// Defaults are what the workspace did before the policy existed, always. Shipping a
        /// policy that changes behaviour on deployment would mean an upgrade silently taking
        /// something away from every member, which no release note reliably prevents.
        /// </summary>
        public static readonly IReadOnlyDictionary<string, bool> Defaults =
            new Dictionary<string, bool>
            {
                [MembersCanCreateGroups] = true,
            };

        /// <summary>
        /// Behaviour that is enforced unconditionally and is not a choice.
        ///
        /// The screen draws "End sessions on password change" as a switch. It is not one: a
        /// password change rotates <c>User.SecurityStamp</c>, and every token signed with the
        /// previous stamp stops authenticating on its next request. Offering to turn that off
        /// would be offering to make password reset stop ending a compromise, so this is sent
        /// to the client as a locked, always-on row instead - true, and not switchable.
        ///
        /// It lives here rather than in the client's copy so the server stays the authority on
        /// what the server actually does.
        /// </summary>
        public static readonly IReadOnlyList<string> AlwaysOn = new[]
        {
            "sessions_end_on_password_change",
        };

        public static bool IsKnown(string key) => key != null && Defaults.ContainsKey(key);
    }
}
