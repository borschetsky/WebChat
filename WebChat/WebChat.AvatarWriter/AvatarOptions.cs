namespace WebChat.AvatarWriter
{
    /// <summary>
    /// Limits and output settings for avatar processing, bound from the "Avatars" section.
    /// Nothing here is secret, so all of it belongs in appsettings.json.
    /// </summary>
    public class AvatarOptions
    {
        public const string SectionName = "Avatars";

        /// <summary>
        /// Largest upload accepted, before decoding. The first real avatar uploaded to this
        /// app was 2.8 MB straight off a phone; at that size R2's 10 GB free tier holds about
        /// 3,500 avatars instead of ~200,000, and every thread-list render pulls megabytes.
        /// </summary>
        public long MaxUploadBytes { get; set; } = 5 * 1024 * 1024;

        /// <summary>
        /// Longest edge of the stored image. Avatars render at 34-40 px (see densityTokens in
        /// the client theme), so 256 still covers high-DPI displays with room to spare.
        /// </summary>
        public int MaxDimension { get; set; } = 256;

        /// <summary>
        /// Longest edge of the stored **original** - the un-cropped photo kept so a crop can be
        /// adjusted later (#88).
        ///
        /// Deliberately far larger than <see cref="MaxDimension"/>, because the two are stored
        /// for opposite reasons: the avatar only ever renders at 34-40 px, while the point of
        /// the original is that someone can zoom *into* it and still get a usable 256 px square
        /// out the other side. Measured in
        /// docs/research/2026-08-15-avatar-recrop-and-original-storage.md: ~29.8 kB per user at
        /// 512, ~93.5 kB at 1024. At 1024 the R2 free tier still holds tens of thousands of
        /// users, and the marginal money is a fraction of a cent per thousand - so the size cap
        /// is chosen for how much crop headroom it leaves, not for storage cost.
        /// </summary>
        public int OriginalMaxDimension { get; set; } = 1024;

        /// <summary>
        /// Guards against decompression bombs: a few hundred KB of PNG can declare a canvas
        /// of hundreds of megapixels, and decoding it is what exhausts memory - not the file
        /// size, which <see cref="MaxUploadBytes"/> already covers. Dimensions are read from
        /// the header before any pixel data is decoded.
        /// </summary>
        public int MaxSourceMegapixels { get; set; } = 50;

        public int JpegQuality { get; set; } = 82;
    }
}
