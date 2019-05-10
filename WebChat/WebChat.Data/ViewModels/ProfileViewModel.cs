using System;
using System.Collections.Generic;
using System.Text;

namespace WebChat.Models.ViewModels
{
    public class ProfileViewModel
    {
        public string Id { get; set; }

        public string Username { get; set; }

        public string Email { get; set; }

        public string AvatarFileName { get; set; }
    }
}
