namespace WebChat.Models.ViewModels
{
    /// <summary>
    /// What every connected client is told when somebody saves their profile
    /// (<c>ReviceUpdatedOpponentProfile</c>) - and deliberately nothing more (#94).
    ///
    /// This exists because <see cref="ProfileViewModel"/> was being broadcast instead, and a
    /// profile is not a broadcast: it carries <c>Email</c> and <c>Role</c>, which are for the
    /// person they belong to and for nobody else. The hub fans this out to everyone, including
    /// people who share no conversation with the user, so the only defensible payload is the
    /// three fields another client needs in order to redraw a name and a face.
    ///
    /// Two rules keep it honest, and both are pinned by tests:
    ///
    /// - **Projected from the persisted row, never from the request.** The controller used to
    ///   relay the model it had been handed, so fields the server does not even store - the
    ///   avatar key among them - were dictated by the caller and repeated to everyone.
    /// - **<see cref="AvatarFileName"/> obeys <see cref="AvatarVisibility"/>.** A removed
    ///   photo (#89) keeps its key in the row so Undo can restore it, so reading the column
    ///   raw here would put the photo back on every other client's thread list the next time
    ///   its owner changed their name.
    ///
    /// Adding a field here means asking who receives it: the audience is *everyone signed in*,
    /// not the user's contacts.
    /// </summary>
    public class ProfileBroadcastViewModel
    {
        /// <summary>Who changed. Clients match this against the thread they hold.</summary>
        public string Id { get; set; }

        /// <summary>The saved username, which is what the thread list re-titles itself with.</summary>
        public string Username { get; set; }

        /// <summary>
        /// The avatar this user should now be drawn with, or null - including null because
        /// the photo is removed.
        /// </summary>
        public string AvatarFileName { get; set; }
    }
}
