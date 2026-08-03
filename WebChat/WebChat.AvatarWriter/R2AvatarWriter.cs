using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.AspNetCore.Http;
using System;
using System.IO;
using System.Threading.Tasks;
using WebChat.AvatarWriter.Helper;
using WebChat.AvatarWriter.Interface;

namespace WebChat.AvatarWriter
{
    /// <summary>
    /// Stores avatars in Cloudflare R2 over its S3-compatible API.
    ///
    /// Chosen over DigitalOcean Spaces because R2's free tier (10 GB, no egress charge)
    /// covers a project this size at no cost, where Spaces bills a $5/month minimum. The two
    /// speak the same API, so switching later means changing ServiceUrl and the bucket name.
    ///
    /// Reads go out as short-lived presigned URLs rather than from a public bucket: publishing
    /// the bucket needs a custom domain on Cloudflare DNS, and this project has no domain yet.
    /// </summary>
    public class R2AvatarWriter : IAvatarWriter, IAvatarUrlProvider
    {
        private readonly IAmazonS3 client;
        private readonly R2Options options;

        public R2AvatarWriter(IAmazonS3 client, R2Options options)
        {
            this.client = client;
            this.options = options;
        }

        public async Task<string> UploadImage(IFormFile file)
        {
            // Buffered once and reused for both the format check and the upload. The local
            // writer reads the stream twice; avatars are small enough that either is fine, but
            // there is no reason to pay for a second read here.
            using var buffer = new MemoryStream();
            await file.CopyToAsync(buffer);
            var bytes = buffer.ToArray();

            var format = WriteHelper.GetImageFormat(bytes);
            if (format == WriteHelper.ImageFormat.unknown)
            {
                return "Invalid image file";
            }

            // The extension comes from the sniffed magic bytes, never from file.FileName. The
            // uploader controls that name, and an attacker-chosen extension on a file served
            // from our own origin is a stored-XSS vector - a payload crafted to satisfy both
            // an image header and an HTML parser would otherwise be saved as ".html".
            var fileName = $"{Guid.NewGuid()}.{ExtensionFor(format)}";

            try
            {
                buffer.Position = 0;
                await client.PutObjectAsync(new PutObjectRequest
                {
                    BucketName = options.Bucket,
                    Key = fileName,
                    InputStream = buffer,
                    ContentType = ContentTypeFor(format),
                    // R2 rejects the streaming-checksum trailer the v4 SDK adds by default.
                    DisablePayloadSigning = true,
                });
            }
            catch (Exception e)
            {
                // Matches the local writer's contract. It is a poor one - the caller stores
                // whatever comes back as the user's avatar filename, so a failure is persisted
                // as an error string - but changing it means changing ImageHandler and
                // AvatarsController too, which is outside this change.
                return e.Message;
            }

            return fileName;
        }

        public string GetReadUrl(string fileName) =>
            client.GetPreSignedURL(new GetPreSignedUrlRequest
            {
                BucketName = options.Bucket,
                Key = fileName,
                Verb = HttpVerb.GET,
                Expires = DateTime.UtcNow.AddMinutes(options.UrlLifetimeMinutes),
            });

        private static string ExtensionFor(WriteHelper.ImageFormat format) => format switch
        {
            WriteHelper.ImageFormat.jpeg => "jpg",
            WriteHelper.ImageFormat.png => "png",
            WriteHelper.ImageFormat.gif => "gif",
            WriteHelper.ImageFormat.bmp => "bmp",
            WriteHelper.ImageFormat.tiff => "tiff",
            _ => "bin",
        };

        private static string ContentTypeFor(WriteHelper.ImageFormat format) => format switch
        {
            WriteHelper.ImageFormat.jpeg => "image/jpeg",
            WriteHelper.ImageFormat.png => "image/png",
            WriteHelper.ImageFormat.gif => "image/gif",
            WriteHelper.ImageFormat.bmp => "image/bmp",
            WriteHelper.ImageFormat.tiff => "image/tiff",
            _ => "application/octet-stream",
        };
    }
}
