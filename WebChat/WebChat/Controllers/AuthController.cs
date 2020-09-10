using Microsoft.AspNetCore.Mvc;
using System;
using WebChat.Models.ViewModels;
using WebChat.Services;
using WebChat.ViewModels;

namespace WebChat.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class AuthController : ControllerBase
    {
        private readonly IAuthService authService;
        private readonly IUserService userService;

        public AuthController(IAuthService authService, IUserService userService)
        {
            this.authService = authService ?? throw new ArgumentNullException("Authorization service can not be null, check IoC container");
            this.userService = userService ?? throw new ArgumentNullException("User service can not be null, check IoC container");
        }
        
        [HttpPost("login")]
        public ActionResult<AuthData> Post([FromBody] LoginViewModel model)
        {
            if (!ModelState.IsValid) return BadRequest(ModelState);

            var user = userService.GetUserByEmail(model.Email);

            if (user == null) return BadRequest(new { email = "no user with this email"});
            
            var passwordValid = authService.VerifyPassword(model.Password, user.Password);

            if (!passwordValid) return BadRequest(new { password = "invalid password"});
            
            return authService.GetToken(user.Id);
        }


        [HttpPost("register")]
        public ActionResult<AuthData> Post([FromBody]RegisterViewModel model)
        {
            if (!ModelState.IsValid) return BadRequest(ModelState);
 
            if (!userService.isEmailUniq(model.Email)) return BadRequest(new { email = "user with this email already exists" });

            if (!userService.isUsernameUniq(model.Username)) return BadRequest(new { username = "user with this username already exists" });

            var user = userService.CreateUser(model.Username, model.Email, model.Password);

            userService.AddUser(user);

            return authService.GetToken(user.Id);
        }
       
    }
}
