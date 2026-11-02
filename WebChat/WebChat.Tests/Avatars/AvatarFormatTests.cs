using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats;
using SixLabors.ImageSharp.Formats.Bmp;
using SixLabors.ImageSharp.Formats.Gif;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.Formats.Tiff;
using SixLabors.ImageSharp.PixelFormats;
using WebChat.AvatarWriter;
using Xunit;

namespace WebChat.Tests.Avatars;

/// <summary>
/// Which formats an avatar upload may be decoded from.
///
/// **TIFF is refused because ImageSharp 3.1.12's TIFF decoder is where its known memory-safety
/// bugs are** - a heap out-of-bounds write on tiled fax TIFFs (GHSA-v76p-62qx-wwq2) and a
/// non-terminating BigTIFF loop (GHSA-wmxv-xphr-5c9g) - and the patched 3.2.0 cannot be built
/// without a Six Labors license key. An avatar upload is reachable by any signed-in user, so
/// the TIFF decoder must not be reachable from it at all. The NuGet audit suppressions in
/// `Directory.Build.props` are only honest while these tests pass.
/// </summary>
public class AvatarFormatTests
{
    private readonly AvatarImageProcessor processor = new(new AvatarOptions());

    private static IFormFile Encode(IImageEncoder encoder, string fileName)
    {
        using var image = new Image<Rgba32>(4, 4, new Rgba32(200, 40, 40, 255));
        var stream = new MemoryStream();
        image.Save(stream, encoder);
        stream.Position = 0;
        return new FormFile(stream, 0, stream.Length, "file", fileName);
    }

    [Fact]
    public async Task A_tiff_upload_is_rejected()
    {
        var result = await this.processor.Process(Encode(new TiffEncoder(), "photo.tiff"));

        Assert.False(result.Ok);
        Assert.Null(result.Bytes);
    }

    /// <summary>
    /// The magic-byte gate is the first line; this is the second. Even if that gate is ever
    /// widened, the decoder configuration itself cannot read TIFF.
    /// </summary>
    [Fact]
    public void The_decoder_cannot_read_tiff_even_past_the_gate()
    {
        var formats = AvatarImageProcessor.DecoderOptions.Configuration.ImageFormats.ToList();

        Assert.DoesNotContain(formats, f => f is TiffFormat);
        Assert.Equal(4, formats.Count);
    }

    public static TheoryData<IImageEncoder, string> Supported() => new()
    {
        { new JpegEncoder(), "photo.jpg" },
        { new PngEncoder(), "photo.png" },
        { new GifEncoder(), "photo.gif" },
        { new BmpEncoder(), "photo.bmp" },
    };

    [Theory]
    [MemberData(nameof(Supported))]
    public async Task The_supported_formats_are_still_accepted(IImageEncoder encoder, string fileName)
    {
        var result = await this.processor.Process(Encode(encoder, fileName));

        Assert.True(result.Ok, result.Error);
        Assert.NotEmpty(result.Bytes);
    }

    /// <summary>
    /// Metadata is deliberately still decoded: skipping it would also drop the EXIF orientation
    /// flag, and every portrait phone photo would arrive on its side.
    /// </summary>
    [Fact]
    public async Task Exif_orientation_is_still_applied()
    {
        using var image = new Image<Rgba32>(40, 20, new Rgba32(10, 120, 200, 255));
        image.Metadata.ExifProfile = new SixLabors.ImageSharp.Metadata.Profiles.Exif.ExifProfile();
        image.Metadata.ExifProfile.SetValue(SixLabors.ImageSharp.Metadata.Profiles.Exif.ExifTag.Orientation, (ushort)6);
        var stream = new MemoryStream();
        image.Save(stream, new JpegEncoder());
        stream.Position = 0;

        var result = await this.processor.Process(new FormFile(stream, 0, stream.Length, "file", "portrait.jpg"));

        Assert.True(result.Ok, result.Error);
        var info = Image.Identify(result.Bytes);
        Assert.Equal((20, 40), (info.Width, info.Height));
    }

    /// <summary>
    /// The other three ImageSharp 3.1.12 advisories are suppressed because the app never reaches
    /// them: <c>HistogramEqualization</c> (GHSA-j3p4-wp97-rph4), the lazy ICC parser behind
    /// <c>IccProfile.Entries</c> (GHSA-gwg2-r3hj-4w44) and the TIFF CCITT encoders
    /// (GHSA-j9gm-c75j-xc9q, GHSA-jjfr-hcj7-qf5w). This keeps that true: the first production
    /// call to any of them fails here, next to the reason it matters.
    /// </summary>
    [Fact]
    public void Production_code_never_reaches_the_suppressed_imagesharp_paths()
    {
        var root = new DirectoryInfo(System.AppContext.BaseDirectory);
        while (root != null && !File.Exists(Path.Combine(root.FullName, "WebChat.sln")))
        {
            root = root.Parent;
        }
        Assert.NotNull(root);

        string[] forbidden = ["HistogramEqualization", "IccProfile", "TiffEncoder", "SaveAsTiff", "TiffConfigurationModule"];
        var offenders = Directory.EnumerateFiles(root.FullName, "*.cs", SearchOption.AllDirectories)
            .Where(p => !p.Contains($"{Path.DirectorySeparatorChar}WebChat.Tests{Path.DirectorySeparatorChar}")
                        && !p.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}")
                        && !p.Contains($"{Path.DirectorySeparatorChar}bin{Path.DirectorySeparatorChar}"))
            .SelectMany(p => forbidden.Where(f => StripComments(File.ReadAllText(p)).Contains(f)).Select(f => $"{p}: {f}"))
            .ToList();

        Assert.Empty(offenders);
    }

    // Doc comments may name the forbidden APIs to explain why they are forbidden.
    private static string StripComments(string source) =>
        string.Join('\n', source.Split('\n').Where(l => !l.TrimStart().StartsWith("//")));
}
