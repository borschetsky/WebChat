using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using WebChat.Hubs;
using WebChat.Models.ViewModels;
using WebChat.Services;

namespace WebChat.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class UsersController : ControllerBase
    {
        private readonly IUserService userService;
        private readonly IHubContext<ChatHub> hubContext;

        public UsersController(IUserService userService, IHubContext<ChatHub> hubContext)
        {
            this.userService = userService ?? throw new ArgumentNullException(nameof(userService));
            this.hubContext = hubContext ?? throw new ArgumentNullException(nameof(hubContext));
        }

        [HttpGet("search")]
        public ActionResult<List<UserViewModel>> FindUsers([FromQuery(Name = "name")] string user)
        {
            var result = userService.FindUserByMatch(user, User.Identity.Name).ToList();

            return result;
        }

        [HttpGet("getprofile")]
        public ActionResult<ProfileViewModel> GetProfile()
        {
            var currentUserId = this.User.Identity.Name;
            var profile = this.userService.GetUserProfile(currentUserId);

            // The token verified, but its user is gone - typically a session held across a
            // database rebuild. 401 tells the client to sign in again; anything else leaves it
            // retrying with a token that can never work.
            if (profile == null)
            {
                return Unauthorized(new { message = "This session refers to a user that no longer exists. Please sign in again." });
            }

            return profile;
        }

        [HttpPost("update")]
        public async Task<ActionResult> UpdateProfile([FromBody]ProfileViewModel model)
        {
            if(!ModelState.IsValid)
            {
                return BadRequest();
            }
            // The row written is the caller's, and `model.Id` is ignored entirely (#99). It
            // used to decide the target: this method read the identity into a local and then
            // never used it, so any authenticated user could rewrite any other account's
            // username and email by posting that account's id. That is account takeover rather
            // than vandalism, because password reset sends to the *stored* address - change it,
            // request a reset, receive the link - and the victim loses their own reset at the
            // same time, since their address no longer matches a row. `GetProfile` immediately
            // above always took the id from the token; only this method disagreed.
            var currentUserId = this.User.Identity.Name;

            var update = this.userService.UpdateProfile(currentUserId, model);

            switch (update.Outcome)
            {
                // The token verified but its user is gone - the same case `GetProfile` answers
                // with 401. Before #99 this reached EF with an id that matched nothing and
                // threw on the null entity, so a stale session got a 500.
                case ProfileUpdateOutcome.NoSuchUser:
                    return Unauthorized(new { message = "This session refers to a user that no longer exists. Please sign in again." });

                // #100. Register's own bodies, from the same factory it uses, because the
                // client has one code path for both and a second spelling of the same object
                // would be a wire difference nothing catches.
                case ProfileUpdateOutcome.EmailTaken:
                    return BadRequest(UniquenessProblem.EmailTaken());

                case ProfileUpdateOutcome.UsernameTaken:
                    return BadRequest(UniquenessProblem.UsernameTaken());
            }

            // Not `model` (#94). This goes to every connected client, including people who
            // share no conversation with this user, so it carries three fields projected from
            // the row that was just written - id, username, avatar - and neither the email
            // address nor the workspace role that a ProfileViewModel also holds. The method
            // name is misspelt and stays that way: the client's handler is registered under
            // it.
            await this.hubContext.Clients.All.SendAsync("ReviceUpdatedOpponentProfile", update.Broadcast);
            return Ok();
        }

    }
}
