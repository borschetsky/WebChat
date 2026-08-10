using System;
using System.Collections.Generic;
using System.Text;

namespace WebChat.Models.ViewModels
{
    public class LastMessageViewModel
    {
        
        public string Text { get; set; }

        public DateTime Time { get; set; }

        public string SenderId { get; set; }

        /// <summary>
        /// The sender's display name.
        ///
        /// Needed because the client resolves names from the thread's member list, and the
        /// one system message whose actor is guaranteed *not* to be in it is "left the
        /// group" - so that preview read "Someone left the group" every time, for everyone.
        /// </summary>
        public string Username { get; set; }

        /// <summary>
        /// Set when the newest thing in the thread is a system message.
        ///
        /// The spec keeps system messages out of the unread count but explicitly *in* the
        /// thread-list preview, so a group whose last event was a rename must not read as
        /// "No messages yet" - which is what a null <see cref="Text"/> alone produces. The
        /// client builds the sentence from these, and skips the author prefix, because
        /// "Maya: You renamed the group" would be wrong twice over.
        /// </summary>
        public string Type { get; set; }

        public string SystemKind { get; set; }

        /// <summary>Raw JSON from the column; the host re-parses it. See SystemDataJson.</summary>
        public object SystemData { get; set; }

        /// <summary>Ids in <see cref="SystemData"/> resolved to names; see MessageViewModel.</summary>
        public Dictionary<string, string> SystemNames { get; set; }
    }
}
