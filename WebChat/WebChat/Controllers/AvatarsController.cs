using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using WebChat.Handler;
using System.IO;
namespace WebChat.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AvatarsController : Controller
    {
        private readonly IImageHandler imageHandler;

        public AvatarsController(IImageHandler imageHandler)
        {
            this.imageHandler = imageHandler;
        }

        [HttpPost("upload")]
        public async Task<IActionResult> UploadImage()
        {
            var file = HttpContext.Request.Form.Files[0];

            return await imageHandler.UploadImage(file);
        }
    }
}
