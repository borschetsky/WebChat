using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using WebChat.Connection;
using WebChat.Models;
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

        public UsersController(IUserService userService)
        {
            this.userService = userService;
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

            return this.userService.GetUserProfile(currentUserId);
        }
        [HttpGet("profilebyid/{id}")]
        public ActionResult<OponentViewModel> GetProfileById(string id)
        {
            if(string.IsNullOrEmpty(id))
            {
                return BadRequest(new { message = "Oponent id can not be null or empty" });
            }
            var profile = this.userService.GetOponentProfile(id);

            return profile;
        }
    }
}
