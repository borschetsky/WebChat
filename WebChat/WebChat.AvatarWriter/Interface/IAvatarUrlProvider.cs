namespace WebChat.AvatarWriter.Interface
{
    /// <summary>
    /// Produces a URL a browser can fetch an avatar from.
    ///
    /// Separate from <see cref="IAvatarWriter"/> because the local-disk writer has no use for
    /// it: those files are served straight off wwwroot by the static-file middleware. Only
    /// object storage needs a signed URL, so only the R2 writer registers this.
    /// </summary>
    public interface IAvatarUrlProvider
    {
        /// <summary>
        /// A short-lived presigned URL for <paramref name="fileName"/>, or null when avatars
        /// are not in object storage at all.
        ///
        /// No network call and no existence check - signing is local, so this returns a URL
        /// even for an object that was never uploaded. Such a URL yields a 404 from R2 when
        /// followed, which is the correct outcome for a missing avatar anyway.
        /// </summary>
        string GetReadUrl(string fileName);
    }
}
