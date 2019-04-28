using System;
using System.Collections.Generic;
using System.Text;

namespace WebChat.Models.ViewModels
{
    public class MessageViewModel
    {
        public string UserId { get; set; }

        public string Text { get; set; }

        public string Username { get; set; }

        public string Time { get; set; }
    }
}
