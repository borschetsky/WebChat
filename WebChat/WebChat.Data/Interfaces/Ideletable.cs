using System;
using System.Collections.Generic;
using System.Text;

namespace WebChat.Models.Interfaces
{
    public interface IDeletable
    {
        bool isDeleted { get; set; }

        DateTime? DeletedOn { get; set; }
    }
}
