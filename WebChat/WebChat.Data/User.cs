using System;
using System.ComponentModel.DataAnnotations;
using WebChat.Models.Abstractions;
using WebChat.Models.Interfaces;

namespace WebChat.Models
{
    public class User : BaseEntity, IAuditable, IDeletable
    {
        [MaxLength(60)]
        public string Username { get; set; }

        [Required]
        [MaxLength(60)]
        public string Email { get; set; }

        [Required]
        public string Password { get; set; }

    }
}
