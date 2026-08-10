using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text;
using WebChat.Models.Abstractions;

namespace WebChat.Models
{
    public class Message : BaseEntity
    {
        public Message()
        {
            base.CreatedOn = DateTime.UtcNow;
        }

        public string Text { get; set; }

        public string SenderId { get; set; }
        [Required]
        public User Sender { get; set; }

        public string ThreadId { get; set; }
        [Required]
        public Thread Thread { get; set; }

        /// <summary>
        /// <c>"user"</c> or <c>"system"</c>. System messages are real stored rows rather than
        /// presentation-only events, because they have to appear at the right point in scroll
        /// history, survive a reload, and paginate with everything else - none of which a
        /// client-side event stream gives you without reimplementing pagination.
        /// </summary>
        public string Type { get; set; } = MessageType.User;

        /// <summary>
        /// Which system event this row records - see <see cref="SystemKind"/>. Null on an
        /// ordinary message.
        /// </summary>
        public string SystemKind { get; set; }

        /// <summary>
        /// The facts, as JSON; the client renders the sentence. Null on an ordinary message.
        /// </summary>
        /// <remarks>
        /// Structured rather than a rendered string so the wording is not frozen in whatever
        /// language the actor happened to be using, and so a display name that changes later
        /// does not leave the history quoting a name nobody recognises. <see cref="Text"/>
        /// stays null on these rows for the same reason.
        ///
        /// Note the author: <see cref="SenderId"/> is the **actor's real user id**, not a
        /// sentinel. Every system message here has a human behind it, and "Maya renamed the
        /// group" is authored by Maya - which also means the non-nullable foreign key and
        /// every join through it keep working untouched.
        /// </remarks>
        public string SystemData { get; set; }


    }
}
