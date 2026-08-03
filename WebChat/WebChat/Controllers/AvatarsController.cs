using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using System.IO;
using System.Threading.Tasks;
using WebChat.AvatarWriter.Interface;
using WebChat.Handler;
using WebChat.Hubs;
using WebChat.Hubs.Interfaces;
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
        private readonly IHubContext<ChatHub> hubContext;
        private readonly IConnectionMapping<string> connectionMapping;
        private readonly IAvatarUrlProvider avatarUrls;

        public AvatarsController(IImageHandler imageHandler, IUserService userService, IHubContext<ChatHub> hubContext, IConnectionMapping<string> connectionMapping, IAvatarUrlProvider avatarUrls)
        {
            this.imageHandler = imageHandler;
            this.userService = userService;
            this.hubContext = hubContext;
            this.connectionMapping = connectionMapping;
            this.avatarUrls = avatarUrls;
        }

        [HttpPost("upload")]
        public async Task<IActionResult> UploadImage()
        {
            IFormCollection form;
            try
            {
                form = HttpContext.Request.Form;
            }
            catch (InvalidDataException e)
            {
                // The multipart parser enforces Avatars:MaxUploadBytes and throws once the
                // body exceeds it. Reading Form is what triggers that, so it has to be caught
                // here or the client gets a 500 and a stack trace instead of the reason.
                return BadRequest(new { file = e.Message });
            }

            if (form.Files.Count == 0)
            {
                return BadRequest(new { file = "No file was uploaded" });
            }

            var result = await imageHandler.UploadImage(form.Files[0]);

            // A rejection must not reach the database. This used to persist whatever came
            // back - so a refused upload set the user's avatar to the string "Invalid image
            // file", and the client then requested that as a filename.
            if (!result.Ok)
            {
                return BadRequest(new { file = result.Error });
            }

            this.userService.AddAvatar(result.FileName, User.Identity.Name);

            await this.hubContext.Clients.All.SendAsync("ReciveAvatar", new { body = result.FileName, uploaderId = User.Identity.Name });

            return Ok(result.FileName);
        }

        /// <summary>
        /// Redirects an avatar request to a short-lived presigned R2 URL, so the image bytes go
        /// browser-to-R2 and this server only ever emits the redirect.
        ///
        /// Signing on every request rather than embedding presigned URLs in the thread and
        /// profile payloads means expiry never becomes the client's problem: each load gets a
        /// fresh signature, and the SPA keeps requesting the same stable /images/{name} path.
        ///
        /// Anonymous by necessity - an &lt;img&gt; tag cannot send the bearer token this API
        /// authenticates with. The filenames are server-generated GUIDs, so they are not
        /// enumerable, but this does mean anyone holding one can fetch that avatar.
        ///
        /// Registered under the same /images/ path the local-disk setup uses. UseStaticFiles
        /// runs earlier in the pipeline, so any avatar still sitting in wwwroot/images is
        /// served from there and never reaches this action.
        /// </summary>
        [AllowAnonymous]
        [HttpGet("/images/{fileName}")]
        public IActionResult GetImage(string fileName)
        {
            var url = this.avatarUrls.GetReadUrl(fileName);

            // Null in the local-disk setup. Reaching here at all then means UseStaticFiles
            // did not find the file, so the avatar genuinely does not exist.
            if (url == null)
            {
                return NotFound();
            }

            // The redirect itself must not be cached: it carries a signature that outlives it
            // by only a few minutes, and a cached 302 would keep sending browsers to a URL
            // that has since expired.
            Response.Headers.CacheControl = "no-store";

            return Redirect(url);
        }
    }
}
