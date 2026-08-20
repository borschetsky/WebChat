using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using WebChat.AvatarWriter;
using WebChat.Connection;
using WebChat.Controllers;
using WebChat.Hubs;
using WebChat.Hubs.ConnectionMapper;
using WebChat.Models;
using WebChat.Services;
using WebChat.Services.Helpers;

namespace WebChat.Tests.Avatars;

/// <summary>
/// What happens to the objects an avatar change leaves behind, and what "Adjust crop" needs to
/// survive it. Issues #20 and #88, which cannot be tested apart: #88 changes what #20's fix
/// means, because there are now two objects with different lifetimes.
///
/// The rule, in one sentence: **uploading a new photo deletes the previous original and the
/// previous crop; re-cropping deletes the previous crop and keeps the original.** Getting the
/// second half backwards is silent - it degrades "Adjust crop" back into "pick the file again",
/// which no user can report and no other test would notice.
///
/// A real <see cref="UserService"/> over SQLite, because the previous keys have to come back
/// out of a row that was actually written; fakes only for the object stores, where the bytes
/// are irrelevant and the recording is the whole point.
/// </summary>
public class AvatarLifecycleTests : IDisposable
{
    private readonly SqliteConnection connection = new("DataSource=:memory:");
    private readonly WebChatContext ctx;
    private readonly UserService users;
    private readonly RecordingAvatarWriter writer = new();
    private readonly RecordingOriginalStore originals = new();
    private readonly RecordingUrlProvider urls = new();
    private readonly FakeHubContext<ChatHub> hub = new();

    public AvatarLifecycleTests()
    {
        this.connection.Open();
        this.ctx = new WebChatContext(new DbContextOptionsBuilder<WebChatContext>()
            .UseSqlite(this.connection).Options);
        this.ctx.Database.EnsureCreated();

        var mapping = new MappingService();
        this.users = new UserService(
            this.ctx,
            new AuthService("test-only-signing-key-at-least-32-bytes-long", 3600),
            new ThreadService(this.ctx, mapping),
            mapping,
            new ConnectionMapping<string>());
    }

    public void Dispose()
    {
        this.ctx.Dispose();
        this.connection.Dispose();
        GC.SuppressFinalize(this);
    }

    private string AddUser()
    {
        var user = new User
        {
            Id = Guid.NewGuid().ToString(),
            Username = "maya",
            Email = $"{Guid.NewGuid():N}@example.com",
            Password = "hashed",
            Status = AccountStatus.Active,
            CreatedOn = DateTime.UtcNow,
            EmailConfirmed = true,
        };

        this.ctx.User.Add(user);
        this.ctx.SaveChanges();

        return user.Id;
    }

