using System;
using System.Collections;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using WebChat.Models.Abstractions;
using WebChat.Models.Interfaces;

namespace WebChat.Models
{
    public class User : BaseEntity, IAuditable, IDeletable
    {
        public User()
        {
            Messages = new HashSet<Message>();
        }
        [MaxLength(60)]
        public string Username { get; set; }

        [Required]
        [MaxLength(60)]
        public string Email { get; set; }

        [Required]
        public string Password { get; set; }

        public string AvatarFileName { get; set; }

        public ICollection<Message> Messages { get; set; }

        public ICollection<Thread> Threads { get; set; }

        

    }
}
