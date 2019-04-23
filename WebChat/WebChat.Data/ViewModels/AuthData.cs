using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace WebChat.Models.ViewModels
{
    public class AuthData
    {
        public string Token { get; set; }

        public long TokenExirationTime { get; set; }

        public string Id { get; set; }
    }

}
