using System;
using System.Collections.Generic;
using System.Text;
using WebChat.Models;
using WebChat.Models.ViewModels;

namespace WebChat.Services
{
    public interface IThreadService
    {
        ICollection<Thread> GetUserThreads(string userId);

        void AddThread(ThreadViewModel thread);

        Thread GetThreadById(string threadId);

        ThreadViewModel CreateThreadViewModel(string ownerId, string oponentId);
        //Testing
        List<MessageViewModel> GetThreadMessages(string threadId);
    }
}
