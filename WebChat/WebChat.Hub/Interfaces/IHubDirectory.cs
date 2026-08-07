using System.Collections.Generic;

namespace WebChat.Hubs.Interfaces
{
    /// <summary>
    /// The two questions the hub has to answer before it can address anyone: who is in a
    /// thread, and what is a user called.
    ///
    /// The interface lives here rather than in WebChat.Services because the reference runs
    /// the other way - WebChat.Services references WebChat.Hubs, so a hub that called a
    /// service directly would be a project cycle. Same inversion as IConnectionMapping:
    /// the hub owns the contract, WebChat.Services implements it, and the host wires them
    /// together.
    /// </summary>
    public interface IHubDirectory
    {
        /// <summary>Everyone in the thread, including the caller. Empty if it does not exist.</summary>
        IReadOnlyList<string> GetParticipantIds(string threadId);

        /// <summary>Display name for a user id, or null when there is no such user.</summary>
        string GetUserNameById(string userId);

        /// <summary>
        /// Everyone who shares at least one thread with this user, excluding the user.
        /// This is the audience for their presence: someone you have never had a
        /// conversation with has no reason to be told you came online.
        /// </summary>
        IReadOnlyList<string> GetPeerIds(string userId);
    }
}
