using WebChat.Models;

namespace WebChat.Services
{
    /// <summary>The four actions the permission map governs, plus the two it does not.</summary>
    public enum GroupAction
    {
        Rename,
        Invite,
        Remove,

        /// <summary>Promote or demote. Not in the map - admins and the owner, always.</summary>
        SetRole,

        /// <summary>Change the permission map itself. Owner only, never configurable.</summary>
        SetPermissions,

        /// <summary>Hand the group to someone else. Owner only.</summary>
        TransferOwnership,
    }

    /// <summary>
    /// Answers "may this member do this here", and nothing else.
    ///
    /// Pure and static on purpose. This is an authorization boundary, and the last one in this
    /// repo - the two-participant check in <c>Validator</c> - was both wrong and hard to test
    /// because it was tangled up with loading the thread. Keeping the decision separate from
    /// the fetching means the rules can be tested exhaustively without a database.
    ///
    /// Rules the permission map deliberately cannot override, because a group that can reach
    /// these states is unrecoverable through the UI:
    ///
    ///   - the Owner cannot be removed, by anybody, at any permission level;
    ///   - only the Owner transfers ownership or edits the permission map;
    ///   - nobody may promote themselves.
    /// </summary>
    public static class GroupPermissions
    {
        /// <summary>
        /// <paramref name="actorRole"/> is the actor's <see cref="GroupRole"/>, or null when
        /// they are not a member at all - which is always a refusal, never a fall-through to
        /// "everyone".
        /// </summary>
        public static bool Can(GroupAction action, string actorRole, Thread thread)
        {
            // Not a member. The 'everyone' level means every *member*, not every user - the
            // difference is the whole point of the membership table.
            if (actorRole == null || !GroupRole.IsValid(actorRole))
            {
                return false;
            }

            var isOwner = actorRole == GroupRole.Owner;
            var isAdmin = isOwner || actorRole == GroupRole.Admin;

            switch (action)
            {
                case GroupAction.SetPermissions:
                case GroupAction.TransferOwnership:
                    return isOwner;

                // Not configurable: an admin who could not manage roles could not do the job,
                // and a member who could would make the map meaningless.
                case GroupAction.SetRole:
                    return isAdmin;

                case GroupAction.Rename:
                    return Allows(thread?.PermRename, isOwner, isAdmin);

                case GroupAction.Invite:
                    return Allows(thread?.PermInvite, isOwner, isAdmin);

                case GroupAction.Remove:
                    return Allows(thread?.PermRemove, isOwner, isAdmin);

                default:
                    return false;
            }
        }

        /// <summary>
        /// Whether <paramref name="actorRole"/> may remove <paramref name="targetRole"/>.
        ///
        /// Separate from <see cref="Can"/> because removal depends on the target as well as
        /// the actor: **the Owner is not removable**, whatever the map says. A group whose
        /// owner has been removed has nobody who can transfer ownership, and no way back
        /// through the UI.
        /// </summary>
        public static bool CanRemove(string actorRole, string targetRole, Thread thread)
        {
            if (targetRole == GroupRole.Owner)
            {
                return false;
            }

            return Can(GroupAction.Remove, actorRole, thread);
        }

        /// <summary>
        /// Whether the actor may set <paramref name="targetRole"/> on someone else.
        ///
        /// Owner is excluded: becoming owner happens through a transfer, which demotes the
        /// previous owner in the same transaction. Allowing it here would be the one path to
        /// a group with two owners.
        /// </summary>
        public static bool CanSetRole(string actorRole, string targetRole, Thread thread)
        {
            if (targetRole == GroupRole.Owner || !GroupRole.IsValid(targetRole))
            {
                return false;
            }

            return Can(GroupAction.SetRole, actorRole, thread);
        }

        /// <summary>
        /// Whether the actor may leave. The Owner may not - the UI offers "Transfer ownership
        /// before leaving" instead, because the alternative is an ownerless group.
        /// </summary>
        public static bool CanLeave(string actorRole) =>
            GroupRole.IsValid(actorRole) && actorRole != GroupRole.Owner;

        private static bool Allows(string level, bool isOwner, bool isAdmin) => level switch
        {
            PermissionLevel.Everyone => true,
            PermissionLevel.Admins => isAdmin,
            PermissionLevel.Owner => isOwner,

            // An unrecognised or missing level denies rather than defaults. A typo in the
            // database should close a door, not open one.
            _ => false,
        };
    }
}
