﻿using Microsoft.EntityFrameworkCore;
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
            var matchedMessagesTest = (from m in ctx.Message
                                       join u in ctx.User
                                       on m.SenderId equals u.Id
                                       where m.ThreadId == threadId && m.Text.ToLower().IndexOf(term.ToLower()) > -1
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
                SenderId = message.SenderId
            };

            return result;

        }
    }
}
