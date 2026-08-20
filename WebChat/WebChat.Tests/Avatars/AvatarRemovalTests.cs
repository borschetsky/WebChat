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
/// Remove photo, and the Undo behind it - issue #89.
///
/// **The design decision these tests encode**: the handoff specifies Remove with no confirm
/// dialog and a snackbar whose Undo restores the photo *and* its crop. That rules out deleting
/// anything on the button press, because this server cannot re-derive a crop - cropping has
/// been client-side since #84 - so an Undo that had thrown the square away could only ask for
/// the photo again. Removal is therefore one nullable column, <c>AvatarRemovedAt</c>, and
/// everything below is either "the marker hides the photo", "clearing it brings back exactly
/// what was there", or "the awkward orders these two can arrive in".
///
/// Where a removal *becomes* visible to other people is <c>RemovedAvatarReadPathTests</c>;
/// this file is about the writes, the objects and the endpoints.
/// </summary>
public class AvatarRemovalTests : IDisposable
{
    private readonly SqliteConnection connection = new("DataSource=:memory:");
    private readonly WebChatContext ctx;
    private readonly UserService users;
    private readonly RecordingAvatarWriter writer = new();
    private readonly RecordingOriginalStore originals = new();
    private readonly RecordingUrlProvider urls = new();
    private readonly FakeHubContext<ChatHub> hub = new();

    public AvatarRemovalTests()
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

