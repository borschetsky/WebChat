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
using WebChat.Services.Inerfaces;
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
        private readonly IMappingService mappingService;

        public HeyController
        (
            IUserService userSercvice, 
            IMessageService messageService, 
            IHubContext<ChatHub> hubContext, 
            IThreadService thredService,
            IMappingService mappingService
        )
        {
            this.userSercvice = userSercvice;
            this.messageService = messageService;
            this.hubContext = hubContext;
            this.thredService = thredService;
            this.mappingService = mappingService;
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
            model.Id = Guid.NewGuid().ToString();

            this.messageService.AddMessage(model);

            var senderId = User.Identity.Name;
            var reciverId = this.userSercvice.GetOponentIdByTheadId(senderId, model.ThreadId);
            
            await hubContext.Clients.Groups(new List<string>() { reciverId, senderId}).SendAsync("ReciveMessage", model);
            return Ok();
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

        [HttpGet("getthreads")]
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
            //TODO: Export valiation logic to Validation helper
            //All curent user's threads
            var curentUserThreads = this.thredService.GetUserThreads(curentUserId);
            //Validation
            if (curentUserThreads.Any(t => t.OwnerId == model.Oponent || t.OponentId == model.Oponent))
            {
                var threadId = curentUserThreads.FirstOrDefault(t => t.OwnerId == model.Oponent || t.OponentId == model.Oponent).Id;
                return BadRequest(new { message = "You already have thread with this user", ThreadId = threadId});
            }
            //End of validation
            ThreadViewModel newThreadVM = this.thredService.CreateThreadViewModel(curentUserId, model.Oponent);

            this.thredService.AddThread(newThreadVM);

            return Ok(new { ThreadId = newThreadVM.Id});
        }
    }
}
