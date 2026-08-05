using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using System.Threading.Tasks;

namespace WebChat.Models.ViewModels
{
    public class ThreadViewModel
    {
        public string Id { get; set; }
        
        public string Owner { get; set; }

        //public string OwnerName { get; set; }

        //public string Oponent { get; set; }

        //public string OponentName { get; set; }

        public LastMessageViewModel LastMessage { get; set; }

        /// <summary>
        /// The other person, for a direct thread. Null for a group, which is named rather
        /// than defined by who is not you.
        ///
        /// Kept - rather than replaced by <see cref="Members"/> alone - because renaming it
        /// would break every existing client call site at once for no benefit. The client
        /// switches on <see cref="IsGroup"/>.
        ///
        /// No longer [Required]: a group has none, and the attribute would reject the very
        /// payload that creates one.
        /// </summary>
        public OponentViewModel OponentVM { get; set; }

        public bool IsGroup { get; set; }

        /// <summary>Group name. Null for a direct thread, which is named after the other person.</summary>
        public string Name { get; set; }

        /// <summary>
        /// Everyone in the thread except the caller. Populated for groups; a direct thread
        /// says the same thing through <see cref="OponentVM"/>.
        /// </summary>
        public List<OponentViewModel> Members { get; set; }

    }
}
