using System;

namespace WebChat.Models.ViewModels
{
    /// <summary>
    /// One row of the admin console's members table.
    ///
    /// **Every time is an instant, never a rendered string.** The server cannot know when the
    /// page will be read, and this is a screen people leave open; the client formats through
    /// `lib/date-time-format.ts`. The mocks this replaces held `"2 min ago"`, which is the
    /// mistake being corrected - see the note on `types/admin.ts`.
    /// </summary>
    public class AdminMemberViewModel
    {
        public string Id { get; set; }

        public string Name { get; set; }

        public string Email { get; set; }

        /// <summary>Workspace role, lower-case on the wire; the client capitalises.</summary>
        public string Role { get; set; }

        /// <summary>One of <see cref="AccountStatus"/>.</summary>
        public string Status { get; set; }

        public string AvatarFileName { get; set; }

        /// <summary>
        /// Whether they hold a live hub connection right now. Not persisted anywhere - it is
        /// read from the connection registry, so it is true presence rather than a
        /// last-seen guess.
        /// </summary>
        public bool Online { get; set; }

        /// <summary>
        /// Best available "last active", which is currently the newest message they sent.
        ///
        /// Honest about what it is: the app records no general activity timestamp, so an
        /// account that reads constantly and never writes looks idle. Null for someone who
        /// has never sent anything, which the client renders as an em dash rather than
        /// inventing a date.
        /// </summary>
        public DateTime? LastActiveUtc { get; set; }

        public DateTime JoinedUtc { get; set; }

        /// <summary>How many groups they are in. Direct threads are not groups.</summary>
        public int Groups { get; set; }

        /// <summary>
        /// Live hub connections, which is the only countable thing here. It is not "sessions"
        /// - a JWT cannot be counted once issued - and the field is named for what it
        /// measures rather than for what the design mock called it.
        /// </summary>
        public int Connections { get; set; }

        /// <summary>Whether the address has been proven reachable.</summary>
        public bool EmailConfirmed { get; set; }
    }
}
