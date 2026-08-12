namespace WebChat.Models
{
    /// <summary>Discriminates an ordinary message from a system one.</summary>
    public static class MessageType
    {
        public const string User = "user";

        public const string System = "system";
    }

    /// <summary>
    /// What a system message records. The client turns one of these plus its structured data
    /// into a sentence; nothing here is ever displayed verbatim.
    /// </summary>
    public static class SystemKind
    {
        public const string Rename = "rename";

        public const string MembersAdded = "members_added";

        public const string MemberRemoved = "member_removed";

        public const string MemberLeft = "member_left";

        public const string RoleChanged = "role_changed";

        public const string OwnerTransferred = "owner_transferred";

        public const string GroupCreated = "group_created";

        /// <summary>
        /// The member's whole account was deactivated, so they left every group at once.
        ///
        /// Distinct from <see cref="MemberRemoved"/> on purpose. A removal names an actor who
        /// had authority *in that group*; a deactivation is a workspace act, and the
        /// administrator behind it has no standing inside the group at all - saying "Maya
        /// removed Ben" there would assert an authority the spec deliberately withholds.
        /// The group is told what happened to the person, not who did it.
        /// </summary>
        public const string MemberDeactivated = "member_deactivated";
    }
}
