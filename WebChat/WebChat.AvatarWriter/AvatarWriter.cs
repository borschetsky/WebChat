using Microsoft.AspNetCore.Http;
using System;
using System.IO;
using System.Threading.Tasks;
using WebChat.AvatarWriter.Helper;
using WebChat.AvatarWriter.Interface;

namespace WebChat.AvatarWriter
{
    public class AvatarWriter : IAvatarWriter
    {
        public async Task<string> UploadImage(IFormFile file)
        {
            if (CheckIfImageFile(file))
            {
                return await WriteFile(file);
            }

            return "Invalid image file";
        }

      
        private bool CheckIfImageFile(IFormFile file)
        {
            return DetectFormat(file) != WriteHelper.ImageFormat.unknown;
        }

        private static WriteHelper.ImageFormat DetectFormat(IFormFile file)
        {
            byte[] fileBytes;
            using (var ms = new MemoryStream())
            {
                file.CopyTo(ms);
                fileBytes = ms.ToArray();
            }

            return WriteHelper.GetImageFormat(fileBytes);
        }

        private static string ExtensionFor(WriteHelper.ImageFormat format) => format switch
        {
            WriteHelper.ImageFormat.jpeg => "jpg",
            WriteHelper.ImageFormat.png => "png",
            WriteHelper.ImageFormat.gif => "gif",
            WriteHelper.ImageFormat.bmp => "bmp",
            WriteHelper.ImageFormat.tiff => "tiff",
            _ => "bin",
        };

        
        public async Task<string> WriteFile(IFormFile file)
        {
            string fileName;
            
            try
            {
                // Extension from the sniffed format, not from file.FileName. The uploader
                // controls that name, and these files are served straight off our own origin
                // by the static-file middleware, so an attacker-chosen ".html" on content that
                // also parses as an image is a stored-XSS vector.
                fileName = Guid.NewGuid() + "." + ExtensionFor(DetectFormat(file));

                var directory = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "images");

                // wwwroot/images is not in source control, so outside Docker (where compose
                // mounts a volume over it) it does not exist and FileMode.Create throws
                // DirectoryNotFoundException. That was caught below and returned as the
                // filename, which the caller then stored as the user's avatar.
                Directory.CreateDirectory(directory);

                using (var bits = new FileStream(Path.Combine(directory, fileName), FileMode.Create))
                {
                    await file.CopyToAsync(bits);
                }
            }
            catch (Exception e)
            {
                return e.Message;
            }

            return fileName;
        }
    }
}
