using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace WebChat.ViewModels
{
    public class CreateGroupViewModel
    {
        /// <summary>
        /// Optional. Blank or absent means nobody named this group, and its title is derived
        /// from current membership on every read.
        ///
        /// No longer [Required]: the compose dialog shows the auto-name as a *placeholder*, so
        /// submitting an empty field is the expected path rather than an error. StringLength
        /// still applies to a name that is actually given.
        /// </summary>
        [StringLength(60)]
        public string Name { get; set; }

        /// <summary>
        /// Who to add, not counting the creator - they are added by the server, so a client
        /// cannot create a group it is not in.
        ///
        /// One member is enough. A group of two is a legitimate thing to want and is not the
        /// same as a direct thread: it has a name, and more people can be added to it.
        /// </summary>
        [Required]
        [MinLength(1)]
        public List<string> MemberIds { get; set; }
    }
}
