using System;
using System.Collections.Generic;
using System.Text;

namespace WebChat.Models.Interfaces
{
    public interface IAuditable
    {
        DateTime CreatedOn { get; set; }

        DateTime? ModifiedOn { get; set; }
    }
}
