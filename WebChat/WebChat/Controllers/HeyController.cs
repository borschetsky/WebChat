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
using WebChat.ViewModels;
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
            responseModel.Username = model.Username;
            responseModel.Date = responseModel.Time.Date;
            responseModel.SenderId = senderId;

            // Everyone in the thread, not "the other person". A group has more than one
            // recipient, and the sender is included so their own other devices see it too.
            var listOfConnections = this.thredService.GetParticipantIds(model.ThreadId);
            
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
                
                // Everyone but the caller. Derived from membership rather than the legacy
                // OponentId pair, so this is the same expression for two people or twenty.
                var otherIds = this.thredService.GetParticipantIds(entity.Id)
                    .Where(id => id != curentUserId)
                    .ToList();

                var vModel = new ThreadViewModel()
                {
                    Id = entity.Id,
                    IsGroup = entity.IsGroup,
                    Name = entity.Name,
                    LastMessage = this.thredService.GetThreadLastMessage(entity.Id),
                    Members = otherIds.Select(id =>
                    {
                        var member = userSercvice.GetOponentProfile(id);
                        if (member != null)
                        {
                            member.IsOnline = this.connectionMapping.GetConnections(id).Any();
                        }
                        return member;
                    }).Where(m => m != null).ToList(),
                };

                // A direct thread also answers through OponentVM, which is what the client
                // has always read. Guarded on count rather than on IsGroup: a direct thread
                // whose other member was deleted has nobody to name, and indexing [0] there
                // would 500 the whole thread list rather than one row.
                if (!entity.IsGroup && vModel.Members.Count > 0)
                {
                    vModel.OponentVM = vModel.Members[0];
                }

                threadsVM.Add(vModel);
            }

            // A preview whose newest row is a system message carries its facts as JSON;
            // hand the client an object, the same shape getmessages returns.
            return SystemDataJson.Expand(threadsVM, this.userSercvice.GetUserNameById);
        }

        /// <summary>
        /// Creates a named group.
        ///
        /// Separate from createthread rather than a flag on it: the two take different
        /// payloads - one opponent versus a name and a list - and the duplicate-thread rule
        /// applies to one and not the other. Folding them together would mean a method whose
        /// first act is to branch on which half of its arguments were supplied.
        /// </summary>
        [HttpPost("creategroup")]
        public async Task<ActionResult> CreateGroup([FromBody] CreateGroupViewModel model)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            var curentUserId = User.Identity.Name;

            // Members are verified to exist before the thread is created. Without this a
            // typo'd or invented id would insert a participant row that fails the foreign
            // key, leaving a group half-built.
            var memberIds = model.MemberIds
                .Where(id => !string.IsNullOrWhiteSpace(id) && id != curentUserId)
                .Distinct()
                .Where(id => this.userSercvice.GetUserNameById(id) != null)
                .ToList();

            if (memberIds.Count == 0)
            {
                return BadRequest(new { members = "Add at least one other person to the group." });
            }

            // Null, not a derived string. A group nobody named has no name, and its title is
            // computed from current membership every time it is read - so removing a member
            // drops them from the title on its own. Storing the derived string here is what
            // this replaced: it went stale silently, which reads as a bug rather than a cache.
            var given = string.IsNullOrWhiteSpace(model.Name) ? null : model.Name.Trim();

            var thread = new Models.Thread
            {
                Id = Guid.NewGuid().ToString(),
                OwnerId = curentUserId,
                IsGroup = true,
                Name = given,
                Named = given != null,
                CreatedOn = DateTime.UtcNow,
            };

            this.thredService.AddGroupThread(thread);

            // The creator is added here rather than taken from the request, so a client
            // cannot create a group it is not a member of - and therefore cannot create one
            // it has no right to read.
            var everyone = new List<string> { curentUserId };
            everyone.AddRange(memberIds);
            this.thredService.AddParticipants(thread.Id, everyone, curentUserId);

            var vm = new ThreadViewModel
            {
                Id = thread.Id,
                IsGroup = true,
                Name = thread.Name,
                LastMessage = new LastMessageViewModel { Text = "No messages" },
                Members = memberIds.Select(id => this.userSercvice.GetOponentProfile(id)).Where(m => m != null).ToList(),
            };

            // Pushed to everyone including the creator, so the thread appears without a
            // refresh on whichever device they are using.
            await hubContext.Clients.Users(everyone).SendAsync("ReviceThread", vm);

            return Ok(new { ThreadId = thread.Id });
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

            // Only direct threads are de-duplicated. Two people may legitimately share several
            // groups, so this must not fire for them - which is why IsGroup is excluded rather
            // than relying on participant counts.
            var existing = curentUserThreads.FirstOrDefault(t =>
                !t.IsGroup && this.thredService.GetParticipantIds(t.Id).Contains(curentOponentId));

            if (existing != null)
            {
                return BadRequest(new { message = "You already have thread with this user", ThreadId = existing.Id });
            }

            //Creating response ViewModel
            ThreadViewModel newThreadVM = this.thredService.CreateThreadViewModel(curentUserId, curentOponentId);

            //Adding thread to DB
            this.thredService.AddThread(newThreadVM);

            // After the thread row exists - the participant rows carry a foreign key to it.
            this.thredService.AddParticipants(newThreadVM.Id, new[] { curentUserId, curentOponentId });

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
