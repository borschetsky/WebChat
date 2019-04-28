using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using WebChat.Connection;
using WebChat.Models;
using WebChat.Models.ViewModels;

namespace WebChat.Services
{
    public class MessageService : IMessageService
    {
        private readonly WebChatContext ctx;
        private readonly IUserService userService;

        public MessageService(WebChatContext ctx, IUserService userService)
        {
            this.ctx = ctx;
            this.userService = userService;
        }
        public void AddMessage(Message message)
        {
            ctx.Message.Add(message);
            ctx.SaveChanges();

            
        }

        public Message CreateMessage(string userId, string text)
        {
            var message = new Message()
            {
                UserId = userId,
                Text = text
            };

            return message;
        }

        public ICollection<MessageViewModel> GetAllMessages()
        {
            var messages = this.ctx.Message.OrderBy(m => m.CreatedOn).ToList();

            var messagesToView = new List<MessageViewModel>();

            foreach (var message in messages)
            {
                var mes = new MessageViewModel()
                {
                    UserId = message.UserId,
                    Username = this.userService.GetUserNameById(message.UserId),
                    Text = message.Text,
                    Time = String.Format("{0:t}", message.CreatedOn)
                };
                 messagesToView.Add(mes);
            }

            return messagesToView;
        }
    }
}
