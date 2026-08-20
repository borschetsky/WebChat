using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.SignalR;
using WebChat.AvatarWriter.Interface;
using WebChat.Handler;

namespace WebChat.Tests.Avatars;

/// <summary>
/// Stores whatever it is handed under a fresh key, and records what was asked of it.
///
/// A fake rather than the real writer because the property under test is *which keys stop
/// being referenced and what happens to them* - the bytes are irrelevant, and a real writer
/// would drag in ImageSharp, a bucket or a directory to prove nothing extra.
/// </summary>
public sealed class RecordingAvatarWriter : IAvatarWriter
{
    private int written;

    public List<string> Deleted { get; } = new();

    /// <summary>Set to make every delete fail the way a network blip does.</summary>
    public bool DeletesFail { get; set; }

    /// <summary>Set to make every delete throw, which is the case that must not reach a caller.</summary>
    public bool DeletesThrow { get; set; }

    public Task<AvatarUploadResult> UploadImage(IFormFile file) =>
        Task.FromResult(AvatarUploadResult.Stored($"avatar-{++this.written}.jpg"));

    public Task<bool> DeleteImage(string fileName)
    {
        this.Deleted.Add(fileName);

        if (this.DeletesThrow)
        {
            throw new InvalidOperationException("R2 said no.");
        }

        return Task.FromResult(!this.DeletesFail);
    }
}

/// <summary>Records saves, reads and deletes of un-cropped originals.</summary>
public sealed class RecordingOriginalStore : IAvatarOriginalStore
{
    private int written;

    public List<string> Saved { get; } = new();

    public List<string> Deleted { get; } = new();

    public List<string> Read_ { get; } = new();

    /// <summary>Set to make storing an original fail, which must not fail the avatar upload.</summary>
    public bool SavesFail { get; set; }

    public Dictionary<string, byte[]> Content { get; } = new();

    public Task<AvatarUploadResult> Save(IFormFile file)
    {
        if (this.SavesFail)
        {
            return Task.FromResult(AvatarUploadResult.Failed("Invalid image file"));
        }

        var key = $"originals/original-{++this.written}.jpg";
        this.Saved.Add(key);
        this.Content[key] = new byte[] { 1, 2, 3, 4 };

        return Task.FromResult(AvatarUploadResult.Stored(key));
    }

    public Task<AvatarOriginalContent> Read(string key)
    {
        this.Read_.Add(key);
        return Task.FromResult(this.Content.TryGetValue(key, out var bytes)
            ? new AvatarOriginalContent(bytes, "image/jpeg")
            : null!);
    }

    public Task<bool> Delete(string key)
    {
        this.Deleted.Add(key);
        return Task.FromResult(true);
    }
}

/// <summary>Hands back the cropped file the writer stored, exactly as ImageHandler does.</summary>
public sealed class PassThroughImageHandler : IImageHandler
{
    private readonly IAvatarWriter writer;

    public PassThroughImageHandler(IAvatarWriter writer) => this.writer = writer;

    public Task<AvatarUploadResult> UploadImage(IFormFile file) => this.writer.UploadImage(file);
}

/// <summary>
/// A signer that records every key it was asked to sign.
///
/// The recording is the point. "An original is not publicly servable" is not really a claim
/// about the status code - it is a claim that the anonymous path never mints a URL for one,
/// because a URL is a capability that outlives the request.
/// </summary>
public sealed class RecordingUrlProvider : IAvatarUrlProvider
{
    public List<string> Signed { get; } = new();

    public string GetReadUrl(string fileName)
    {
        this.Signed.Add(fileName);
        return $"https://r2.example/{fileName}?sig=x";
    }
}

/// <summary>
/// The narrowest <see cref="IHubContext{THub}"/> that lets a controller broadcast.
///
/// Only <c>Clients.All</c> is implemented; everything else throws, so a future change that
/// starts addressing individuals fails loudly here rather than quietly broadcasting.
/// <c>SendAsync</c> is an extension method, so the member a fake has to implement - and an
/// assertion has to read - is <c>SendCoreAsync</c>.
/// </summary>
public sealed class FakeHubContext<THub> : IHubContext<THub>
    where THub : Hub
{
    public List<(string Method, object?[] Args)> Sends { get; } = new();

    public IHubClients Clients => new FakeClients(this.Sends);

    public IGroupManager Groups => throw new NotImplementedException();

    private sealed class FakeClients : IHubClients
    {
        private readonly List<(string, object?[])> sends;

        public FakeClients(List<(string, object?[])> sends) => this.sends = sends;

        public IClientProxy All => new FakeProxy(this.sends);

        public IClientProxy AllExcept(IReadOnlyList<string> excludedConnectionIds) => throw new NotImplementedException();

        public IClientProxy Client(string connectionId) => throw new NotImplementedException();

        public IClientProxy Clients(IReadOnlyList<string> connectionIds) => throw new NotImplementedException();

        public IClientProxy Group(string groupName) => throw new NotImplementedException();

        public IClientProxy GroupExcept(string groupName, IReadOnlyList<string> excludedConnectionIds) => throw new NotImplementedException();

        public IClientProxy Groups(IReadOnlyList<string> groupNames) => throw new NotImplementedException();

        public IClientProxy User(string userId) => throw new NotImplementedException();

        public IClientProxy Users(IReadOnlyList<string> userIds) => throw new NotImplementedException();
    }

    private sealed class FakeProxy : IClientProxy
    {
        private readonly List<(string, object?[])> sends;

        public FakeProxy(List<(string, object?[])> sends) => this.sends = sends;

        public Task SendCoreAsync(string method, object?[] args, CancellationToken cancellationToken = default)
        {
            this.sends.Add((method, args));
            return Task.CompletedTask;
        }
    }
}
