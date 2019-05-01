using System;
using System.Collections.Generic;
using System.Text;
using WebChat.Models;

namespace WebChat.Services
{
    public interface IThreadService
    {
        ICollection<Thread> GetUserThreads(string userId);

        void AddThread(Thread thread);

        Thread GetThreadById(string threadId);
    }
}
