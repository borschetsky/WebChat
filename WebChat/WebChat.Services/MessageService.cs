using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using WebChat.Connection;
using WebChat.Models;
using WebChat.Models.ViewModels;
using WebChat.Services.Inerfaces;

namespace WebChat.Services
{
    public class MessageService : IMessageService
    {
        private readonly WebChatContext ctx;
        private readonly IUserService userService;
        private readonly IMappingService mappingService;

        public MessageService(WebChatContext ctx, IUserService userService, IMappingService mappingService)
        {
            this.ctx = ctx;
            this.userService = userService;
            this.mappingService = mappingService;
        }
        public void AddMessage(MessageViewModel message)
        {

            var messageToAdd = this.mappingService.MapMessageViewModelToMessageModel(message);

            ctx.Message.Add(messageToAdd);
            ctx.SaveChanges();
        }

        public MessageViewModel CreateMessageViewModel(string userId, string text, string threadId)
        {
            var message = new MessageViewModel()
            {
                Id = Guid.NewGuid().ToString(),
                SenderId = userId,
                Text = text,
                ThreadId = threadId,
                Username = this.userService.GetUserNameById(userId)
            };

            return message;
        }

        public IEnumerable<MessageViewModel> GetAllMessages(string threadId)
        {
            if(string.IsNullOrEmpty(threadId))
            {
                throw new ArgumentNullException("Id");
            }

            var messagesForThread = ctx.Thread.Where(t => t.Id == threadId).Include(m => m.Messages).FirstOrDefault().Messages.OrderBy(m => m.CreatedOn);

            if(messagesForThread == null)
            {
                throw new ArgumentNullException();
            }
            var messagesToView = this.mappingService.MapMessageModelCollectionToMessageViewModelCollection(messagesForThread);

            return messagesToView;
        }

        //public MessageViewModel MapMessageModelToViewModel(Message model)
        //{
        //    var viewModel = new MessageViewModel()
        //    {
        //        Id = model.Id,
        //        UserId = model.SenderId,
        //        Text = model.Text,
        //        ThreadId = model.ThreadId,
        //        Username = this.userService.GetUserNameById(model.SenderId),
        //        Time = String.Format("{0:t}", DateTime.Now)
        //    };

        //    return viewModel;
        //}
    }
}
