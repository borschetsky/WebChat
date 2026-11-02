using Microsoft.AspNetCore.Http;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats;
using SixLabors.ImageSharp.Formats.Bmp;
using SixLabors.ImageSharp.Formats.Gif;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.Processing;
using System;
using System.IO;
using System.Threading.Tasks;
using WebChat.AvatarWriter.Helper;
using WebChat.AvatarWriter.Interface;

namespace WebChat.AvatarWriter
{
    /// <summary>
    /// Validates, downscales and re-encodes an uploaded avatar. Shared by both writers so the
    /// local-disk and R2 paths cannot drift apart on limits or output format.
    ///
    /// Re-encoding rather than storing the original is what makes the rest safe: it discards
    /// EXIF (phone photos carry GPS coordinates), and it destroys any polyglot payload that
    /// was crafted to parse as both an image and something executable. The bytes written are
    /// bytes this process produced, not bytes the uploader supplied.
    /// </summary>
    public class AvatarImageProcessor : IAvatarImageProcessor
    {
        /// <summary>
        /// The only formats an upload is ever decoded from. ImageSharp's default configuration
        /// also decodes TIFF, TGA, PBM, QOI and WebP, and 3.1.12's TIFF decoder carries a heap
        /// out-of-bounds write (GHSA-v76p-62qx-wwq2) and a non-terminating BigTIFF loop
        /// (GHSA-wmxv-xphr-5c9g). The fix is in 3.2.0, which will not build without a Six
        /// Labors license key, so instead the decoder is not reachable: this configuration
        /// cannot read TIFF even if the magic-byte gate below is ever widened.
        ///
        /// The NuGet audit suppressions in Directory.Build.props rest on this, and on the app
        /// never calling <c>HistogramEqualization</c> or <c>IccProfile.Entries</c>, or encoding
        /// TIFF. Change any of that and the suppressions stop being true.
        /// </summary>
        public static readonly DecoderOptions DecoderOptions = new()
        {
            Configuration = new Configuration(
                new JpegConfigurationModule(),
                new PngConfigurationModule(),
                new GifConfigurationModule(),
                new BmpConfigurationModule()),
        };

        private readonly AvatarOptions options;

        public AvatarImageProcessor(AvatarOptions options)
        {
            this.options = options;
        }

        public Task<AvatarImage> Process(IFormFile file) => Process(file, options.MaxDimension);

        public async Task<AvatarImage> Process(IFormFile file, int maxDimension)
        {
            if (file == null || file.Length == 0)
            {
                return AvatarImage.Rejected("No file was uploaded");
            }

            if (file.Length > options.MaxUploadBytes)
            {
                var limitMb = options.MaxUploadBytes / (1024d * 1024d);
                return AvatarImage.Rejected($"Image is larger than the {limitMb:0.#} MB limit");
            }

            using var buffer = new MemoryStream();
            await file.CopyToAsync(buffer);
            var bytes = buffer.ToArray();

            // Keep the original magic-byte gate: it is what the existing behaviour and its
            // tests are built on, and it rejects non-images before ImageSharp sees them.
            var format = WriteHelper.GetImageFormat(bytes);
            if (format == WriteHelper.ImageFormat.unknown)
            {
                return AvatarImage.Rejected("Invalid image file");
            }

            // See DecoderOptions: the TIFF decoder must not be reachable from an upload.
            if (format == WriteHelper.ImageFormat.tiff)
            {
                return AvatarImage.Rejected("TIFF images are not supported. Use JPEG, PNG, GIF or BMP.");
            }

            try
            {
                buffer.Position = 0;

                // Header only - no pixels decoded yet. A decompression bomb is small on disk
                // and enormous once decoded, so the dimensions must be checked before Load.
                var info = await Image.IdentifyAsync(DecoderOptions, buffer);
                var megapixels = (long)info.Width * info.Height / 1_000_000d;
                if (megapixels > options.MaxSourceMegapixels)
                {
                    return AvatarImage.Rejected(
                        $"Image dimensions ({info.Width}x{info.Height}) exceed the " +
                        $"{options.MaxSourceMegapixels} megapixel limit");
                }

                buffer.Position = 0;
                using var image = await Image.LoadAsync(DecoderOptions, buffer);

                // PNG keeps transparency; everything else becomes JPEG. Animated GIFs lose
                // their animation, which is an accepted trade for a 40 px avatar.
                var keepAlpha = image.Metadata.DecodedImageFormat is PngFormat;

                image.Mutate(x =>
                {
                    // Applies the EXIF orientation flag before it is discarded, otherwise
                    // photos taken in portrait come out rotated.
                    x.AutoOrient();

                    if (image.Width > maxDimension || image.Height > maxDimension)
                    {
                        // Max preserves the aspect ratio and fits inside the box. Guarded so a
                        // small avatar is never upscaled into a blurry one.
                        x.Resize(new ResizeOptions
                        {
                            Mode = ResizeMode.Max,
                            Size = new Size(maxDimension, maxDimension),
                        });
                    }
                });

                image.Metadata.ExifProfile = null;
                image.Metadata.IptcProfile = null;
                image.Metadata.XmpProfile = null;

                using var output = new MemoryStream();
                if (keepAlpha)
                {
                    await image.SaveAsPngAsync(output);
                    return AvatarImage.Accepted(output.ToArray(), "png", "image/png");
                }

                await image.SaveAsJpegAsync(output, new JpegEncoder { Quality = options.JpegQuality });
                return AvatarImage.Accepted(output.ToArray(), "jpg", "image/jpeg");
            }
            catch (Exception e)
            {
                // Malformed images that pass the magic-byte check still fail here. Better a
                // clear rejection than an exception message stored as someone's avatar.
                return AvatarImage.Rejected($"Image could not be processed: {e.Message}");
            }
        }
    }
}
