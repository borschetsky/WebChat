﻿using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace WebChat.ViewModels
{
    public class UserViewModel
    {
        public string Id { get; set; }

        public string Username { get; set; }

        public bool IsOnline { get; set; }
    }
}
