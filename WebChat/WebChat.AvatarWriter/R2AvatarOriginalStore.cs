using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.AspNetCore.Http;
using System;
using System.IO;
using System.Threading.Tasks;
using WebChat.AvatarWriter.Interface;

namespace WebChat.AvatarWriter
{
    /// <summary>
    /// Un-cropped originals in the same R2 bucket as the avatars, under
    /// <see cref="AvatarStorage.OriginalPrefix"/>.
    ///
    /// Same bucket rather than a second one: the prefix is what carries the access decision
    /// (<see cref="AvatarStorage.IsPubliclyServable"/> refuses it, and nothing signs a read URL
    /// for it), and a second bucket would add credentials and configuration without adding a
    /// boundary - the same key pair would open both.
    ///
    /// Reads return bytes rather than a presigned URL on purpose. A URL is a capability: hand
    /// one out and the caller can pass it on, which is precisely the property that makes the
    /// anonymous avatar path acceptable for a crop and unacceptable for the pixels behind it.
    /// The bytes come back through an authenticated endpoint that has just checked the key
    /// belongs to the caller, and they are never addressable on their own.
    /// </summary>
    public class R2AvatarOriginalStore : IAvatarOriginalStore
    {
        private readonly IAmazonS3 client;
        private readonly R2Options options;
        private readonly AvatarOptions avatars;
        private readonly IAvatarImageProcessor processor;

        public R2AvatarOriginalStore(
            IAmazonS3 client,
            R2Options options,
            AvatarOptions avatars,
            IAvatarImageProcessor processor)
        {
            this.client = client;
            this.options = options;
            this.avatars = avatars;
            this.processor = processor;
        }

        public async Task<AvatarUploadResult> Save(IFormFile file)
        {
            // The same validation the avatar gets, at the original's larger size cap. Bytes
            // written are bytes this process produced: re-encoding is what discards EXIF (a
            // phone photo carries GPS) and destroys any polyglot payload.
            var image = await processor.Process(file, avatars.OriginalMaxDimension);
            if (!image.Ok)
            {
                return AvatarUploadResult.Failed(image.Error);
            }

            var key = AvatarStorage.NewOriginalKey(image.Extension);

            try
            {
                using var body = new MemoryStream(image.Bytes);
                await client.PutObjectAsync(new PutObjectRequest
                {
                    BucketName = options.Bucket,
                    Key = key,
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

            return AvatarUploadResult.Stored(key);
        }

        public async Task<AvatarOriginalContent> Read(string key)
        {
            // Anything that is not an original key is not this store's to serve. Without this
            // a caller whose row somehow named a cropped avatar would read it back through an
            // endpoint that never intended to serve one.
            if (!AvatarStorage.IsOriginalKey(key))
            {
                return null;
            }

            try
            {
                using var response = await client.GetObjectAsync(options.Bucket, key);
                using var buffer = new MemoryStream();
                await response.ResponseStream.CopyToAsync(buffer);

                return new AvatarOriginalContent(
                    buffer.ToArray(),
                    string.IsNullOrWhiteSpace(response.Headers.ContentType)
                        ? "application/octet-stream"
                        : response.Headers.ContentType);
            }
            catch (Exception)
            {
                // A missing object is the ordinary case here - the row can outlive the object
                // if a delete half-succeeded - and it is indistinguishable from a transient
                // fault at this layer. Both mean "there is nothing to adjust", which the
                // caller answers as 404.
                return null;
            }
        }

        public async Task<bool> Delete(string key)
        {
            if (!AvatarStorage.IsOriginalKey(key))
            {
                return false;
            }

            try
            {
                await client.DeleteObjectAsync(options.Bucket, key);
                return true;
            }
            catch (Exception)
            {
                return false;
            }
        }
    }
}
