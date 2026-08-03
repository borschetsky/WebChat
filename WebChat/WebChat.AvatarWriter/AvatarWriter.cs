using Microsoft.AspNetCore.Http;
using System;
using System.IO;
using System.Threading.Tasks;
using WebChat.AvatarWriter.Interface;

namespace WebChat.AvatarWriter
{
    /// <summary>
    /// Writes avatars to wwwroot/images, where the static-file middleware serves them.
    /// Used when no R2 credentials are configured - see Startup.AddAvatarStorage.
    /// </summary>
    public class AvatarWriter : IAvatarWriter
    {
        private readonly IAvatarImageProcessor processor;

        public AvatarWriter(IAvatarImageProcessor processor)
        {
            this.processor = processor;
        }

        public async Task<AvatarUploadResult> UploadImage(IFormFile file)
        {
            // Validation, downscaling, EXIF stripping and the choice of extension all live in
            // the processor, so this path and the R2 one cannot diverge on any of them.
            var image = await processor.Process(file);
            if (!image.Ok)
            {
                return AvatarUploadResult.Failed(image.Error);
            }

            try
            {
                var fileName = $"{Guid.NewGuid()}.{image.Extension}";
                var directory = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "images");

                // wwwroot/images is not in source control, so outside Docker (where compose
                // mounts a volume over it) it does not exist and FileMode.Create throws
                // DirectoryNotFoundException. That was caught below and returned as the
                // filename, which the caller then stored as the user's avatar.
                Directory.CreateDirectory(directory);

                await File.WriteAllBytesAsync(Path.Combine(directory, fileName), image.Bytes);

                return AvatarUploadResult.Stored(fileName);
            }
            catch (Exception e)
            {
                return AvatarUploadResult.Failed(e.Message);
            }
        }
    }
}
