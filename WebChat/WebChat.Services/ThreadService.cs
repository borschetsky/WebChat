using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using WebChat.Connection;
using WebChat.Models;

namespace WebChat.Services
{
    public class ThreadService : IThreadService
    {
        private readonly WebChatContext ctx;

        public ThreadService(WebChatContext ctx)
        {
            this.ctx = ctx;
        }

        public void AddThread(Thread thread)
        {
            ctx.Thread.Add(thread);
            ctx.SaveChanges();
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
