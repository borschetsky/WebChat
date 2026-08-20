using Microsoft.AspNetCore.Authorization;
using System;
using System.Globalization;
using System.Linq;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using System.IO;
using System.Threading.Tasks;
using WebChat.AvatarWriter;
using WebChat.AvatarWriter.Interface;
using WebChat.Handler;
using WebChat.Hubs;
using WebChat.Hubs.Interfaces;
using WebChat.Models.ViewModels;
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
        private readonly IAvatarWriter avatarWriter;
        private readonly IAvatarOriginalStore originals;
        private readonly IHubContext<ChatHub> hubContext;
        private readonly IConnectionMapping<string> connectionMapping;
        private readonly IAvatarUrlProvider avatarUrls;
        private readonly WebChat.AvatarWriter.R2Options r2;
        private readonly ILogger<AvatarsController> logger;

        public AvatarsController(
            IImageHandler imageHandler,
            IUserService userService,
            IAvatarWriter avatarWriter,
            IAvatarOriginalStore originals,
            IHubContext<ChatHub> hubContext,
            IConnectionMapping<string> connectionMapping,
            IAvatarUrlProvider avatarUrls,
            WebChat.AvatarWriter.R2Options r2,
            ILogger<AvatarsController> logger)
        {
            this.imageHandler = imageHandler;
            this.userService = userService;
            this.avatarWriter = avatarWriter;
            this.originals = originals;
            this.hubContext = hubContext;
            this.connectionMapping = connectionMapping;
            this.avatarUrls = avatarUrls;
            this.r2 = r2;
            this.logger = logger;
        }

        /// <summary>
        /// Replace the profile photo: a freshly cropped square, the un-cropped original it came
        /// from, and the crop rectangle that ties the two together.
        ///
        /// The original and the crop are both optional, so a caller that sends neither still
        /// gets the pre-#88 behaviour - the avatar changes and "Adjust crop" is simply not
        /// offered afterwards. What is *not* optional is that they move together with the
        /// avatar: a new photo always overwrites the stored original, even with null, because
        /// an original left over from the previous photo would re-open the wrong picture.
        /// </summary>
        [HttpPost("upload")]
        public async Task<IActionResult> UploadImage()
        {
            var form = ReadForm(out var formError);
            if (form == null)
            {
                return BadRequest(new { file = formError });
            }

            var cropped = CroppedPart(form);
            if (cropped == null)
            {
                return BadRequest(new { file = "No file was uploaded" });
            }

            var result = await imageHandler.UploadImage(cropped);

            // A rejection must not reach the database. This used to persist whatever came
            // back - so a refused upload set the user's avatar to the string "Invalid image
            // file", and the client then requested that as a filename.
            if (!result.Ok)
            {
                return BadRequest(new { file = result.Error });
            }

            // Stored *before* the row is written, and its failure is deliberately not fatal.
            // The avatar is the thing the user asked for and it already exists; losing the
            // original costs them "Adjust crop" until their next upload, which is the same
            // state every pre-#88 account is in. Failing the whole upload instead would throw
            // away a perfectly good photo over its backup.
            string originalKey = null;
            var originalPart = form.Files["original"];
            if (originalPart != null)
            {
                var stored = await originals.Save(originalPart);
                if (stored.Ok)
                {
                    originalKey = stored.FileName;
                }
                else
                {
                    logger.LogWarning(
                        "Avatar original for {UserId} was not stored: {Reason}. The avatar itself was saved; Adjust crop will be unavailable.",
                        User.Identity.Name,
                        stored.Error);
                }
            }

            var update = userService.SetAvatar(
                User.Identity.Name,
                result.FileName,
                originalKey,
                CropFrom(form));

            if (!update.Ok)
            {
                return Unauthorized(new { message = "This session refers to a user that no longer exists. Please sign in again." });
            }

            // Issue #20, and only now: the new row is committed, so these two keys are
            // provably unreferenced. Both go, because this is a different photo.
            await Forget(update.PreviousAvatarFileName, update.PreviousOriginalFileName);

            await hubContext.Clients.All.SendAsync("ReciveAvatar", new { body = result.FileName, uploaderId = User.Identity.Name });

            return Ok(result.FileName);
        }

        /// <summary>
        /// Re-crop the photo the user already has: a new square cut from the stored original,
        /// with the new rectangle recorded.
        ///
        /// Separate from <see cref="UploadImage"/> rather than inferred from "no original part
        /// was sent", because the two differ in what they *delete* and that difference is
        /// unrecoverable in one direction. Inferring it would mean a caller that merely forgot
        /// to attach the original silently kept an original belonging to a different photo.
        /// </summary>
        [HttpPost("recrop")]
        public async Task<IActionResult> RecropImage()
        {
            var form = ReadForm(out var formError);
            if (form == null)
            {
                return BadRequest(new { file = formError });
            }

            var cropped = CroppedPart(form);
            if (cropped == null)
            {
                return BadRequest(new { file = "No file was uploaded" });
            }

            // Checked before anything is stored. Without an original there is nothing this
            // crop could have come from, so the request is a client bug rather than a user
            // error - answering it with a stored avatar would leave a crop rectangle
            // describing an image that does not exist.
            if (string.IsNullOrWhiteSpace(userService.GetAvatarOriginalFileName(User.Identity.Name)))
            {
                return BadRequest(new { file = "There is no stored photo to re-crop." });
            }

            var result = await imageHandler.UploadImage(cropped);
            if (!result.Ok)
            {
                return BadRequest(new { file = result.Error });
            }

            var update = userService.SetAvatarCrop(User.Identity.Name, result.FileName, CropFrom(form));
            if (!update.Ok)
            {
                return Unauthorized(new { message = "This session refers to a user that no longer exists. Please sign in again." });
            }

            // Only the previous crop. PreviousOriginalFileName is null here by construction -
            // see AvatarUpdate - and that is the difference between "adjust" and "replace".
            await Forget(update.PreviousAvatarFileName, null);

            await hubContext.Clients.All.SendAsync("ReciveAvatar", new { body = result.FileName, uploaderId = User.Identity.Name });

            return Ok(result.FileName);
        }

        /// <summary>
        /// Removes the caller's own profile photo (#89) - and **deletes nothing**.
        ///
        /// The handoff specifies Remove with no confirm dialog and a snackbar carrying a
        /// working Undo that restores the photo *and* its crop. That rules out a hard delete
        /// at the moment of the click: this server cannot re-derive a crop, because cropping
        /// has been client-side by design since #84, so an Undo that had thrown the derived
        /// square away could only ask the user to upload the photo again. What happens instead
        /// is one nullable column - <c>User.AvatarRemovedAt</c> - and every read path treating
        /// the user as having no avatar while it is set.
        ///
        /// **Self-service only.** The key is the caller's own, resolved from their row; there
        /// is no id parameter and no admin variant. Clearing somebody else's photo is not in
        /// this issue.
        ///
        /// Answers 200 for every outcome except a token naming a user that is gone, because it
        /// is a request for a state rather than an operation on an object: removing twice, or
        /// removing when there was never a photo, has already produced what the caller asked
        /// for. <c>restorable</c> says whether there is now something for Undo to bring back,
        /// so the client can offer the button only when it will work.
        ///
        /// The retained objects are cleaned up by the rules #88 already wrote - the next
        /// upload surrenders the previous crop and the previous original whether or not a
        /// removal is pending - so the only orphan this can leave is "removed and never
        /// uploaded again". There is deliberately no sweep here; that is #20's.
        /// </summary>
        [HttpPost("remove")]
        public async Task<IActionResult> RemoveImage()
        {
            var outcome = userService.RemoveAvatar(User.Identity.Name);
            if (outcome == AvatarRemoveOutcome.NoSuchUser)
            {
                return Unauthorized(new { message = "This session refers to a user that no longer exists. Please sign in again." });
            }

            // Announced the same way an upload is, with a null file name. The client's handler
            // patches every thread naming this user and invalidates their own profile, so a
            // removal reaches other people's screens the same way a new photo does.
            await Broadcast(null);

            return Ok(new
            {
                avatarFileName = (string)null,
                restorable = outcome == AvatarRemoveOutcome.Removed,
            });
        }

        /// <summary>
        /// Undo: clears the pending removal, which brings the photo and its crop back exactly.
        ///
        /// **It takes no file name, and that is the point of the whole design.** The keys never
        /// left the server, so there is nothing for a caller to substitute - a client-supplied
        /// name would let anyone point their avatar at any object in the bucket, including
        /// another user's original, which is precisely what <see cref="GetOriginal"/> exists to
        /// prevent.
        ///
        /// The awkward case is an Undo that arrives late - a second tab, a double press, a
        /// snackbar that outlived the state it described - and none of them may produce a 500
        /// or a button that does nothing. Pressing it when the photo is already back is a 200,
        /// because the state asked for holds. The one refusal is 409, when there is no pending
        /// removal *and* no photo: answering 200 there would claim a restoration the user is
        /// then not going to see.
        /// </summary>
        [HttpPost("restore")]
        public async Task<IActionResult> RestoreImage()
        {
            var restore = userService.RestoreAvatar(User.Identity.Name);

            if (restore.Outcome == AvatarRestoreOutcome.NoSuchUser)
            {
                return Unauthorized(new { message = "This session refers to a user that no longer exists. Please sign in again." });
            }

            if (restore.Outcome == AvatarRestoreOutcome.NothingToRestore)
            {
                return Conflict(new { message = "There is no removed photo to restore." });
            }

            await Broadcast(restore.AvatarFileName);

            return Ok(new { avatarFileName = restore.AvatarFileName });
        }

        /// <summary>
        /// The caller's own un-cropped original, as bytes.
        ///
        /// Takes no parameter, and that is the access control: the key is resolved from the
        /// caller's row, so there is no name to guess, tamper with or pass on. This is the
        /// deliberate opposite of <see cref="GetImage"/> below, which is anonymous and signs
        /// any key it is handed - acceptable for the picture the user chose to show, and not
        /// for the pixels they chose to remove.
        ///
        /// Bytes rather than a redirect to a presigned URL, for two reasons that both matter:
        /// a presigned URL is a bearer capability that outlives the check just made, and the
        /// client has to read the response into a <c>File</c> for the cropper, which a
        /// cross-origin fetch of a bucket with no CORS policy cannot do.
        /// </summary>
        [HttpGet("original")]
        public async Task<IActionResult> GetOriginal()
        {
            var key = userService.GetAvatarOriginalFileName(User.Identity.Name);
            if (string.IsNullOrWhiteSpace(key))
            {
                return NotFound();
            }

            var content = await originals.Read(key);
            if (content == null)
            {
                // The row can outlive the object if a cleanup half-succeeded. "There is
                // nothing to adjust" is the honest answer, and the client hides the control.
                return NotFound();
            }

            // No caching at all. The URL is stable per user while the bytes behind it are not,
            // which is the exact shape docs/ctx/2026-08-09-stable-avatar-urls.md says is unsafe
            // to cache - and unlike an avatar this is fetched once, when someone clicks Adjust.
            Response.Headers.CacheControl = "private, no-store";

            return File(content.Bytes, content.ContentType);
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
        /// **Which is why it refuses an original outright.** That bargain is fine for a cropped
        /// avatar and not for the photo it was cut from, so
        /// <see cref="AvatarStorage.IsPubliclyServable"/> gates every name before it is signed.
        /// The check is not left to the route template failing to match a slash: that would
        /// make an original's privacy a property of ASP.NET's path handling rather than of this
        /// app, and a percent-encoded separator can still arrive as a decoded route value.
        ///
        /// Registered under the same /images/ path the local-disk setup uses. UseStaticFiles
        /// runs earlier in the pipeline, so any avatar still sitting in wwwroot/images is
        /// served from there and never reaches this action.
        /// </summary>
        [AllowAnonymous]
        [HttpGet("/images/{fileName}")]
        public IActionResult GetImage(string fileName)
        {
            if (!AvatarStorage.IsPubliclyServable(fileName))
            {
                return NotFound();
            }

            var url = this.avatarUrls.GetReadUrl(fileName);

            // Null in the local-disk setup. Reaching here at all then means UseStaticFiles
            // did not find the file, so the avatar genuinely does not exist.
            if (url == null)
            {
                return NotFound();
            }

            // This used to be `no-store`, on the reasoning that a cached 302 could outlive the
            // signature it points at. True in itself, but it made the whole chain uncacheable:
            // the browser re-asked on every render, and because each answer was a *newly
            // signed* URL it could never match the image in its cache either. Every avatar was
            // downloaded once per render.
            //
            // Now that one signed URL is reused for a window, the redirect is worth caching for
            // as long as the URL behind it is guaranteed to still be valid - which is what
            // CacheableFor computes. `private`, because the target carries a signature and no
            // shared cache should hold it.
            var cacheable = this.r2.CacheableFor;
            Response.Headers.CacheControl = cacheable > TimeSpan.Zero
                ? $"private, max-age={(int)cacheable.TotalSeconds}"
                : "no-store";

            return Redirect(url);
        }

        /// <summary>
        /// The multipart body, or null with the reason.
        ///
        /// The parser enforces Avatars:MaxUploadBytes and throws once the body exceeds it.
        /// Reading Form is what triggers that, so it has to be caught here or the client gets a
        /// 500 and a stack trace instead of the reason.
        /// </summary>
        private IFormCollection ReadForm(out string error)
        {
            try
            {
                error = null;
                return HttpContext.Request.Form;
            }
            catch (InvalidDataException e)
            {
                error = e.Message;
                return null;
            }
        }

        /// <summary>
        /// The cropped square, by part name.
        ///
        /// It used to be <c>form.Files[0]</c>, which stopped being safe the moment a second
        /// file could arrive: ordering in a multipart body is the sender's choice, so
        /// positional access would happily process the original as the avatar. The positional
        /// fallback survives only for a body carrying exactly one unnamed file, which is what
        /// a client predating this change sends.
        /// </summary>
        private static IFormFile CroppedPart(IFormCollection form)
        {
            var named = form.Files["file"];
            if (named != null)
            {
                return named;
            }

            return form.Files.Count == 1 && form.Files["original"] == null ? form.Files[0] : null;
        }

        /// <summary>
        /// The crop rectangle from four form fields, or null.
        ///
        /// InvariantCulture, and not by habit: the client sends what <c>String(number)</c>
        /// produces, so "12.5" always has a dot, while a server whose culture is de-DE parses
        /// that as 125 with the current culture. The crop would then be silently wrong by a
        /// factor of ten on some machines and right on others.
        /// </summary>
        private static AvatarCropViewModel CropFrom(IFormCollection form)
        {
            if (!TryNumber(form, "cropX", out var x)
                || !TryNumber(form, "cropY", out var y)
                || !TryNumber(form, "cropWidth", out var width)
                || !TryNumber(form, "cropHeight", out var height))
            {
                return null;
            }

            return AvatarCropViewModel.Sanitized(x, y, width, height);
        }

        private static bool TryNumber(IFormCollection form, string key, out double value) =>
            double.TryParse(
                form[key].FirstOrDefault(),
                NumberStyles.Float,
                CultureInfo.InvariantCulture,
                out value);

        /// <summary>
        /// Tells every connected client that this user's avatar is now <paramref name="fileName"/>
        /// - including null, which is what a removal is.
        ///
        /// One place, because the null case is the one that has to be spelt exactly right: the
        /// client reads <c>body</c> as "a string, or the value of an ObjectResult", and a null
        /// there is what makes it patch the thread list back to initials.
        /// </summary>
        private Task Broadcast(string fileName) =>
            hubContext.Clients.All.SendAsync(
                "ReciveAvatar",
                new { body = fileName, uploaderId = User.Identity.Name });

        /// <summary>
        /// Deletes objects that have just stopped being referenced (issue #20).
        ///
        /// Every part of this is deliberate. It runs **after** the row is committed, because
        /// there is no reverse index from an object to the user pointing at it and a stray
        /// delete is unrecoverable. It never throws, because the upload the caller asked for
        /// has already succeeded and a failed cleanup is a leak, not a failure. And it logs,
        /// because a leak nobody can see is how this issue reached a year old.
        /// </summary>
        private async Task Forget(string previousAvatar, string previousOriginal)
        {
            if (!string.IsNullOrWhiteSpace(previousAvatar))
            {
                try
                {
                    if (!await avatarWriter.DeleteImage(previousAvatar))
                    {
                        logger.LogWarning("Orphaned avatar object {Key}: the delete did not succeed.", previousAvatar);
                    }
                }
                catch (Exception e)
                {
                    logger.LogWarning(e, "Orphaned avatar object {Key}: the delete threw.", previousAvatar);
                }
            }

            if (!string.IsNullOrWhiteSpace(previousOriginal))
            {
                try
                {
                    if (!await originals.Delete(previousOriginal))
                    {
                        logger.LogWarning("Orphaned avatar original {Key}: the delete did not succeed.", previousOriginal);
                    }
                }
                catch (Exception e)
                {
                    logger.LogWarning(e, "Orphaned avatar original {Key}: the delete threw.", previousOriginal);
                }
            }
        }
    }
}
