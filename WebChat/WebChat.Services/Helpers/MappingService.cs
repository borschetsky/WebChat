using System;
using System.Collections.Generic;
using System.Text;
using WebChat.Models;
using WebChat.Models.ViewModels;
using WebChat.Services.Inerfaces;

namespace WebChat.Services.Helpers
{
    public class MappingService : IMappingService
    {

        public Message MapMessageViewModelToMessageModel(MessageViewModel model)
        {
            var messageModel = new Message()
            {
                Id = model.Id,
                Text = model.Text,
                SenderId = model.SenderId,
                ThreadId = model.ThreadId
            };

            return messageModel;
        }

        public MessageViewModel MapMessageModelToMessageViewModel(Message model)
        {
            var messageViewModel = new MessageViewModel()
            {
                Id = model.Id,
                SenderId = model.SenderId,
                //Username = this.userService.GetUserNameById(model.SenderId),
                Text = model.Text,
                Time = String.Format("{0:t}", model.CreatedOn),
                ThreadId = model.ThreadId
            };
            return messageViewModel;
        }

        public IEnumerable<MessageViewModel> MapMessageModelCollectionToMessageViewModelCollection(IEnumerable<Message> collection)
        {
            var viewModelCollection = new List<MessageViewModel>();

            foreach (var model in collection)
            {
                var viewModel = this.MapMessageModelToMessageViewModel(model);
                viewModelCollection.Add(viewModel);
            }

            return viewModelCollection;
        }

        public ThreadViewModel MapThreadModelToThreadViewModel(Thread model)
        {
            var threadVM = new ThreadViewModel()
            {
                Id = model.Id,
                Owner = model.OwnerId,
                Oponent = model.OponentId
            };
            return threadVM;
        }

        public Thread MapThreadViewModelToThreadModel(ThreadViewModel model)
        {
            var threadModel = new Thread()
            {
                Id = model.Id,
                OwnerId = model.Owner,
                OponentId = model.Oponent
            };

            return threadModel;
        }

        
    }
}
