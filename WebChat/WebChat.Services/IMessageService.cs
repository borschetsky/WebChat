using System;
using System.Collections.Generic;
using System.Text;
using WebChat.Models;
using WebChat.Models.ViewModels;

namespace WebChat.Services
{
    public interface IMessageService
    {
        //Message CreateMessage(string userId, string text, string threadId);

        //MessageViewModel MapMessageModelToViewModel(Message model);

        void AddMessage(MessageViewModel message);

        IEnumerable<MessageViewModel> GetAllMessages(string id);
    }
}
