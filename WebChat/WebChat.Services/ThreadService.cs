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
    public class ThreadService : IThreadService
    {
        private readonly WebChatContext ctx;
        private readonly IMappingService mappingService;

        public ThreadService(WebChatContext ctx, IMappingService mappingService)
        {
            this.ctx = ctx;
            this.mappingService = mappingService;
        }


        public void AddThread(ThreadViewModel thread)
        {
            var threadModel = this.mappingService.MapThreadViewModelToThreadModel(thread);

            ctx.Thread.Add(threadModel);
            ctx.SaveChanges();
        }

        public ThreadViewModel CreateThreadViewModel(string ownerId, string oponentId)
        {
            if (string.IsNullOrEmpty(ownerId) || string.IsNullOrEmpty(oponentId))
            {
                throw new ArgumentNullException("You shold provide ownerId and oponent id");
            }

            var newThread = new ThreadViewModel()
            {
                Id = Guid.NewGuid().ToString(),
                Owner = ownerId,
                Oponent = oponentId
            };

            return newThread;
        }

        public Thread GetThreadById(string threadId)
        {
            return ctx.Thread.FirstOrDefault(t => t.Id == threadId);
        }

        public ICollection<Thread> GetUserThreads(string userId)
        {
            var userThreads = ctx.Thread.Where(t => t.OwnerId == userId || t.OponentId == userId).ToList();

            return userThreads;
        }

        public List<MessageViewModel> GetThreadMessages(string id)
        {
            var vm = new List<MessageViewModel>();
            using (ctx)
            {
                

                var tests = (from m in ctx.Message
                             join u in ctx.User
                             on m.SenderId equals u.Id
                             where m.ThreadId == id
                             orderby m.CreatedOn
                             select new MessageViewModel
                             {
                                 Id = m.Id,
                                 SenderId = m.SenderId,
                                 Username = u.Username,
                                 Text = m.Text,
                                 ThreadId = m.ThreadId,
                                 Time = String.Format("{0:t}", m.CreatedOn)
                             }).ToList();
                vm = tests;

            }
            return vm;
        }

        public string GetLastMessageForThread(string threadId)
        {
            var result = (from m in ctx.Message
                          where m.ThreadId == threadId
                          orderby m.CreatedOn descending
                          select m.Text).FirstOrDefault();
            if(string.IsNullOrEmpty(result))
            {
                return "No messages";
            }
            return result.ToString();

        }
    }
}
