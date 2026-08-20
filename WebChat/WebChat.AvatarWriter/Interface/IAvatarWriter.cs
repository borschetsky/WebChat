using Microsoft.AspNetCore.Http;
using System.Threading.Tasks;

namespace WebChat.AvatarWriter.Interface
{
    public interface IAvatarWriter
    {
        Task<AvatarUploadResult> UploadImage(IFormFile file);

        /// <summary>
        /// Removes a stored avatar, best-effort. Returns whether the object is gone, and
        /// never throws: the only caller runs *after* the replacement has been committed, so
        /// a failed cleanup must not fail an upload that already succeeded (issue #20).
        ///
        /// There is no reverse index from an object back to the user pointing at it, so a
        /// stray delete is unrecoverable. Only ever pass a key that has just stopped being
        /// referenced.
        /// </summary>
        Task<bool> DeleteImage(string fileName);
    }

    /// <summary>
    /// Outcome of an upload: either the stored filename, or why it was refused.
    ///
    /// This used to be a bare string that carried both, which meant a caller could not tell
    /// them apart - and AvatarsController did not try, so a rejected upload wrote the failure
    /// text into User.AvatarFileName. A real row read "Invalid image file" as its avatar.
    /// That was survivable while rejections were rare; with an upload size limit they are
    /// routine, so the two cases are now distinct types.
    /// </summary>
    public class AvatarUploadResult
    {
        private AvatarUploadResult() { }

        public bool Ok => Error == null;

        public string FileName { get; private set; }

        public string Error { get; private set; }

        public static AvatarUploadResult Stored(string fileName) =>
            new AvatarUploadResult { FileName = fileName };

        public static AvatarUploadResult Failed(string error) =>
            new AvatarUploadResult { Error = error };
    }
}
