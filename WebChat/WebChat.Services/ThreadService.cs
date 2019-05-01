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


    }
}
