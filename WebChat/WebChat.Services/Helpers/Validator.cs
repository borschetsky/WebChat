using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using WebChat.Connection;
using WebChat.Services.Inerfaces;

namespace WebChat.Services.Helpers
{
    public class Validator : IValidator
    {
        private readonly IThreadService threadService;
        private readonly WebChatContext ctx;

        public Validator(IThreadService threadService, WebChatContext ctx)
        {
            this.threadService = threadService;
            this.ctx = ctx;
        }

        public bool DoesThreadExist(string id)
        {
            return ctx.Thread.Any(t => t.Id == id);
        }

        /// <summary>
        /// Thread authorization. Membership is now a row in ThreadParticipant, so this holds
        /// for a group of any size rather than assuming exactly two people.
        ///
        /// The implementation this replaces dereferenced a thread that might not exist, so an
        /// invented id in the URL produced a NullReferenceException - a 500 raised by the
        /// authorization check itself, from a value the caller supplies.
        /// </summary>
        public bool DoesUserBelongToCurentThread(string threadId, string userId)
        {
            return ThreadQueries.IsParticipant(ctx.ThreadParticipant, threadId, userId);
        }
    }
}
