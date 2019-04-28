using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using WebChat.Hubs;
using WebChat.Models;
using WebChat.Models.ViewModels;
using WebChat.Services;

namespace WebChat.Controllers
{
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class HeyController : ControllerBase
    {
        private readonly IUserService userSercvice;
        private readonly IMessageService messageService;
        private readonly IHubContext<ChatHub> hubContext;

        public HeyController(IUserService userSercvice, IMessageService messageService,IHubContext<ChatHub> hubContext)
        {
            this.userSercvice = userSercvice;
            this.messageService = messageService;
            this.hubContext = hubContext;
        }

        [HttpGet("get")]
        public ActionResult<User> Get ()
        {
            var userIdFromContext = this.HttpContext.User.Identity.Name;
            var userIdFromThis = this.User.Identity.Name;
            var connectionId = this.HttpContext.Connection.Id;
            return Ok(new
            {
                message = $"Accessed :) userid = {userIdFromContext} userCurrentConnection = {connectionId}"
                
            });
        }

        [HttpGet("getusername")]
        public ActionResult<string> GetUserName()
        {
            var currentUserId = this.User.Identity.Name;

            return this.userSercvice.GetUserNameById(currentUserId);
        }

        [HttpPost("send")]
        public async Task<ActionResult> SendMessage([FromBody]MessageViewModel model)
        {
            var message = this.messageService.CreateMessage(model.UserId, model.Text);
            this.messageService.AddMessage(message);
            var senderName = this.userSercvice.GetUserNameById(model.UserId);
            var dateTime = DateTime.Now;

            await this.hubContext.Clients.All.SendAsync("SendMessage", senderName, model.Text, string.Format("{0:t}", dateTime));

            return Ok();
        }

        [HttpGet("getmessages")]
        public ActionResult<List<MessageViewModel>> GetAllMessages()
        {
            List<MessageViewModel> msgs = this.messageService.GetAllMessages().ToList();

            return msgs;
        }

    }
}
