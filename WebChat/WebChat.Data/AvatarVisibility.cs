namespace WebChat.Models
{
    /// <summary>
    /// One rule, in one place: a user whose photo has been removed (#89) has **no avatar** on
    /// every read path, while the object keys and the crop rectangle stay in the row so Undo
    /// can put them back exactly.
    ///
    /// The rule is a rule and not a database fact, which is what makes it easy to get wrong:
    /// <see cref="User.AvatarFileName"/> is still populated after a removal, so any projection
    /// that reads the column directly keeps serving the removed photo. There are seven such
    /// projections across the services and controllers, and a removal that is respected by six
    /// of them is worse than one respected by none - the photo would vanish from the settings
    /// drawer and stay on every message the user has ever sent.
    ///
    /// Two spellings for two callers, because they cannot be the same code:
    /// <see cref="For(User)"/> runs in memory over a loaded entity, while EF projections need
    /// the ternary written inline so it translates to SQL. Every inline site names this class
    /// in a comment, so the set is greppable.
    /// </summary>
    public static class AvatarVisibility
    {
        /// <summary>
        /// The avatar file name a loaded user should be shown as having: theirs, or null while
        /// a removal is pending. Null for a null user, which is what
        /// <c>MapUserModelToUserViewModel</c>'s callers already tolerate.
        /// </summary>
        public static string For(User user) =>
            user == null || user.AvatarRemovedAt != null ? null : user.AvatarFileName;
    }
}
