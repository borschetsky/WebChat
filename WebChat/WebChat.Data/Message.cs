using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text;
using WebChat.Models.Abstractions;

namespace WebChat.Models
{
    public class Message : BaseEntity
    {
        public Message()
        {
            base.CreatedOn = DateTime.Now;
        }

        public string Text { get; set; }

        public string SenderId { get; set; }
        [Required]
        public User Sender { get; set; }

        public string ThreadId { get; set; }
        [Required]
        public Thread Thread { get; set; }


    }
}
