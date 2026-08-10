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
    }
}
