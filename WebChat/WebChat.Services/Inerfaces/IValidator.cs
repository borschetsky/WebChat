using System;
using System.Collections.Generic;
using System.Text;
using WebChat.Models;

namespace WebChat.Services.Inerfaces
{
    public interface IValidator
    {
        bool DoesThreadExist(string id);

        bool DoesUserBelongToCurentThread(string threadId, string userId);
    }
}
