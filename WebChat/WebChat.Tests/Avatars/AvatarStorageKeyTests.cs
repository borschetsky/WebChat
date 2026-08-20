using WebChat.AvatarWriter;

namespace WebChat.Tests.Avatars;

/// <summary>
/// The rule that decides whether the anonymous read path may serve an object.
///
/// This is the enforcement point for the decision that originals are owner-only (#88). An
/// original holds exactly the pixels a user chose to crop away, and
/// <c>AvatarsController.GetImage</c> is <c>[AllowAnonymous]</c> and signs any key it is handed
/// - its own comment concedes "anyone holding one can fetch that avatar". That bargain is
/// acceptable for the picture someone chose to show and not for the one they chose to hide.
///
/// A guard rather than a reproduction: originals did not exist before this change, so nothing
/// here was ever leaked. Its value is that the predicate is the *only* thing keeping them off
/// that path, so it is tested rather than reasoned about.
/// </summary>
public class AvatarStorageKeyTests
{
    [Fact]
    public void An_avatar_key_is_a_bare_guid_and_extension()
    {
        var key = AvatarStorage.NewAvatarKey("jpg");

        Assert.EndsWith(".jpg", key);
        Assert.DoesNotContain("/", key);
        Assert.False(AvatarStorage.IsOriginalKey(key));
    }

    [Fact]
    public void An_original_key_carries_the_private_prefix()
    {
        var key = AvatarStorage.NewOriginalKey("jpg");

        Assert.StartsWith("originals/", key);
        Assert.True(AvatarStorage.IsOriginalKey(key));
    }

    [Fact]
    public void Every_key_is_fresh_even_for_the_same_extension()
    {
        // The invariant CachingAvatarUrlProvider's 30-minute memoisation rests on: the bytes
        // behind a name never change. A stable per-user key would serve the old picture from
        // the URL cache and the browser cache at once - invisibly to the person who just
        // re-cropped. See docs/ctx/2026-08-09-stable-avatar-urls.md.
        Assert.NotEqual(AvatarStorage.NewAvatarKey("jpg"), AvatarStorage.NewAvatarKey("jpg"));
        Assert.NotEqual(AvatarStorage.NewOriginalKey("jpg"), AvatarStorage.NewOriginalKey("jpg"));
    }

    [Fact]
    public void A_plain_avatar_name_is_publicly_servable()
    {
        Assert.True(AvatarStorage.IsPubliclyServable("2f1c9e0a-0000-4000-8000-000000000001.jpg"));
    }

    [Theory]
    [InlineData("originals/2f1c9e0a-0000-4000-8000-000000000001.jpg")]
    [InlineData("ORIGINALS/2f1c9e0a-0000-4000-8000-000000000001.jpg")]
    [InlineData("/originals/2f1c9e0a-0000-4000-8000-000000000001.jpg")]
    [InlineData("originals\\2f1c9e0a-0000-4000-8000-000000000001.jpg")]
    // **Found by driving the running stack, not by any of the above.** ASP.NET Core decodes
    // most percent-escapes into a route value but deliberately leaves `%2F` encoded, so this
    // is the exact string the action's `fileName` parameter receives for a request to
    // `/images/originals%2F....jpg` - and the first version of this guard, which looked for a
    // literal '/', signed it and answered 302. R2 then 404s, because the SDK escapes the `%`
    // again and the doubly-encoded key names nothing - so the original stayed unreachable by
    // luck, from a layer that is not this app's to depend on.
    [InlineData("originals%2F2f1c9e0a-0000-4000-8000-000000000001.jpg")]
    [InlineData("ORIGINALS%2f2f1c9e0a-0000-4000-8000-000000000001.jpg")]
    [InlineData("originals%5C2f1c9e0a-0000-4000-8000-000000000001.jpg")]
    public void No_spelling_of_an_original_key_is_publicly_servable(string key)
    {
        // Case, separator and escaping variants are all listed because the check is a string
        // comparison: a case-sensitive one would pass every other test here while letting
        // "ORIGINALS/..." through on a bucket that treats keys case-sensitively, and one that
        // reads the route value literally lets the percent-escaped spelling straight past.
        Assert.False(AvatarStorage.IsPubliclyServable(key));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    [InlineData("../appsettings.json")]
    [InlineData("a/b.jpg")]
    public void Nothing_carrying_a_separator_or_nothing_at_all_is_servable(string? fileName)
    {
        Assert.False(AvatarStorage.IsPubliclyServable(fileName!));
    }

    [Fact]
    public void An_original_key_maps_onto_a_bare_file_name()
    {
        Assert.Equal("photo.jpg", AvatarStorage.OriginalFileNameOf("originals/photo.jpg"));
    }

    [Theory]
    [InlineData("originals/")]
    [InlineData("originals/../../appsettings.json")]
    [InlineData("originals/sub/photo.jpg")]
    [InlineData("photo.jpg")]
    public void A_key_that_could_climb_out_of_the_originals_directory_maps_to_nothing(string key)
    {
        // The local-disk store turns this into a path. Anything that is not a single bare file
        // name has to come back null, or a crafted key reads or deletes an arbitrary file.
        Assert.Null(AvatarStorage.OriginalFileNameOf(key));
    }
}
