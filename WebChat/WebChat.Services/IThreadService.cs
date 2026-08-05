using System;
using System.Collections.Generic;
using System.Text;
using WebChat.Models;
using WebChat.Models.ViewModels;

namespace WebChat.Services
{
    public interface IThreadService
    {
        Dictionary<DateTime, List<MessageViewModel>> SearchForMessages(string threadId, string term);

        ICollection<Thread> GetUserThreads(string userId);

        /// <summary>Records thread membership. Call after the thread row exists.</summary>
        void AddParticipants(string threadId, IEnumerable<string> userIds);

        /// <summary>Everyone in the thread, for delivering a message to all of them.</summary>
        List<string> GetParticipantIds(string threadId);

        void AddThread(ThreadViewModel thread);

        Thread GetThreadById(string threadId);

        ThreadViewModel CreateThreadViewModel(string ownerId, string oponentId);
        //Testing
        List<MessageViewModel> GetThreadMessages(string threadId);

        string GetLastMessageForThread(string threadId);

        LastMessageViewModel GetThreadLastMessage(string threadId);
    }
}
