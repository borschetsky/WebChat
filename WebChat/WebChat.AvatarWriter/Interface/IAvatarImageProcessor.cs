using Microsoft.AspNetCore.Http;
using System.Threading.Tasks;

namespace WebChat.AvatarWriter.Interface
{
    public interface IAvatarImageProcessor
    {
        /// <summary>
        /// Validates and normalises an upload. Never throws for bad input - a rejection comes
        /// back as <see cref="AvatarImage.Error"/> so callers can surface the reason.
        /// </summary>
        Task<AvatarImage> Process(IFormFile file);

        /// <summary>
        /// The same pipeline against a different size cap, for the stored original - which has
        /// to keep enough pixels that re-cropping into it is worth doing, where the avatar
        /// itself only ever renders at 34-40 px.
        ///
        /// An overload rather than a second processor: every other rule (the magic-byte gate,
        /// the megapixel guard, AutoOrient, stripping EXIF, the PNG/JPEG choice) must apply
        /// identically to both objects, and two implementations would drift.
        /// </summary>
        Task<AvatarImage> Process(IFormFile file, int maxDimension);
    }

    /// <summary>The result of processing: either normalised bytes, or a reason they were rejected.</summary>
    public class AvatarImage
    {
        private AvatarImage() { }

        public bool Ok => Error == null;

        public string Error { get; private set; }

        /// <summary>Re-encoded image data - never the uploader's original bytes.</summary>
        public byte[] Bytes { get; private set; }

        /// <summary>Extension without the dot, derived from the encoder actually used.</summary>
        public string Extension { get; private set; }

        public string ContentType { get; private set; }

        public static AvatarImage Accepted(byte[] bytes, string extension, string contentType) =>
            new AvatarImage { Bytes = bytes, Extension = extension, ContentType = contentType };

        public static AvatarImage Rejected(string error) => new AvatarImage { Error = error };
    }
}
