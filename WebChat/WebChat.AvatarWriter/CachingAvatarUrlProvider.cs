using System;
using System.Collections.Concurrent;
using System.Linq;
using WebChat.AvatarWriter.Interface;

namespace WebChat.AvatarWriter
{
    /// <summary>
    /// Hands out the same presigned URL for a given file for a short window, instead of a
    /// freshly signed one per request.
    ///
    /// Signing is local and cheap, so this is not about saving CPU - it is the only thing
    /// that makes an avatar cacheable at all. A SigV4 URL carries the signing instant in
    /// X-Amz-Date and signs over it, so two URLs minted a second apart differ, and a
    /// different URL is a cache miss by definition. Every render therefore re-downloaded the
    /// image. Returning one byte-identical URL for the whole window gives the browser and
    /// R2's edge something to match on.
    ///
    /// The SDK offers no way to pin the signing instant - GetPreSignedUrlRequest exposes
    /// Expires, not the clock - so the URL is memoised rather than made deterministic. Same
    /// effect, and no dependence on SDK internals.
    ///
    /// Safe only because a stored avatar is immutable: every upload writes a fresh
    /// "{Guid}.{ext}", so the bytes behind a filename never change and replacing an avatar
    /// produces a different filename, which is a guaranteed miss rather than a stale hit.
    /// </summary>
    public sealed class CachingAvatarUrlProvider : IAvatarUrlProvider
    {
        /// <summary>
        /// Distinct files held before a prune is attempted. Reached only by a workload
        /// touching that many different avatars inside one window; the prune is O(n) over
        /// entries and drops everything already expired, so it is bounded work at a bounded
        /// frequency rather than a fixed-size eviction policy nobody would tune.
        /// </summary>
        private const int PruneThreshold = 5000;

        private readonly IAvatarUrlProvider inner;
        private readonly TimeSpan window;
        private readonly TimeProvider clock;
        private readonly ConcurrentDictionary<string, Entry> cache = new(StringComparer.Ordinal);

        public CachingAvatarUrlProvider(IAvatarUrlProvider inner, TimeSpan window, TimeProvider clock = null)
        {
            this.inner = inner ?? throw new ArgumentNullException(nameof(inner));
            this.window = window;
            this.clock = clock ?? TimeProvider.System;
        }

        private readonly record struct Entry(string Url, DateTimeOffset MintedAt);

        public string GetReadUrl(string fileName)
        {
            // A non-positive window disables reuse entirely, which is the escape hatch if a
            // signed URL ever has to be single-use.
            if (this.window <= TimeSpan.Zero || string.IsNullOrWhiteSpace(fileName))
            {
                return this.inner.GetReadUrl(fileName);
            }

            var now = this.clock.GetUtcNow();

            if (this.cache.TryGetValue(fileName, out var hit) && now - hit.MintedAt < this.window)
            {
                return hit.Url;
            }

            var url = this.inner.GetReadUrl(fileName);

            // Null means avatars are not in object storage at all, and caching it would
            // pin that answer past a configuration change.
            if (url == null)
            {
                return null;
            }

            if (this.cache.Count >= PruneThreshold)
            {
                this.Prune(now);
            }

            this.cache[fileName] = new Entry(url, now);
            return url;
        }

        private void Prune(DateTimeOffset now)
        {
            foreach (var key in this.cache
                .Where(kv => now - kv.Value.MintedAt >= this.window)
                .Select(kv => kv.Key)
                .ToList())
            {
                this.cache.TryRemove(key, out _);
            }
        }
    }
}
