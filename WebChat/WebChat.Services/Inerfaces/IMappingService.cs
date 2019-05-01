using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using WebChat.Models;
using WebChat.Models.ViewModels;

namespace WebChat.Services.Inerfaces
{
    public interface IMappingService
    {
        MessageViewModel MapMessageModelToMessageViewModel(Message model);

        Message MapMessageViewModelToMessageModel(MessageViewModel model);

        IEnumerable<MessageViewModel> MapMessageModelCollectionToMessageViewModelCollection(IEnumerable<Message> collection);

        ThreadViewModel MapThreadModelToThreadViewModel(Thread model);

        Thread MapThreadViewModelToThreadModel(ThreadViewModel model);
    }
}
