using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Text;

namespace WebChat.Models.ViewModels
{
    public class ProfileViewModel
    {
        [Required]
        public string Id { get; set; }
        [Required]
        public string Username { get; set; }
        [Required]
        public string Email { get; set; }

        public string AvatarFileName { get; set; }

        /// <summary>
        /// Workspace role, so the settings drawer can render the role chip and decide whether
        /// to show the admin console row at all. Presentation only - every admin endpoint
        /// re-checks server-side, because hiding a row is not authorization.
        /// </summary>
        public string Role { get; set; }
    }
}
