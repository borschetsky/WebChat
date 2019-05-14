using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using System.Threading.Tasks;

namespace WebChat.Models.ViewModels
{
    public class ThreadViewModel
    {
        public string Id { get; set; }
        [Required]
        public string Owner { get; set; }

        //public string OwnerName { get; set; }

        //public string Oponent { get; set; }

        //public string OponentName { get; set; }

        public LastMessageViewModel LastMessage { get; set; }
        [Required]
        public OponentViewModel OponentVM { get; set; }

    }
}
