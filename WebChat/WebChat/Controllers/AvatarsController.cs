using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using WebChat.Handler;
using System.IO;
using Microsoft.AspNetCore.Authorization;
using WebChat.Services;

namespace WebChat.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class AvatarsController : Controller
    {
        private readonly IImageHandler imageHandler;
        private readonly IUserService userService;

        public AvatarsController(IImageHandler imageHandler, IUserService userService)
        {
            this.imageHandler = imageHandler;
            this.userService = userService;
        }

        [HttpPost("upload")]
        public async Task<IActionResult> UploadImage()
        {
            var file = HttpContext.Request.Form.Files[0];
            var avatarFilename = await imageHandler.UploadImage(file);
            var objectResult = avatarFilename as ObjectResult;
            var value = objectResult.Value.ToString();
            this.userService.AddAvatar(value, User.Identity.Name);

            return avatarFilename;
        }
    }
}
