using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using WebChat.Connection;
using WebChat.Hubs.ConnectionMapper;
using WebChat.Models;
using WebChat.Models.ViewModels;
using WebChat.Services;
using WebChat.Services.Helpers;

namespace WebChat.Tests.Avatars;

/// <summary>
/// <see cref="UserService"/>'s own half of #88: what the two avatar writes return, and what
/// <c>getprofile</c> then tells the client about whether "Adjust crop" is possible.
///
/// Separate from the controller tests because the controller passes a literal null for the
/// original it is keeping - belt and braces - which means the *service's* contract is
/// unreachable from there. This is where "SetAvatarCrop surrenders nothing" is actually
/// pinned, and it is the half that is silent when wrong.
///
/// The profile projection is here for the reason CLAUDE.md gives about adapters: a field the
/// server does not project is a feature that works over curl and not in the app.
/// </summary>
public class AvatarProfileProjectionTests : IDisposable
{
    private readonly SqliteConnection connection = new("DataSource=:memory:");
    private readonly WebChatContext ctx;
    private readonly UserService users;

    public AvatarProfileProjectionTests()
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

    private static AvatarCropViewModel Crop(double x, double y, double w, double h) =>
        AvatarCropViewModel.Sanitized(x, y, w, h);

    [Fact]
    public void Replacing_a_photo_surrenders_both_previous_objects()
    {
        var id = this.AddUser();
        this.users.SetAvatar(id, "a1.jpg", "originals/o1.jpg", Crop(0, 0, 100, 100));

        var update = this.users.SetAvatar(id, "a2.jpg", "originals/o2.jpg", Crop(0, 0, 100, 100));

        Assert.True(update.Ok);
        Assert.Equal("a1.jpg", update.PreviousAvatarFileName);
        Assert.Equal("originals/o1.jpg", update.PreviousOriginalFileName);
    }

    /// <summary>
    /// The asymmetry, stated at the layer that decides it. Returning the original here would
    /// have the caller delete it, and "Adjust crop" would work exactly once - which is the
    /// failure mode with no error message anywhere.
    /// </summary>
    [Fact]
    public void Re_cropping_surrenders_the_crop_and_nothing_else()
    {
        var id = this.AddUser();
        this.users.SetAvatar(id, "a1.jpg", "originals/o1.jpg", Crop(0, 0, 100, 100));

        var update = this.users.SetAvatarCrop(id, "a2.jpg", Crop(10, 10, 40, 40));

        Assert.Equal("a1.jpg", update.PreviousAvatarFileName);
        Assert.Null(update.PreviousOriginalFileName);
        Assert.Equal("originals/o1.jpg", this.users.GetAvatarOriginalFileName(id));
    }

    /// <summary>
    /// A token whose user is gone is routine here - it happens whenever the database is
    /// rebuilt while a browser holds a session. The old <c>AddAvatar</c> dereferenced null and
    /// threw a NullReferenceException out of the service; the controller now answers 401.
    /// </summary>
    [Fact]
    public void An_unknown_user_is_reported_rather_than_dereferenced()
    {
        var update = this.users.SetAvatar("nobody", "a.jpg", null, null);

        Assert.False(update.Ok);
        Assert.Null(this.users.GetAvatarOriginalFileName("nobody"));
    }

    [Fact]
    public void A_profile_reports_no_original_until_one_is_stored()
    {
        var id = this.AddUser();
        this.users.SetAvatar(id, "a1.jpg", null, null);

        var profile = this.users.GetUserProfile(id);

        // Decision 4: an account predating #88 has no original, so the client must be told the
        // control cannot work rather than being left to discover it by clicking.
        Assert.False(profile.HasOriginalPhoto);
        Assert.Null(profile.AvatarCrop);
    }

    [Fact]
    public void A_profile_reports_the_original_and_the_crop_once_both_exist()
    {
        var id = this.AddUser();
        this.users.SetAvatar(id, "a1.jpg", "originals/o1.jpg", Crop(12.5, 25, 50, 50));

        var profile = this.users.GetUserProfile(id);

        Assert.True(profile.HasOriginalPhoto);
        Assert.Equal(12.5, profile.AvatarCrop!.X);
        Assert.Equal(25, profile.AvatarCrop.Y);
        Assert.Equal(50, profile.AvatarCrop.Width);
        Assert.Equal(50, profile.AvatarCrop.Height);
    }

    /// <summary>
    /// The key itself never leaves the server. A profile payload is cached, logged and put in
    /// a Redux store; the name of a private object has no business in any of them, and the
    /// client never needs it because the read endpoint resolves it from the caller's own row.
    /// </summary>
    [Fact]
    public void A_profile_never_carries_the_originals_key()
    {
        var id = this.AddUser();
        this.users.SetAvatar(id, "a1.jpg", "originals/secret.jpg", null);

        var json = Newtonsoft.Json.JsonConvert.SerializeObject(this.users.GetUserProfile(id));

        Assert.DoesNotContain("secret", json);
        Assert.DoesNotContain("originals/", json);
    }

    [Fact]
    public void A_partial_rectangle_is_not_a_rectangle()
    {
        // Three of four columns cannot restore a crop, and defaulting the fourth would restore
        // a crop that quietly differs from the one the avatar was cut with.
        Assert.Null(AvatarCropViewModel.From(1, 2, 3, null));
        Assert.Null(AvatarCropViewModel.From(null, 2, 3, 4));
    }

    [Theory]
    [InlineData(double.NaN, 0, 50, 50)]
    [InlineData(0, double.PositiveInfinity, 50, 50)]
    [InlineData(0, 0, 0, 50)]
    [InlineData(0, 0, 50, -1)]
    public void Nonsense_stores_no_crop_rather_than_failing_the_upload(double x, double y, double w, double h)
    {
        Assert.Null(AvatarCropViewModel.Sanitized(x, y, w, h));
    }

    [Fact]
    public void A_rectangle_slightly_out_of_range_is_clamped_rather_than_discarded()
    {
        var crop = AvatarCropViewModel.Sanitized(-0.4, 100.6, 100.2, 50);

        Assert.Equal(0, crop!.X);
        Assert.Equal(100, crop.Y);
        Assert.Equal(100, crop.Width);
    }
}