    private AvatarsController ControllerFor(string userId, IFormCollection? form = null)
    {
        var http = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity(
                new[] { new Claim(ClaimTypes.Name, userId) },
                "test")),
        };
        http.Request.Form = form ?? new FormCollection(new Dictionary<string, Microsoft.Extensions.Primitives.StringValues>());

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

    /// <summary>The state Remove is pressed from: a photo, its original, and a saved crop.</summary>
    private Task<IActionResult> UploadPhoto(string userId, (double, double, double, double)? crop = null) =>
        this.ControllerFor(
                userId,
                BodyWith(crop ?? (12.5, 25, 50, 50), Part("file", "portrait.jpg"), Part("original", "portrait.jpg")))
            .UploadImage();

    private Task<IActionResult> Remove(string userId) => this.ControllerFor(userId).RemoveImage();

    private Task<IActionResult> Restore(string userId) => this.ControllerFor(userId).RestoreImage();

    private User Row(string userId) => this.ctx.User.AsNoTracking().Single(u => u.Id == userId);

    private static T Body<T>(IActionResult result, string property)
    {
        var value = Assert.IsType<OkObjectResult>(result).Value;
        return (T)value!.GetType().GetProperty(property)!.GetValue(value)!;
    }

    // ---------------------------------------------------------------- the removal itself

    /// <summary>
    /// The two halves of a soft delete, asserted together because either alone is a different
    /// feature: the user stops having a photo, and **nothing is deleted**.
    /// </summary>
    [Fact]
    public async Task Removing_a_photo_hides_it_and_deletes_nothing()
    {
        var userId = this.AddUser();
        await this.UploadPhoto(userId);
        var avatar = this.Row(userId).AvatarFileName;
        var original = this.Row(userId).AvatarOriginalFileName;

        await this.Remove(userId);

        Assert.Null(this.users.GetUserProfile(userId).AvatarFileName);
        Assert.Empty(this.writer.Deleted);
        Assert.Empty(this.originals.Deleted);

        // Still in the row, which is what Undo restores from - and what nothing in the wire
        // contract ever mentions again until it does.
        var row = this.Row(userId);
        Assert.Equal(avatar, row.AvatarFileName);
        Assert.Equal(original, row.AvatarOriginalFileName);
        Assert.NotNull(row.AvatarRemovedAt);
    }

    /// <summary>
    /// The crop survives too, and it is the half that is silent when wrong: a removal that
    /// cleared the four columns would still look perfect - the photo goes, Undo brings it
    /// back - and the user would find their careful framing replaced by the whole photo.
    /// </summary>
    [Fact]
    public async Task Removing_a_photo_keeps_the_crop_rectangle()
    {
        var userId = this.AddUser();
        await this.UploadPhoto(userId, (12.5, 25, 50, 50));

        await this.Remove(userId);

        var row = this.Row(userId);
        Assert.Equal(12.5, row.AvatarCropX);
        Assert.Equal(25, row.AvatarCropY);
        Assert.Equal(50, row.AvatarCropWidth);
        Assert.Equal(50, row.AvatarCropHeight);
    }

    /// <summary>
    /// The stored timestamp is UTC, because the real column is `timestamp with time zone` and
    /// Npgsql *throws* on a Local or Unspecified Kind - a `DateTime.Now` here would be an
    /// insert-time failure in production and nothing at all in this suite.
    ///
    /// Read from the **tracked** entity on purpose: SQLite has no timestamptz, so a value
    /// round-tripped through it comes back Unspecified whatever was written, and asserting on
    /// <c>Row()</c> would test the test's own database. The second assertion is what survives
    /// that - a local timestamp would be off by the machine's offset almost everywhere.
    /// </summary>
    [Fact]
    public async Task The_removal_is_stamped_in_utc()
    {
        var userId = this.AddUser();
        await this.UploadPhoto(userId);

        await this.Remove(userId);

        var stamped = this.ctx.User.Single(u => u.Id == userId).AvatarRemovedAt!.Value;
        Assert.Equal(DateTimeKind.Utc, stamped.Kind);
        Assert.True((DateTime.UtcNow - stamped).Duration() < TimeSpan.FromMinutes(1));
    }

    // ---------------------------------------------------------------- Undo

    /// <summary>
    /// **What the handoff actually asks for**: Undo restores the photo *and* its crop. Exactly,
    /// not approximately - the same object key and the same four numbers, because neither was
    /// ever touched. This is the whole argument for a marker over a delete.
    /// </summary>
    [Fact]
    public async Task Undo_restores_the_same_photo_and_the_same_crop()
    {
        var userId = this.AddUser();
        await this.UploadPhoto(userId, (12.5, 25, 50, 50));
        var avatar = this.Row(userId).AvatarFileName;
        await this.Remove(userId);

        await this.Restore(userId);

        var profile = this.users.GetUserProfile(userId);
        Assert.Equal(avatar, profile.AvatarFileName);
        Assert.True(profile.HasOriginalPhoto);
        Assert.Equal(12.5, profile.AvatarCrop!.X);
        Assert.Equal(50, profile.AvatarCrop.Width);
        Assert.Null(this.Row(userId).AvatarRemovedAt);
    }

    /// <summary>
    /// **The security property, and the reason a marker beats "the client remembers and posts
    /// it back".** A restore that accepted a file name would let anyone point their avatar at
    /// any object in the bucket - including another user's <c>originals/</c> key, which is the
    /// one thing #88 built an owner-checked endpoint to protect.
    ///
    /// Two assertions, because only the second one survives a refactor: the request body names
    /// a stranger's objects and is ignored, and the action **takes no parameters at all**, so
    /// there is no model for a future binder to start filling in.
    /// </summary>
    [Fact]
    public async Task Undo_ignores_anything_the_client_says_about_which_photo_to_restore()
    {
        var mine = this.AddUser();
        var theirs = this.AddUser();
        await this.UploadPhoto(mine);
        await this.UploadPhoto(theirs);
        var myAvatar = this.Row(mine).AvatarFileName;
        var theirOriginal = this.Row(theirs).AvatarOriginalFileName;
        await this.Remove(mine);

        var forged = new FormCollection(new Dictionary<string, Microsoft.Extensions.Primitives.StringValues>
        {
            ["avatarFileName"] = this.Row(theirs).AvatarFileName,
            ["fileName"] = theirOriginal,
            ["file"] = theirOriginal,
            ["userId"] = theirs,
        });

        var result = await this.ControllerFor(mine, forged).RestoreImage();

        Assert.Equal(myAvatar, Body<string>(result, "avatarFileName"));
        Assert.Equal(myAvatar, this.Row(mine).AvatarFileName);

        Assert.Empty(typeof(AvatarsController).GetMethod(nameof(AvatarsController.RestoreImage))!.GetParameters());
    }

    // ---------------------------------------------------------------- doing it twice

    /// <summary>
    /// Removing twice is a success and keeps the *first* timestamp. Re-stamping would quietly
    /// extend retention every time a client repeated itself, which is the wrong direction for
    /// a marker whose whole job is to say when the object stopped being wanted.
    /// </summary>
    [Fact]
    public async Task Removing_twice_is_not_an_error_and_does_not_move_the_timestamp()
    {
        var userId = this.AddUser();
        await this.UploadPhoto(userId);

        await this.Remove(userId);
        var first = this.Row(userId).AvatarRemovedAt;

        var second = await this.Remove(userId);

        Assert.IsType<OkObjectResult>(second);
        Assert.Equal(first, this.Row(userId).AvatarRemovedAt);
        Assert.Empty(this.writer.Deleted);
    }

    /// <summary>
    /// Removing when there was never a photo. Not an error - the state asked for already holds
    /// - and no marker either, because a marker with nothing behind it would give Undo
    /// something to clear and nothing to show for it.
    /// </summary>
    [Fact]
    public async Task Removing_a_photo_that_never_existed_is_not_an_error()
    {
        var userId = this.AddUser();

        var result = await this.Remove(userId);

        Assert.IsType<OkObjectResult>(result);
        Assert.Null(this.Row(userId).AvatarRemovedAt);
        Assert.False(Body<bool>(result, "restorable"));
    }

    /// <summary>
    /// The flag the snackbar's Undo is drawn from. True only when something was actually put
    /// away, so the button is offered only when pressing it will do something.
    /// </summary>
    [Fact]
    public async Task A_real_removal_reports_that_it_can_be_undone()
    {
        var userId = this.AddUser();
        await this.UploadPhoto(userId);

        Assert.True(Body<bool>(await this.Remove(userId), "restorable"));
    }

    /// <summary>
    /// Undo pressed twice - a double click, or a second tab. The end state asked for already
    /// holds, so it is a success rather than a message about a thing that worked.
    /// </summary>
    [Fact]
    public async Task Undo_pressed_again_after_it_worked_is_still_a_success()
    {
        var userId = this.AddUser();
        await this.UploadPhoto(userId);
        var avatar = this.Row(userId).AvatarFileName;
        await this.Remove(userId);
        await this.Restore(userId);

        var again = await this.Restore(userId);

        Assert.Equal(avatar, Body<string>(again, "avatarFileName"));
    }

    /// <summary>
    /// **Undo after the window, in its worst shape**: nothing was removed and there is no photo
    /// at all. It must not be a 500 and it must not claim success - a restored photo the user
    /// then cannot see is worse than being told plainly there is nothing to restore.
    /// </summary>
    [Fact]
    public async Task Undo_with_nothing_to_restore_is_refused_in_words_not_a_500()
    {
        var userId = this.AddUser();

        var result = await this.Restore(userId);

        var conflict = Assert.IsType<ConflictObjectResult>(result);
        Assert.Contains("restore", conflict.Value!.ToString(), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Both_endpoints_answer_401_for_a_token_whose_user_is_gone()
    {
        Assert.IsType<UnauthorizedObjectResult>(await this.Remove("nobody"));
        Assert.IsType<UnauthorizedObjectResult>(await this.Restore("nobody"));
    }

    // ---------------------------------------------------------------- what a removal blocks

    /// <summary>
    /// "Adjust crop" is refused while a removal is pending, and this is not defensive coding:
    /// a re-crop writes a new avatar file name, so allowing it would make Adjust a second,
    /// undocumented way to un-remove a photo - with a *different* crop, which is exactly what
    /// Undo promises not to do.
    /// </summary>
    [Fact]
    public async Task Adjusting_the_crop_is_refused_while_the_photo_is_removed()
    {
        var userId = this.AddUser();
        await this.UploadPhoto(userId);
        var avatar = this.Row(userId).AvatarFileName;
        await this.Remove(userId);

        var result = await this.ControllerFor(userId, BodyWith((0, 0, 100, 100), Part("file", "portrait.jpg")))
            .RecropImage();

        Assert.IsType<BadRequestObjectResult>(result);
        Assert.Equal(avatar, this.Row(userId).AvatarFileName);
    }

    /// <summary>
    /// The same rule one layer down: the owner-only original is not readable while the photo is
    /// removed. The bytes are still in the bucket - that is what Undo relies on - but the API
    /// says what the user's own screen says.
    /// </summary>
    [Fact]
    public async Task The_stored_original_is_not_served_while_the_photo_is_removed()
    {
        var userId = this.AddUser();
        await this.UploadPhoto(userId);
        await this.Remove(userId);

        Assert.IsType<NotFoundResult>(await this.ControllerFor(userId).GetOriginal());
    }

    // ---------------------------------------------------------------- issue #20's half

    /// <summary>
    /// **How the retained objects eventually go away.** A new photo surrenders the previous
    /// crop and the previous original exactly as it always did, whether or not a removal was
    /// pending - so a user who removes and later uploads leaves nothing behind, and the only
    /// orphan a removal can create is "removed and never uploaded again". There is deliberately
    /// no sweep here; that is #20's.
    /// </summary>
    [Fact]
    public async Task Uploading_after_a_removal_clears_the_marker_and_disposes_of_what_was_retained()
    {
        var userId = this.AddUser();
        await this.UploadPhoto(userId);
        var retainedAvatar = this.Row(userId).AvatarFileName;
        var retainedOriginal = this.Row(userId).AvatarOriginalFileName;
        await this.Remove(userId);

        await this.UploadPhoto(userId);

        Assert.Null(this.Row(userId).AvatarRemovedAt);
        Assert.Equal(new[] { retainedAvatar }, this.writer.Deleted);
        Assert.Equal(new[] { retainedOriginal }, this.originals.Deleted);
        Assert.NotNull(this.users.GetUserProfile(userId).AvatarFileName);
    }

    // ---------------------------------------------------------------- the wire

    /// <summary>
    /// A removal is announced the way an upload is, with a null file name, so other people's
    /// screens drop the face instead of holding it until their next refetch. The null is the
    /// part worth pinning: the client reads <c>body</c> as "a string or an ObjectResult's
    /// value", and null is what makes it patch back to initials.
    /// </summary>
    [Fact]
    public async Task Removing_and_restoring_both_announce_the_new_state()
    {
        var userId = this.AddUser();
        await this.UploadPhoto(userId);
        var avatar = this.Row(userId).AvatarFileName;
        this.hub.Sends.Clear();

        await this.Remove(userId);
        await this.Restore(userId);

        Assert.Equal(2, this.hub.Sends.Count);
        Assert.All(this.hub.Sends, s => Assert.Equal("ReciveAvatar", s.Method));

        Assert.Null(BroadcastFileName(this.hub.Sends[0]));
        Assert.Equal(avatar, BroadcastFileName(this.hub.Sends[1]));
    }

    private static string? BroadcastFileName((string Method, object?[] Args) send)
    {
        var payload = send.Args[0]!;
        return (string?)payload.GetType().GetProperty("body")!.GetValue(payload);
    }

    /// <summary>
    /// **The cache question, answered rather than assumed** (#89's third question, and the
    /// shape of #88's stale-crop bug).
    ///
    /// A removal writes no new object and no new key, so nothing memoised can turn stale: the
    /// avatar's presigned URL is cached per *file name* for 30 minutes and the redirect is
    /// served max-age=300, and neither has anything to say about a user who no longer has that
    /// file name. What does remain true is asserted here - the retained object is still
    /// servable to anyone holding its key, because the anonymous read path signs any publicly
    /// servable name it is handed and the object is deliberately still in the bucket. That is
    /// what makes Undo instant, and it is bounded by the key being an unguessable Guid that no
    /// read path now hands out.
    /// </summary>
    [Fact]
    public async Task A_removed_photo_is_still_fetchable_by_key_which_is_what_makes_undo_instant()
    {
        var userId = this.AddUser();
        await this.UploadPhoto(userId);
        var retained = this.Row(userId).AvatarFileName;

        await this.Remove(userId);

        // No read path offers this name any more - see RemovedAvatarReadPathTests - but the
        // object is still there and still signable, which is the trade the marker makes.
        var redirect = Assert.IsType<RedirectResult>(this.ControllerFor(userId).GetImage(retained));
        Assert.Contains(retained, redirect.Url);
    }
}
