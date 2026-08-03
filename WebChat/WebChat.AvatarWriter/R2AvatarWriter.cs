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
        private readonly IAvatarImageProcessor processor;

        public R2AvatarWriter(IAmazonS3 client, R2Options options, IAvatarImageProcessor processor)
        {
            this.client = client;
            this.options = options;
            this.processor = processor;
        }

        public async Task<AvatarUploadResult> UploadImage(IFormFile file)
        {
            // Validation, downscaling, EXIF stripping and the choice of extension and
            // content type all live in the processor, shared with the local-disk writer.
            var image = await processor.Process(file);
            if (!image.Ok)
            {
                return AvatarUploadResult.Failed(image.Error);
            }

            var fileName = $"{Guid.NewGuid()}.{image.Extension}";

            try
            {
                using var body = new MemoryStream(image.Bytes);
                await client.PutObjectAsync(new PutObjectRequest
                {
                    BucketName = options.Bucket,
                    Key = fileName,
                    InputStream = body,
                    ContentType = image.ContentType,
                    // R2 rejects the streaming-checksum trailer the v4 SDK adds by default.
                    DisablePayloadSigning = true,
                });
            }
            catch (Exception e)
            {
                return AvatarUploadResult.Failed(e.Message);
            }

            return AvatarUploadResult.Stored(fileName);
        }

        public string GetReadUrl(string fileName) =>
            client.GetPreSignedURL(new GetPreSignedUrlRequest
            {
                BucketName = options.Bucket,
                Key = fileName,
                Verb = HttpVerb.GET,
                Expires = DateTime.UtcNow.AddMinutes(options.UrlLifetimeMinutes),
            });
    }
}
