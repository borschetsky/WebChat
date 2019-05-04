using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace WebChat.Models.ViewModels
{
    public class ThreadViewModel
    {
        public string Id { get; set; }

        public string Owner { get; set; }

        public string OwnerName { get; set; }

        public string Oponent { get; set; }

        public string OponentName { get; set; }

        public string LastMessage { get; set; }

    }
}
