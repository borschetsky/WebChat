using Microsoft.AspNetCore.Http;
using System;
using System.IO;
using System.Threading.Tasks;
using WebChat.AvatarWriter.Interface;

namespace WebChat.AvatarWriter
{
    /// <summary>
    /// Originals on local disk, for the no-R2-credentials setup that <c>AvatarWriter</c>
    /// serves.
    ///
    /// **Not under wwwroot, and that is the whole design of this class.** Avatars go to
    /// wwwroot/images because the static-file middleware serves them, which is exactly what an
    /// original must not get: a directory under wwwroot would publish every un-cropped photo at
    /// a guessable-ish path, with no authentication in front of it, and would quietly undo the
    /// decision that originals are owner-only. So they live in their own directory beside it,
    /// reachable only through the authenticated endpoint that reads this store.
    ///
    /// Keys carry <see cref="AvatarStorage.OriginalPrefix"/> in both setups, so the database
    /// holds the same shape of value whichever store wrote it; the prefix maps onto this
    /// directory rather than onto a subdirectory of it.
    /// </summary>
    public class LocalAvatarOriginalStore : IAvatarOriginalStore
    {
        private const string DirectoryName = "avatar-originals";

        private readonly AvatarOptions avatars;
        private readonly IAvatarImageProcessor processor;

        public LocalAvatarOriginalStore(AvatarOptions avatars, IAvatarImageProcessor processor)
        {
            this.avatars = avatars;
            this.processor = processor;
        }

        private static string Directory_ =>
            Path.Combine(System.IO.Directory.GetCurrentDirectory(), DirectoryName);

        public async Task<AvatarUploadResult> Save(IFormFile file)
        {
            var image = await processor.Process(file, avatars.OriginalMaxDimension);
            if (!image.Ok)
            {
                return AvatarUploadResult.Failed(image.Error);
            }

            try
            {
                var key = AvatarStorage.NewOriginalKey(image.Extension);
                System.IO.Directory.CreateDirectory(Directory_);
                await File.WriteAllBytesAsync(PathFor(key), image.Bytes);

                return AvatarUploadResult.Stored(key);
            }
            catch (Exception e)
            {
                return AvatarUploadResult.Failed(e.Message);
            }
        }

        public async Task<AvatarOriginalContent> Read(string key)
        {
            var path = PathFor(key);
            if (path == null || !File.Exists(path))
            {
                return null;
            }

            try
            {
                var bytes = await File.ReadAllBytesAsync(path);
                var png = Path.GetExtension(path).Equals(".png", StringComparison.OrdinalIgnoreCase);

                return new AvatarOriginalContent(bytes, png ? "image/png" : "image/jpeg");
            }
            catch (Exception)
            {
                return null;
            }
        }

        public Task<bool> Delete(string key)
        {
            var path = PathFor(key);
            if (path == null)
            {
                return Task.FromResult(false);
            }

            try
            {
                File.Delete(path);
                return Task.FromResult(true);
            }
            catch (Exception)
            {
                return Task.FromResult(false);
            }
        }

        /// <summary>
        /// Null unless the key is a well-formed original key whose remainder is a bare file
        /// name - <see cref="AvatarStorage.OriginalFileNameOf"/> refuses separators and "..",
        /// so a crafted key cannot address a path outside this directory.
        /// </summary>
        private static string PathFor(string key)
        {
            var name = AvatarStorage.OriginalFileNameOf(key);
            return name == null ? null : Path.Combine(Directory_, name);
        }
    }
}
