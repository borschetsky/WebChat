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
        /// <summary>Persists an already-built group thread.</summary>
        void AddGroupThread(Thread thread);

        /// <summary>
        /// Adds membership rows. <paramref name="ownerId"/> takes <c>GroupRole.Owner</c>;
        /// everyone else takes <c>Member</c>. Null on a direct thread, where the role is
        /// stored but means nothing.
        /// </summary>
        void AddParticipants(string threadId, IEnumerable<string> userIds, string ownerId = null);

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
