using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using WebChat.Hubs;
using WebChat.Hubs.Interfaces;
using WebChat.Models.ViewModels;
using WebChat.Services;
using WebChat.Services.Inerfaces;


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
        private readonly IConnectionMapping<string> connectionMapping;

        public HeyController
        (
            IUserService userSercvice, 
            IMessageService messageService, 
            IHubContext<ChatHub> hubContext, 
            IThreadService thredService,
            IMappingService mappingService,
            IConnectionMapping<string> connectionMapping
        )
        {
            this.userSercvice = userSercvice;
            this.messageService = messageService;
            this.hubContext = hubContext;
            this.thredService = thredService;
            this.mappingService = mappingService;
            this.connectionMapping = connectionMapping;
        }

        
        

        [HttpPost("send")]
        public async Task<ActionResult> SendMessage([FromBody]MessageViewModel model)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(new { error = "Message should have all props" });
            }
            model.Id = Guid.NewGuid().ToString();
            
            //Add message async to Db
            //TODO:
            //Check time format!!!!
            MessageViewModel responseModel = await messageService.AddMessage(model);

            var senderId = User.Identity.Name;
            var reciverId = this.userSercvice.GetOponentIdByTheadId(senderId, model.ThreadId);
            responseModel.Username = model.Username;
            responseModel.Date = responseModel.Time.Date;
            responseModel.SenderId = senderId;
            var listOfConnections = new List<string>() { senderId, reciverId};
            
            await hubContext.Clients.Users(listOfConnections).SendAsync("ReciveMessage", responseModel);

            return Created("", responseModel); 
        }

        
        //TODO: Extract all work with Entity models ouside the controller
        [HttpGet("getusers")]
        public ActionResult<List<UserViewModel>> GetUsers()
        {
            var usersCollection = this.userSercvice.GetUsers();

            var userVMCollection = new List<UserViewModel>();

            var curentUser = this.User.Identity.Name;

            
            foreach (var user in usersCollection.Where(u => u.Id != curentUser))
            {
                List<string> userConnections = connectionMapping.GetConnections(user.Id).ToList();

                var curentVModel = new UserViewModel()
                {
                    Id = user.Id,
                    Username = this.userSercvice.GetUserNameById(user.Id),
                    IsOnline = userConnections.Count == 0 ? false : true
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
                
                var oponentId = curentUserId;
                if (entity.OwnerId == curentUserId)
                {
                    oponentId = entity.OponentId;
                }
                if (entity.OponentId == curentUserId)
                {
                    oponentId = entity.OwnerId;
                }
                //TODO: Upcomming feature changing direct chat to group chat
                //      By changing database from OpponentId to collection of opponents.
                var connections = this.connectionMapping.GetConnections(oponentId);
                var vModel = new ThreadViewModel()
                {
                    Id = entity.Id,
                    LastMessage = this.thredService.GetThreadLastMessage(entity.Id),
                    OponentVM = userSercvice.GetOponentProfile(oponentId)
                };
                vModel.OponentVM.IsOnline = connections.Count() == 0 ? false : true;

                threadsVM.Add(vModel);
            }

            return threadsVM;
        }

        [HttpPost("createthread")]
        public async Task<ActionResult> CreateThread([FromBody] ThreadViewModel model)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest();
            }
            //Curetn Http Context User
            var curentUserId = User.Identity.Name;
            //Oponent Id
            var curentOponentId = model.OponentVM.Id;
            //TODO: Export valiation logic to Validation helper and implement caching
            //All curent user's threads
            var curentUserThreads = this.thredService.GetUserThreads(curentUserId);
            //Validation
            if (curentUserThreads.Any(t => t.OwnerId == curentOponentId || t.OponentId == curentOponentId))
            {
                var threadId = curentUserThreads.FirstOrDefault(t => t.OwnerId == model.OponentVM.Id || t.OponentId == model.OponentVM.Id).Id;
                return BadRequest(new { message = "You already have thread with this user", ThreadId = threadId});
            }
            //End of validation
            //Creating response ViewModel
            ThreadViewModel newThreadVM = this.thredService.CreateThreadViewModel(curentUserId, curentOponentId);

            //Adding thread to DB
            this.thredService.AddThread(newThreadVM);
            
            newThreadVM.LastMessage = new LastMessageViewModel() { Text = "No messages"};
            newThreadVM.OponentVM = userSercvice.GetOponentProfile(curentUserId);
            //Send thread to Oponent with curent User Info
            await hubContext.Clients.User(curentOponentId).SendAsync("ReviceThread", newThreadVM);
            newThreadVM.OponentVM = model.OponentVM;
            //Send thread to curent user with opopnent info
            await hubContext.Clients.User(curentUserId).SendAsync("ReviceThread", newThreadVM);
            //Send created thread Id to be setted on front end
            return Ok(new { ThreadId = newThreadVM.Id});
        }
    }
}
