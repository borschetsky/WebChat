using System;
using WebChat.AvatarWriter;
using WebChat.AvatarWriter.Interface;

namespace WebChat.Tests.Avatars;

/// <summary>
/// Avatars were re-downloaded on every render, and the reason was not the image cache - it
/// was that no two requests ever asked for the same URL. A SigV4 presigned URL carries its
/// signing instant in X-Amz-Date and signs over it, so signing per request produced a
/// different URL every time, and a different URL is a cache miss by definition.
///
/// These pin the fix: one byte-identical URL per file for the length of the window.
/// </summary>
public class CachingAvatarUrlProviderTests
{
    /// <summary>Signs a URL that differs every call, exactly as the real signer does.</summary>
    private sealed class CountingSigner : IAvatarUrlProvider
    {
        public int Calls { get; private set; }

        // string?, because the real provider returns null when avatars are not in object
        // storage. IAvatarUrlProvider declares plain `string` - WebChat.AvatarWriter has no
        // nullable context, so the annotation is only meaningful here, where it stops a
        // CS8603 rather than hiding one.
        public string? GetReadUrl(string fileName)
        {
            this.Calls++;
            return fileName == null ? null : $"https://r2.example/{fileName}?sig=call-{this.Calls}";
        }
    }

    private sealed class Clock : TimeProvider
    {
        private DateTimeOffset now = new(2026, 8, 8, 12, 0, 0, TimeSpan.Zero);

        public override DateTimeOffset GetUtcNow() => this.now;

        public void Advance(TimeSpan by) => this.now += by;
    }

    private static readonly TimeSpan Window = TimeSpan.FromMinutes(5);

    [Fact]
    public void The_same_file_gets_a_byte_identical_url_within_the_window()
    {
        var signer = new CountingSigner();
        var clock = new Clock();
        var provider = new CachingAvatarUrlProvider(signer, Window, clock);

        var first = provider.GetReadUrl("a.png");
        clock.Advance(TimeSpan.FromMinutes(4));
        var second = provider.GetReadUrl("a.png");

        // Identical string, not merely equivalent - the browser matches its cache on the URL.
        Assert.Equal(first, second);
        Assert.Equal(1, signer.Calls);
    }

    [Fact]
    public void A_new_url_is_minted_once_the_window_passes()
    {
        var signer = new CountingSigner();
        var clock = new Clock();
        var provider = new CachingAvatarUrlProvider(signer, Window, clock);

        var first = provider.GetReadUrl("a.png");
        clock.Advance(Window);
        var second = provider.GetReadUrl("a.png");

        Assert.NotEqual(first, second);
        Assert.Equal(2, signer.Calls);
    }

    [Fact]
    public void Different_files_never_share_a_url()
    {
        var provider = new CachingAvatarUrlProvider(new CountingSigner(), Window, new Clock());

        Assert.NotEqual(provider.GetReadUrl("a.png"), provider.GetReadUrl("b.png"));
    }

    [Fact]
    public void A_zero_window_signs_every_time()
    {
        // The escape hatch, if a signed URL ever has to be single-use.
        var signer = new CountingSigner();
        var provider = new CachingAvatarUrlProvider(signer, TimeSpan.Zero, new Clock());

        Assert.NotEqual(provider.GetReadUrl("a.png"), provider.GetReadUrl("a.png"));
        Assert.Equal(2, signer.Calls);
    }

    [Fact]
    public void A_null_url_is_not_cached()
    {
        // Null means avatars are not in object storage at all. Caching it would pin that
        // answer past a configuration change.
        var signer = new CountingSigner();
        var provider = new CachingAvatarUrlProvider(signer, Window, new Clock());

        Assert.Null(provider.GetReadUrl(null));
        Assert.Null(provider.GetReadUrl(null));
        Assert.Equal(2, signer.Calls);
    }
}

/// <summary>
/// The redirect's max-age has to be bounded by what is *left* on a URL handed out at the very
/// end of the reuse window, not by the window or the lifetime alone. Getting this wrong caches
/// a redirect to something already expired, which fails only for whoever holds it.
/// </summary>
public class R2CacheableForTests
{
    [Fact]
    public void Is_the_reuse_window_when_that_is_the_smaller_of_the_two()
    {
        var options = new R2Options { UrlLifetimeMinutes = 30, UrlCacheMinutes = 5 };

        // Worst case: signed at the start of the window, handed out at the end, so 25 minutes
        // remain. 5 is the binding constraint.
        Assert.Equal(TimeSpan.FromMinutes(5), options.CacheableFor);
    }

    [Fact]
    public void Is_the_remaining_validity_when_the_window_is_the_larger()
    {
        // A misconfiguration: reusing for 20 of a 30-minute lifetime leaves only 10.
        var options = new R2Options { UrlLifetimeMinutes = 30, UrlCacheMinutes = 20 };

        Assert.Equal(TimeSpan.FromMinutes(10), options.CacheableFor);
    }

    [Fact]
    public void Is_zero_when_reuse_would_outlive_the_signature()
    {
        // Nothing is safe to cache here, and the controller falls back to no-store rather
        // than emitting a max-age that outlives the URL.
        var options = new R2Options { UrlLifetimeMinutes = 5, UrlCacheMinutes = 10 };

        Assert.Equal(TimeSpan.Zero, options.CacheableFor);
    }

    [Fact]
    public void Is_zero_when_reuse_is_switched_off()
    {
        var options = new R2Options { UrlLifetimeMinutes = 30, UrlCacheMinutes = 0 };

        // No reuse means every URL is fresh, so there is nothing stable to cache.
        Assert.Equal(TimeSpan.Zero, options.CacheableFor);
    }
}
