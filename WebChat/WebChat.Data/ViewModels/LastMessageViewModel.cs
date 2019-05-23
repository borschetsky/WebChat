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
    }
}