    private AvatarsController ControllerFor(string userId, IFormCollection form)
    {
        var http = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity(
                new[] { new Claim(ClaimTypes.Name, userId) },
                "test")),
        };
        http.Request.Form = form;

        return new AvatarsController(
            new PassThroughImageHandler(this.writer),
            this.users,
            this.writer,
            this.originals,
            this.hub,
            new ConnectionMapping<string>(),
            this.urls,
            new R2Options(),
            NullLogger<AvatarsController>.Instance)
        {
            ControllerContext = new ControllerContext { HttpContext = http },
        };
    }

    private static IFormFile Part(string name, string fileName)
    {
        var bytes = Encoding.ASCII.GetBytes("not really an image, the writer is a fake");
        return new FormFile(new MemoryStream(bytes), 0, bytes.Length, name, fileName)
        {
            Headers = new HeaderDictionary(),
            ContentType = "image/jpeg",
        };
    }

    /// <summary>
    /// A multipart body. Parts are passed in the order they should arrive, because one of the
    /// tests below is about the controller not trusting that order.
    /// </summary>
    private static FormCollection BodyWith(
        (double X, double Y, double W, double H)? crop,
        params IFormFile[] parts)
    {
        var files = new FormFileCollection();
        files.AddRange(parts);

        var fields = new Dictionary<string, Microsoft.Extensions.Primitives.StringValues>();
        if (crop != null)
        {
            var inv = System.Globalization.CultureInfo.InvariantCulture;
            fields["cropX"] = crop.Value.X.ToString(inv);
            fields["cropY"] = crop.Value.Y.ToString(inv);
            fields["cropWidth"] = crop.Value.W.ToString(inv);
            fields["cropHeight"] = crop.Value.H.ToString(inv);
        }

        return new FormCollection(fields, files);
    }

    private Task<IActionResult> Upload(string userId, bool withOriginal, (double, double, double, double)? crop = null)
    {
        var parts = withOriginal
            ? new[] { Part("file", "portrait.jpg"), Part("original", "portrait.jpg") }
            : new[] { Part("file", "portrait.jpg") };

        return this.ControllerFor(userId, BodyWith(crop, parts)).UploadImage();
    }

    private Task<IActionResult> Recrop(string userId, (double, double, double, double)? crop = null) =>
        this.ControllerFor(userId, BodyWith(crop, Part("file", "portrait.jpg"))).RecropImage();

    private User Row(string userId) => this.ctx.User.AsNoTracking().Single(u => u.Id == userId);

    // ---------------------------------------------------------------- #20

    /// <summary>
    /// **A reproduction of issue #20.** Before this change nothing ever deleted the object a
    /// user had just stopped pointing at, so every avatar change leaked one object forever.
    /// </summary>
    [Fact]
    public async Task Replacing_a_photo_deletes_the_crop_it_replaced()
    {
        var userId = this.AddUser();

        await this.Upload(userId, withOriginal: false);
        var first = this.Row(userId).AvatarFileName;

        await this.Upload(userId, withOriginal: false);

        Assert.Equal(new[] { first }, this.writer.Deleted);
        Assert.NotEqual(first, this.Row(userId).AvatarFileName);
    }

    /// <summary>
    /// The first upload has nothing to delete. Worth pinning separately, because the obvious
    /// wrong shape - delete unconditionally - would ask the store to remove a null key on
    /// every first upload and bury the real deletes in noise.
    /// </summary>
    [Fact]
    public async Task A_first_upload_deletes_nothing()
    {
        var userId = this.AddUser();

        await this.Upload(userId, withOriginal: true);

        Assert.Empty(this.writer.Deleted);
        Assert.Empty(this.originals.Deleted);
    }

    /// <summary>
    /// #88 doubles the leak, so the fix has to cover both objects: a new photo makes the old
    /// original meaningless too.
    /// </summary>
    [Fact]
    public async Task Replacing_a_photo_deletes_the_previous_original_as_well()
    {
        var userId = this.AddUser();

        await this.Upload(userId, withOriginal: true);
        var firstOriginal = this.Row(userId).AvatarOriginalFileName;

        await this.Upload(userId, withOriginal: true);

        Assert.Equal(new[] { firstOriginal }, this.originals.Deleted);
        Assert.NotEqual(firstOriginal, this.Row(userId).AvatarOriginalFileName);
    }

    /// <summary>
    /// The half of the rule that is silent when wrong. Re-cropping must surrender the previous
    /// square and keep the original, or "Adjust crop" works exactly once per upload and then
    /// disappears - with nothing in any log to say why.
    /// </summary>
    [Fact]
    public async Task Re_cropping_deletes_the_previous_crop_and_keeps_the_original()
    {
        var userId = this.AddUser();

        await this.Upload(userId, withOriginal: true);
        var original = this.Row(userId).AvatarOriginalFileName;
        var firstCrop = this.Row(userId).AvatarFileName;

        await this.Recrop(userId);

        Assert.Equal(new[] { firstCrop }, this.writer.Deleted);
        Assert.Empty(this.originals.Deleted);
        Assert.Equal(original, this.Row(userId).AvatarOriginalFileName);
    }

    /// <summary>
    /// Two adjustments in a row. The single-adjustment test above would still pass against an
    /// implementation that cleared the column *after* reading it, so this is the one that says
    /// the original is genuinely still there for the next time.
    /// </summary>
    [Fact]
    public async Task An_original_survives_being_re_cropped_twice()
    {
        var userId = this.AddUser();

        await this.Upload(userId, withOriginal: true);
        var original = this.Row(userId).AvatarOriginalFileName;

        await this.Recrop(userId);
        await this.Recrop(userId);

        Assert.Empty(this.originals.Deleted);
        Assert.Equal(original, this.Row(userId).AvatarOriginalFileName);
    }

    /// <summary>
    /// Every derived crop is a **new** key. The one way to get #88 wrong that nobody would
    /// see: CachingAvatarUrlProvider memoises a presigned URL for 30 minutes and the redirect
    /// is served max-age=300, so re-rendering into a stable per-user key serves the old
    /// picture from two caches at once - and most reliably to the person who just re-cropped,
    /// because their own browser holds it.
    /// </summary>
    [Fact]
    public async Task Every_re_crop_writes_a_fresh_key()
    {
        var userId = this.AddUser();

        await this.Upload(userId, withOriginal: true);
        var keys = new List<string> { this.Row(userId).AvatarFileName };

        await this.Recrop(userId);
        keys.Add(this.Row(userId).AvatarFileName);

        await this.Recrop(userId);
        keys.Add(this.Row(userId).AvatarFileName);

        Assert.Equal(3, keys.Distinct().Count());
    }

    /// <summary>
    /// The delete runs after the write is committed and must never be able to undo it. A
    /// failing cleanup is a leak; a throwing cleanup that reaches the caller turns a
    /// successful upload into an error the user cannot act on and will retry - producing
    /// another orphan.
    /// </summary>
    [Fact]
    public async Task A_delete_that_throws_does_not_fail_the_upload()
    {
        var userId = this.AddUser();
        await this.Upload(userId, withOriginal: false);
        var stored = this.Row(userId).AvatarFileName;

        this.writer.DeletesThrow = true;
        var result = await this.Upload(userId, withOriginal: false);

        Assert.IsType<OkObjectResult>(result);
        Assert.NotEqual(stored, this.Row(userId).AvatarFileName);
    }

    [Fact]
    public async Task A_delete_that_merely_fails_does_not_fail_the_upload()
    {
        var userId = this.AddUser();
        await this.Upload(userId, withOriginal: false);

        this.writer.DeletesFail = true;

        Assert.IsType<OkObjectResult>(await this.Upload(userId, withOriginal: false));
    }

    // ---------------------------------------------------------------- #88, the original

    [Fact]
    public async Task Uploading_a_photo_stores_the_original_it_was_cropped_from()
    {
        var userId = this.AddUser();

        await this.Upload(userId, withOriginal: true);

        var stored = this.Row(userId).AvatarOriginalFileName;
        Assert.Equal(this.originals.Saved.Single(), stored);
        Assert.True(AvatarStorage.IsOriginalKey(stored));
    }

    /// <summary>
    /// Decision 4: an account with no stored original must not be given one by treating its
    /// current avatar as the source. Those pixels are already gone - "adjusting" inside them
    /// could only ever zoom further into a 256 px square.
    /// </summary>
    [Fact]
    public async Task An_upload_without_an_original_leaves_none_stored()
    {
        var userId = this.AddUser();

        await this.Upload(userId, withOriginal: false);

        var row = this.Row(userId);
        Assert.Null(row.AvatarOriginalFileName);
        Assert.NotNull(row.AvatarFileName);
    }

    /// <summary>
    /// A new photo with no original attached clears the stored one rather than keeping it. The
    /// alternative is worse than losing the feature: "Adjust crop" would re-open a photo the
    /// user replaced, and save a crop of it as their avatar.
    /// </summary>
    [Fact]
    public async Task A_new_photo_without_an_original_clears_the_one_that_no_longer_matches()
    {
        var userId = this.AddUser();
        await this.Upload(userId, withOriginal: true);
        var stale = this.Row(userId).AvatarOriginalFileName;

        await this.Upload(userId, withOriginal: false);

        Assert.Null(this.Row(userId).AvatarOriginalFileName);
        Assert.Equal(new[] { stale }, this.originals.Deleted);
    }

    /// <summary>
    /// Storing the original is best-effort in the other direction too: it is the backup, and
    /// the avatar is what the user asked for. Failing the upload over it would throw away a
    /// perfectly good photo.
    /// </summary>
    [Fact]
    public async Task A_failed_original_still_leaves_the_avatar_uploaded()
    {
        var userId = this.AddUser();
        this.originals.SavesFail = true;

        var result = await this.Upload(userId, withOriginal: true);

        Assert.IsType<OkObjectResult>(result);
        Assert.NotNull(this.Row(userId).AvatarFileName);
        Assert.Null(this.Row(userId).AvatarOriginalFileName);
    }

    /// <summary>
    /// Re-cropping something that was never stored is a client bug, and it must not write a
    /// crop rectangle describing an image that does not exist.
    /// </summary>
    [Fact]
    public async Task Re_cropping_without_a_stored_original_is_refused()
    {
        var userId = this.AddUser();
        await this.Upload(userId, withOriginal: false);
        var avatar = this.Row(userId).AvatarFileName;

        var result = await this.Recrop(userId, (10, 10, 50, 50));

        Assert.IsType<BadRequestObjectResult>(result);
        Assert.Equal(avatar, this.Row(userId).AvatarFileName);
        Assert.Empty(this.writer.Deleted);
    }

    // ---------------------------------------------------------------- #88, the crop rectangle

    [Fact]
    public async Task The_crop_is_stored_as_the_percentages_it_arrived_as()
    {
        var userId = this.AddUser();

        await this.Upload(userId, withOriginal: true, crop: (12.5, 25, 50, 50));

        var row = this.Row(userId);
        Assert.Equal(12.5, row.AvatarCropX);
        Assert.Equal(25, row.AvatarCropY);
        Assert.Equal(50, row.AvatarCropWidth);
        Assert.Equal(50, row.AvatarCropHeight);
    }

    [Fact]
    public async Task Re_cropping_replaces_the_stored_rectangle()
    {
        var userId = this.AddUser();
        await this.Upload(userId, withOriginal: true, crop: (0, 0, 100, 100));

        await this.Recrop(userId, (10, 20, 30, 30));

        var row = this.Row(userId);
        Assert.Equal(10, row.AvatarCropX);
        Assert.Equal(30, row.AvatarCropWidth);
    }

    /// <summary>
    /// A crop is polish; the avatar is not. An unusable rectangle stores nothing and the
    /// upload still succeeds - the cropper then opens on the whole photo, which is a fine
    /// outcome, where a 400 would have thrown the photo away.
    /// </summary>
    [Fact]
    public async Task An_upload_with_no_crop_fields_still_succeeds()
    {
        var userId = this.AddUser();

        Assert.IsType<OkObjectResult>(await this.Upload(userId, withOriginal: true));
        Assert.Null(this.Row(userId).AvatarCropX);
    }

    /// <summary>
    /// A new photo clears the previous rectangle even when the new upload carries none.
    /// Percentages measured against a different image are not merely stale, they are wrong.
    /// </summary>
    [Fact]
    public async Task A_new_photo_clears_a_crop_it_did_not_replace()
    {
        var userId = this.AddUser();
        await this.Upload(userId, withOriginal: true, crop: (10, 10, 40, 40));

        await this.Upload(userId, withOriginal: true);

        Assert.Null(this.Row(userId).AvatarCropX);
        Assert.Null(this.Row(userId).AvatarCropHeight);
    }

    // ---------------------------------------------------------------- #88, the privacy decision

    /// <summary>
    /// **The guard the owner's decision exists for.** <c>GetImage</c> is
    /// <c>[AllowAnonymous]</c> and signs whatever key it is handed; an original holds the
    /// pixels the user deliberately cropped out, so it must refuse the prefix outright.
    ///
    /// The assertion that matters is the second one: not "the response was a 404" but "no URL
    /// was ever minted". A presigned URL is a capability that outlives the request that
    /// produced it, so a handler that signs first and then decides not to redirect has already
    /// lost.
    /// </summary>
    [Theory]
    [InlineData("originals/abc.jpg")]
    [InlineData("ORIGINALS/abc.jpg")]
    [InlineData("originals\\abc.jpg")]
    public void The_anonymous_image_path_refuses_an_original(string key)
    {
        var controller = this.ControllerFor(this.AddUser(), BodyWith(null));

        Assert.IsType<NotFoundResult>(controller.GetImage(key));
        Assert.Empty(this.urls.Signed);
    }

    [Fact]
    public void The_anonymous_image_path_still_serves_an_ordinary_avatar()
    {
        // The other half of the same decision, so the guard cannot be "refuse everything".
        var controller = this.ControllerFor(this.AddUser(), BodyWith(null));

        var result = Assert.IsType<RedirectResult>(controller.GetImage("abc.jpg"));

        Assert.Contains("abc.jpg", result.Url);
        Assert.Equal(new[] { "abc.jpg" }, this.urls.Signed);
    }

    /// <summary>
    /// The authenticated door. The key is never a parameter - it is resolved from the caller's
    /// own row - so there is nothing for a caller to substitute.
    /// </summary>
    [Fact]
    public async Task The_owner_can_read_their_own_original()
    {
        var userId = this.AddUser();
        await this.Upload(userId, withOriginal: true);

        var result = await this.ControllerFor(userId, BodyWith(null)).GetOriginal();

        var file = Assert.IsType<FileContentResult>(result);
        Assert.Equal("image/jpeg", file.ContentType);
        Assert.NotEmpty(file.FileContents);
    }

    /// <summary>
    /// Another signed-in user gets their own answer, not the uploader's - which for someone
    /// with no photo is 404, and never the bytes. The store must not even be asked for a key
    /// that is not the caller's.
    /// </summary>
    [Fact]
    public async Task Another_user_cannot_read_someone_elses_original()
    {
        var owner = this.AddUser();
        var stranger = this.AddUser();
        await this.Upload(owner, withOriginal: true);
        var ownersKey = this.Row(owner).AvatarOriginalFileName;

        var result = await this.ControllerFor(stranger, BodyWith(null)).GetOriginal();

        Assert.IsType<NotFoundResult>(result);
        Assert.DoesNotContain(ownersKey, this.originals.Read_);
    }

    [Fact]
    public async Task A_user_with_no_original_gets_a_404_rather_than_an_error()
    {
        var userId = this.AddUser();
        await this.Upload(userId, withOriginal: false);

        Assert.IsType<NotFoundResult>(await this.ControllerFor(userId, BodyWith(null)).GetOriginal());
    }

    /// <summary>
    /// The endpoint's URL is stable per user while the bytes behind it are not, which is the
    /// exact shape docs/ctx/2026-08-09-stable-avatar-urls.md says must not be cached.
    /// </summary>
    [Fact]
    public async Task The_original_is_served_uncacheable()
    {
        var userId = this.AddUser();
        await this.Upload(userId, withOriginal: true);
        var controller = this.ControllerFor(userId, BodyWith(null));

        await controller.GetOriginal();

        Assert.Equal("private, no-store", controller.Response.Headers.CacheControl.ToString());
    }

    // ---------------------------------------------------------------- the wire

    /// <summary>
    /// Ordering in a multipart body is the sender's choice, so reading Files[0] would happily
    /// process the *original* as the avatar - storing the un-cropped photo as the visible one
    /// and the crop as the private backup, silently reversing the whole feature.
    /// </summary>
    [Fact]
    public async Task The_cropped_square_is_taken_by_part_name_not_by_position()
    {
        var userId = this.AddUser();
        var body = BodyWith(null, Part("original", "portrait.jpg"), Part("file", "portrait.jpg"));

        await this.ControllerFor(userId, body).UploadImage();

        // The original arrived first. If position decided, the writer would have stored it and
        // the original store would have been handed the crop.
        Assert.Single(this.originals.Saved);
        Assert.Equal("avatar-1.jpg", this.Row(userId).AvatarFileName);
    }

    [Fact]
    public async Task Both_paths_broadcast_the_new_file_name()
    {
        var userId = this.AddUser();

        await this.Upload(userId, withOriginal: true);
        await this.Recrop(userId);

        Assert.Equal(2, this.hub.Sends.Count);
        Assert.All(this.hub.Sends, s => Assert.Equal("ReciveAvatar", s.Method));
    }
}
