using WebChat.AvatarWriter.Interface;

namespace WebChat.AvatarWriter
{
    /// <summary>
    /// Null object for the local-disk setup, where avatars live in wwwroot/images and the
    /// static-file middleware serves them directly - there is no URL to sign.
    ///
    /// Registering this rather than leaving <see cref="IAvatarUrlProvider"/> unregistered keeps
    /// AvatarsController's dependency non-optional, so its construction does not depend on
    /// ActivatorUtilities filling in a default for a service the container cannot resolve.
    /// </summary>
    public class LocalAvatarUrlProvider : IAvatarUrlProvider
    {
        public string GetReadUrl(string fileName) => null;
    }
}
