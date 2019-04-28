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

        public string UserId { get; set; }
        [Required]
        public User User { get; set; }




    }
}
