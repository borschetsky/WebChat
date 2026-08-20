using Microsoft.AspNetCore.Http;
using System.Threading.Tasks;

namespace WebChat.AvatarWriter.Interface
{
    /// <summary>
    /// Stores the un-cropped photo a crop was taken from, so "Adjust crop" does not degrade
    /// into a forced re-upload (issue #88, and the 2026-08-16 design handoff which mandates
    /// storing the original plus crop parameters server-side).
    ///
    /// **Deliberately not part of <see cref="IAvatarWriter"/>.** The two have different
    /// audiences, and that is the whole point: a cropped avatar is served over the anonymous
    /// <c>/images/{name}</c> redirect, while an original holds exactly the pixels the user
    /// cropped out and is only ever read back through an authenticated endpoint, for the one
    /// user it belongs to. Keys live under <see cref="AvatarStorage.OriginalPrefix"/> and the
    /// public read path refuses that prefix outright.
    ///
    /// Reads come back as bytes rather than as a URL because the client has to turn them into
    /// a <c>File</c> for the cropper: a redirect to a presigned URL would be a cross-origin
    /// fetch the bucket has no CORS policy for, and an <c>&lt;img&gt;</c> cannot carry the
    /// bearer token that decides whether the caller may see it at all.
    /// </summary>
    public interface IAvatarOriginalStore
    {
        /// <summary>
        /// Validates, re-encodes and stores an original, returning its key. Never throws for
        /// bad input - a rejection comes back as <see cref="AvatarUploadResult.Error"/>.
        /// </summary>
        Task<AvatarUploadResult> Save(IFormFile file);

        /// <summary>
        /// The stored bytes, or null when the key names nothing this store holds. Refuses any
        /// key that is not a well-formed original key, so a caller cannot read a cropped
        /// avatar - or anything else - through this door.
        /// </summary>
        Task<AvatarOriginalContent> Read(string key);

        /// <summary>
        /// Removes an original, best-effort and without throwing, on the same terms as
        /// <see cref="IAvatarWriter.DeleteImage"/>.
        ///
        /// Called when the photo is *replaced*, never when it is merely re-cropped: a re-crop
        /// keeps the original, which is the only thing that lets it be adjusted twice.
        /// </summary>
        Task<bool> Delete(string key);
    }

    /// <summary>Bytes read back from the original store, with the type to serve them as.</summary>
    public sealed class AvatarOriginalContent
    {
        public AvatarOriginalContent(byte[] bytes, string contentType)
        {
            this.Bytes = bytes;
            this.ContentType = contentType;
        }

        public byte[] Bytes { get; }

        public string ContentType { get; }
    }
}
