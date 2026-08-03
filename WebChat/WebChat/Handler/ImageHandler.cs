using Microsoft.AspNetCore.Http;
using System.Threading.Tasks;
using WebChat.AvatarWriter.Interface;

namespace WebChat.Handler
{
    public interface IImageHandler
    {
        Task<AvatarUploadResult> UploadImage(IFormFile file);
    }

    public class ImageHandler : IImageHandler
    {
        private readonly IAvatarWriter _imageWriter;

        public ImageHandler(IAvatarWriter imageWriter)
        {
            _imageWriter = imageWriter;
        }

        // Returns the result rather than an IActionResult so the controller can decide the
        // status code. It previously wrapped everything in an ObjectResult, which the
        // controller then unwrapped with ToString() - losing any notion of success or failure
        // on the way through.
        public Task<AvatarUploadResult> UploadImage(IFormFile file) => _imageWriter.UploadImage(file);
    }
}
