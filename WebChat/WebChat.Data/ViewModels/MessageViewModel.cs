﻿using System;
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
        
        public DateTime Time { get; set; }

        public DateTime Date { get; set; }
    }
}
