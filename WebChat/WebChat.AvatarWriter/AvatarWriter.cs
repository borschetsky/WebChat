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
                var fileName = AvatarStorage.NewAvatarKey(image.Extension);
                var directory = ImageDirectory;

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

        /// <summary>
        /// Issue #20, on the local-disk path. Best-effort and silent for the same reason the
        /// R2 one is: the replacement is already committed by the time this runs.
        ///
        /// <see cref="AvatarStorage.IsPubliclyServable"/> is the guard rather than a bare
        /// null check - it refuses path separators, so a filename read back out of the
        /// database cannot address anything outside wwwroot/images, and it refuses an
        /// original key, which this writer never wrote and must never remove.
        /// </summary>
        public Task<bool> DeleteImage(string fileName)
        {
            if (!AvatarStorage.IsPubliclyServable(fileName))
            {
                return Task.FromResult(false);
            }

            try
            {
                File.Delete(Path.Combine(ImageDirectory, fileName));
                return Task.FromResult(true);
            }
            catch (Exception)
            {
                return Task.FromResult(false);
            }
        }

        private static string ImageDirectory =>
            Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "images");
    }
}
