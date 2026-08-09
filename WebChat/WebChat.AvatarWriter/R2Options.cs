using System;

namespace WebChat.AvatarWriter
{
    /// <summary>
    /// Cloudflare R2 settings, bound from the "R2" configuration section.
    ///
    /// Only <see cref="Bucket"/> and <see cref="UrlLifetimeMinutes"/> belong in
    /// appsettings.json. AccountId, AccessKeyId and SecretAccessKey are credentials and must
    /// come from user secrets in development or environment variables in production - see
    /// the note in CLAUDE.md about not committing any more secrets to this repo.
    /// </summary>
    public class R2Options
    {
        public const string SectionName = "R2";

        public string AccountId { get; set; } = "";

        public string AccessKeyId { get; set; } = "";

        public string SecretAccessKey { get; set; } = "";

        public string Bucket { get; set; } = "";

        /// <summary>
        /// How long a presigned read URL stays valid.
        ///
        /// Must stay comfortably larger than <see cref="UrlCacheMinutes"/>: a URL handed out
        /// at the very end of a cache window still has to be usable, and what is left at that
        /// moment is only the difference between the two. See <see cref="CacheableFor"/>.
        /// </summary>
        public int UrlLifetimeMinutes { get; set; } = 30;

        /// <summary>
        /// How long one signed URL is reused before a new one is minted.
        ///
        /// This is what makes an avatar cacheable at all. A SigV4 URL carries its signing
        /// instant, so signing per request produced a different URL every time and the
        /// browser could never match one - every render re-downloaded the image. Set to 0 to
        /// go back to signing per request.
        /// </summary>
        public int UrlCacheMinutes { get; set; } = 5;

        /// <summary>
        /// How long the redirect itself may be cached: the smaller of the reuse window and
        /// the validity a URL is guaranteed to have left when it is handed out at the end of
        /// that window.
        ///
        /// Bounding by the second term is the part that is easy to get wrong - cache the
        /// redirect for longer than the URL it points at is guaranteed to live, and a browser
        /// will faithfully replay a request to something already expired.
        /// </summary>
        public TimeSpan CacheableFor
        {
            get
            {
                var reuse = TimeSpan.FromMinutes(Math.Max(0, UrlCacheMinutes));
                var guaranteedRemaining = TimeSpan.FromMinutes(UrlLifetimeMinutes) - reuse;

                return guaranteedRemaining <= TimeSpan.Zero
                    ? TimeSpan.Zero
                    : (reuse < guaranteedRemaining ? reuse : guaranteedRemaining);
            }
        }

        /// <summary>R2's S3-compatible endpoint for this account.</summary>
        public string ServiceUrl => $"https://{AccountId}.r2.cloudflarestorage.com";

        /// <summary>
        /// True when every credential is present. Startup uses this to decide between the R2
        /// writer and the local-disk one, so a developer with no R2 keys still gets a working
        /// app rather than a crash on the first upload.
        /// </summary>
        public bool IsConfigured =>
            !string.IsNullOrWhiteSpace(AccountId)
            && !string.IsNullOrWhiteSpace(AccessKeyId)
            && !string.IsNullOrWhiteSpace(SecretAccessKey)
            && !string.IsNullOrWhiteSpace(Bucket);
    }
}
