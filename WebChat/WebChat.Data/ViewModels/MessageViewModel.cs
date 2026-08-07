using System;
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

        /// <summary>
        /// The sender's avatar, so a message row can draw the person who wrote it.
        ///
        /// Null when they have not uploaded one - the client falls back to initials, and a
        /// placeholder name here would make it request an image that does not exist on every
        /// render.
        /// </summary>
        public string AvatarFileName { get; set; }

        public DateTime Time { get; set; }

        public DateTime Date { get; set; }
    }
}
