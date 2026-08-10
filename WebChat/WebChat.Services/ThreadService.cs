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

        public Dictionary<DateTime, List<MessageViewModel>> SearchForMessages(string threadId, string term)
        {
            var matchedMessages = ctx.Message.Where(m => m.ThreadId == threadId && m.Text.ToLower().IndexOf(term.ToLower()) > -1);
            // System messages are excluded, per SPEC-group-wire-contract.md §2: "Someone
            // searching 'Priya' wants messages, not the record of Priya joining." Stated
            // rather than left to fall out of Text being null, which happens to work today
            // and would stop the moment a system row gained a text column.
            var matchedMessagesTest = (from m in ctx.Message
                                       join u in ctx.User
                                       on m.SenderId equals u.Id
                                       where m.ThreadId == threadId
                                             && m.Type != MessageType.System
                                             && m.Text.ToLower().IndexOf(term.ToLower()) > -1
                                       orderby m.CreatedOn
                                       select new MessageViewModel
                                       {
                                           Id = m.Id,
                                           SenderId = m.SenderId,
                                           Username = u.Username,
                                           Text = m.Text,
                                           ThreadId = m.ThreadId,
                                           Time = m.CreatedOn
                                       }).ToList();
            var resultMessages = new Dictionary<DateTime, List<MessageViewModel>>();
            if (matchedMessagesTest.Count == 0)
            {
                return resultMessages;
            }
            foreach (var message in matchedMessagesTest)
            {
                var date = message.Time.Date;
                if (!resultMessages.ContainsKey(date))
                {
                    resultMessages.Add(date, new List<MessageViewModel>());
                    resultMessages[date].Add(message);
                }
                else
                {
                    resultMessages[date].Add(message);
                }
            }
            return resultMessages;
            


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
                OponentVM = new OponentViewModel() { Id = oponentId}
            };

            return newThread;
        }

        public Thread GetThreadById(string threadId)
        {
            return ctx.Thread.FirstOrDefault(t => t.Id == threadId);
        }

        public ICollection<Thread> GetUserThreads(string userId)
        {
            // Membership rather than the owner/opponent pair, so a group returns for every
            // member instead of only the two people those columns could name.
            return ctx.Thread
                .Where(t => ctx.ThreadParticipant.Any(p => p.ThreadId == t.Id && p.UserId == userId && !p.isDeleted))
                .ToList();
        }

        /// <summary>
        /// Persists an already-built group thread.
        ///
        /// Separate from AddThread, which maps from a ThreadViewModel and exists to serve the
        /// direct-thread path. A group is constructed by the caller because it carries a name
        /// and no opponent, and routing it through the view-model mapper would mean teaching
        /// that mapper about a shape it otherwise never sees.
        /// </summary>
        public void AddGroupThread(Thread thread)
        {
            ctx.Thread.Add(thread);
            ctx.SaveChanges();
        }

        /// <summary>
        /// Records who is in a thread. Call after the thread row exists - these rows carry a
        /// foreign key to it.
        /// </summary>
        public void AddParticipants(string threadId, IEnumerable<string> userIds, string ownerId = null)
        {
            foreach (var userId in userIds.Where(u => !string.IsNullOrWhiteSpace(u)).Distinct())
            {
                // Guarded, because a duplicated member would be sent two copies of every
                // message in the thread.
                if (ctx.ThreadParticipant.Any(p => p.ThreadId == threadId && p.UserId == userId))
                {
                    continue;
                }

                ctx.ThreadParticipant.Add(new ThreadParticipant
                {
                    Id = Guid.NewGuid().ToString(),
                    ThreadId = threadId,
                    UserId = userId,

                    // The creator owns the group. Without this a new group is created with
                    // every row at the column default, 'member' - so it has no owner at all,
                    // nobody can transfer ownership, and the permission map is unreachable.
                    // The #63 migration backfilled existing groups from Thread.OwnerId; this
                    // is the other half, and only the migration had it until now.
                    GRole = userId == ownerId ? GroupRole.Owner : GroupRole.Member,
                    CreatedOn = DateTime.UtcNow,
                });
            }

            ctx.SaveChanges();
        }

        public List<string> GetParticipantIds(string threadId)
        {
            return ThreadQueries.ParticipantIds(ctx.ThreadParticipant, threadId);
        }

        public List<MessageViewModel> GetThreadMessages(string id)
        {
            // No `using (ctx)` here. The context is injected and scoped to the request, so
            // disposing it here disposes it for everything that runs afterwards - which was
            // survivable only for as long as nothing did. The moment the caller resolved a
            // display name after this returned, every getmessages call answered 500 with
            // ObjectDisposedException. DI owns this object's lifetime.
            var vm = new List<MessageViewModel>();
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
                                 // Free: this query already joins User for the username, so
                                 // the avatar is one more column rather than one more query.
                                 AvatarFileName = u.AvatarFileName,
                                 Text = m.Text,
                                 ThreadId = m.ThreadId,

                                 // Without these a system row arrives looking like an
                                 // ordinary message with no text, and renders as a blank
                                 // gap. The raw JSON goes out as-is here; the host parses it
                                 // before serializing - see SystemDataJson.
                                 Type = m.Type,
                                 SystemKind = m.SystemKind,
                                 SystemData = m.SystemData,
                                 Time = m.CreatedOn
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

        public LastMessageViewModel GetThreadLastMessage(string threadId)
        {
            var message = ctx.Message.Where(m => m.ThreadId == threadId).OrderByDescending(m => m.CreatedOn).FirstOrDefault();

            if (message == null)
            {
                return new LastMessageViewModel() { Text = "No messages"};
            }
            var result = new LastMessageViewModel()
            {
                Text = message.Text,
                Time = message.CreatedOn,
                SenderId = message.SenderId,
                Username = ctx.User.Where(u => u.Id == message.SenderId).Select(u => u.Username).FirstOrDefault(),

                // A system message is the newest thing in the thread as often as any other,
                // and the preview has to say what happened rather than fall back to
                // "No messages yet".
                Type = message.Type,
                SystemKind = message.SystemKind,
                SystemData = message.SystemData,
            };

            return result;

        }
    }
}
