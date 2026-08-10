using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Text;

namespace WebChat.Models.ViewModels
{
    public class MessageViewModel
    {
        public string Id { get; set; }

        [Required]
        public string SenderId { get; set; }
        [Required]
        public string Text { get; set; }

        [Required]
        public string ThreadId { get; set; }

        public string Username { get; set; }

        /// <summary>
        /// The sender's avatar, so a message row can draw the person who wrote it.
        ///
        /// Null when they have not uploaded one - the client falls back to initials, and a
        /// placeholder name here would make it request an image that does not exist on every
        /// render.
        /// </summary>
        public string AvatarFileName { get; set; }

        public DateTime Time { get; set; }

        public DateTime Date { get; set; }

        /// <summary>
        /// <c>MessageType.User</c> or <c>MessageType.System</c>. A system row has a null
        /// <see cref="Text"/> and carries its facts in <see cref="SystemData"/> instead - the
        /// client renders the sentence, so nothing is frozen in one language or in a display
        /// name that changes later.
        /// </summary>
        public string Type { get; set; }

        public string SystemKind { get; set; }

        /// <summary>
        /// The structured facts, as JSON.
        ///
        /// Typed <c>object</c> rather than <c>string</c> because the client receives an
        /// object: the projection puts the raw column here and the host re-parses it before
        /// serializing, so the shape matches the one the group endpoints return. Sending the
        /// JSON as a string would make the client parse a different shape depending on which
        /// route the same message arrived by.
        /// </summary>
        public object SystemData { get; set; }

        /// <summary>
        /// The user ids inside <see cref="SystemData"/>, resolved to display names at read
        /// time. Present because the client resolves ids against the thread's *current*
        /// members, and the person a system message is about has often just left it.
        /// </summary>
        public Dictionary<string, string> SystemNames { get; set; }
    }
}
