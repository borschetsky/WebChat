using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System;
using System.Collections.Generic;
using System.Linq;
using WebChat.Models.ViewModels;
using WebChat.Services;
using WebChat.Services.Inerfaces;

namespace WebChat.Controllers
{
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class ThreadController : ControllerBase
    {
        private readonly IMessageService messageService;
        private readonly IValidator validator;
        private readonly IThreadService threadService;

        public ThreadController(IMessageService messageService, IValidator validator, IThreadService threadService)
        {
            this.messageService = messageService ?? throw new ArgumentNullException("Message service can not be null");
            this.validator = validator ?? throw new ArgumentNullException("Validator can not be null");
            this.threadService = threadService;
            
        }
        [HttpGet("getmessages/{id}")]
        public ActionResult<Dictionary<DateTime, List<MessageViewModel>>> GetAllMessages(string id)
        {
            if (string.IsNullOrEmpty(id))
            {
                return BadRequest(new { message = "Thread Id can not be empty or null"});
            }
            if (!validator.DoesThreadExist(id))
            {
                return BadRequest(new { message = "There are no thread with this id"});
            }
            if(!validator.DoesUserBelongToCurentThread(id, User.Identity.Name))
            {
                return BadRequest(new { message = "Sorry! But you have no acces to this thread"});
            }
            var dict = new Dictionary<DateTime, List<MessageViewModel>>();
            List<MessageViewModel> msgs = this.threadService.GetThreadMessages(id);
            foreach (var message in msgs)
            {
                var date = message.Time.Date;
                if (!dict.ContainsKey(date))
                {
                    dict.Add(date, new List<MessageViewModel>());
                    dict[date].Add(message);
                }
                else
                {
                    dict[date].Add(message);
                }
            }

            return dict;
        }

        
        [HttpGet("search")]
        public ActionResult<Dictionary<DateTime, List<MessageViewModel>>> FindMessages
            ([FromQuery(Name = "term")] string term, [FromQuery(Name = "threadId")] string threadid)
        {
            if (string.IsNullOrEmpty(threadid) || string.IsNullOrEmpty(term))
            {
                return BadRequest(new { message = "Thread Id can not be empty or null" });
            }
            if (!validator.DoesThreadExist(threadid))
            {
                return BadRequest(new { message = "There are no thread with this id" });
            }
            if (!validator.DoesUserBelongToCurentThread(threadid, User.Identity.Name))
            {
                return BadRequest(new { message = "Sorry! But you have no acces to this thread" });
            }

            var result = threadService.SearchForMessages(threadid, term);

            return result;
        }


        
    }
}
