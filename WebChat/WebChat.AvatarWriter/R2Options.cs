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
        /// How long a presigned read URL stays valid. This is deliberately short: the browser
        /// is redirected to a freshly signed URL on every avatar request, so a long lifetime
        /// buys nothing and only widens the window in which a leaked URL still works.
        /// </summary>
        public int UrlLifetimeMinutes { get; set; } = 15;

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
