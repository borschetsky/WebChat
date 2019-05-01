using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;
using WebChat.Hubs;
using WebChat.Models;
using WebChat.Models.ViewModels;
using WebChat.Services;
using WebChat.ViewModels;

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
        private readonly IThreadService thredService;

        public HeyController(IUserService userSercvice, IMessageService messageService, IHubContext<ChatHub> hubContext, IThreadService thredService)
        {
            this.userSercvice = userSercvice;
            this.messageService = messageService;
            this.hubContext = hubContext;
            this.thredService = thredService;
        }

        [HttpGet("get")]
        public ActionResult<User> Get()
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
            if (!ModelState.IsValid)
            {
                return BadRequest(new { error = "Message should have all props" });
            }

            var message = this.messageService.CreateMessage(model.UserId, model.Text, model.ThreadId);
            //this.messageService.AddMessage(message);

            var messageVM = this.messageService.MapMessageModelToViewModel(message);
            var senderId = User.Identity.Name;
            var reciverId = this.userSercvice.GetOponentIdByTheadId(senderId, model.ThreadId);
            //var dateTime = DateTime.Now;
            //Calling Recieve method on the client
            //await this.hubContext.Clients.All.SendAsync("SendMessage", messageVM);
            await hubContext.Clients.Groups(new List<string>() { reciverId, senderId}).SendAsync("ReciveMessage", messageVM);
            return Ok();
        }

        [HttpGet("getmessages")]
        public ActionResult<List<MessageViewModel>> GetAllMessages()
        {
            List<MessageViewModel> msgs = this.messageService.GetAllMessages().ToList();

            return msgs;
        }

        [HttpGet("getusers")]
        public ActionResult<List<UserViewModel>> GetUsers()
        {
            var usersCollection = this.userSercvice.GetUsers();

            var userVMCollection = new List<UserViewModel>();

            var curentUser = this.User.Identity.Name;

            foreach (var user in usersCollection.Where(u => u.Id != curentUser))
            {
                var curentVModel = new UserViewModel()
                {
                    Id = user.Id,
                    Username = this.userSercvice.GetUserNameById(user.Id)
                };

                userVMCollection.Add(curentVModel);
            }

            return userVMCollection;
        }

        [HttpGet("getthread")]
        public ActionResult<List<ThreadViewModel>> GetUsersThreads()
        {
            var curentUserId = User.Identity.Name;

            var threadsEM = this.thredService.GetUserThreads(curentUserId);

            if (threadsEM.Count == 0)
            {
                return NoContent();
            }
            var threadsVM = new List<ThreadViewModel>();

            foreach (var entity in threadsEM)
            {
                var vModel = new ThreadViewModel()
                {
                    Id = entity.Id,
                    Owner = entity.OwnerId,
                    OwnerName = this.userSercvice.GetUserNameById(entity.OwnerId),
                    Oponent = entity.OponentId,
                    OponentName = this.userSercvice.GetUserNameById(entity.OponentId)
                };
                threadsVM.Add(vModel);
            }

            return threadsVM;
        }

        [HttpPost("createthread")]
        public ActionResult CreateThread([FromBody] ThreadViewModel model)
        {
            if (string.IsNullOrEmpty(model.Oponent))
            {
                return BadRequest();
            }
            //Curetn Http Context User
            var curentUserId = User.Identity.Name;

            //All curent user's threads
            var curentUserThreads = this.thredService.GetUserThreads(curentUserId);
            //Validation
            if (curentUserThreads.Any(t => t.OwnerId == model.Oponent || t.OponentId == model.Oponent))
            {
                var threadId = curentUserThreads.FirstOrDefault(t => t.OwnerId == model.Oponent || t.OponentId == model.Oponent).Id;
                return BadRequest(new { message = "You already have thread with this user", ThreadId = threadId});
            }
            

            var ownerId = User.Identity.Name;

            var newThread = new Thread()
            {
                OwnerId = ownerId,
                OponentId = model.Oponent
            };

            this.thredService.AddThread(newThread);

            return Ok();
        }
    }
}
