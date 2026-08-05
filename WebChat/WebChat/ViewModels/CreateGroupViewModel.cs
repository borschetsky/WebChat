using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace WebChat.ViewModels
{
    public class CreateGroupViewModel
    {
        [Required]
        [StringLength(60, MinimumLength = 1)]
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
