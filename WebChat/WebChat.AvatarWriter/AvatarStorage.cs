using System;

namespace WebChat.AvatarWriter
{
    /// <summary>
    /// The one place that knows how an avatar object key is shaped, and which keys the
    /// anonymous read path is allowed to hand out.
    ///
    /// Two kinds of object live in the same bucket. A **cropped avatar** is the picture the
    /// user chose to show, and it is served over the anonymous <c>/images/{fileName}</c>
    /// redirect - unguessable, but anyone holding the name can fetch it, which the endpoint's
    /// own comment concedes. An **original** is the whole photo the crop was taken from: it
    /// holds exactly the pixels the user deliberately cropped out, so the same bargain is not
    /// acceptable for it.
    ///
    /// So originals are stored under a distinct prefix and <see cref="IsPubliclyServable"/>
    /// refuses that prefix outright. The privacy of an original does not rest on the read path
    /// happening not to route a slash - it rests on this predicate, which is tested.
    /// </summary>
    public static class AvatarStorage
    {
        /// <summary>
        /// Key prefix for un-cropped originals. Also what an R2 lifecycle rule would scope on
        /// if one is ever wanted - see the research note, which recommends against it.
        /// </summary>
        public const string OriginalPrefix = "originals/";

        /// <summary>A fresh key per stored object, which is what makes a stored image immutable.</summary>
        public static string NewAvatarKey(string extension) => $"{Guid.NewGuid()}.{extension}";

        /// <summary>
        /// A fresh key for an original, under <see cref="OriginalPrefix"/>.
        ///
        /// Fresh per upload for the same reason avatars are: <c>CachingAvatarUrlProvider</c>
        /// memoises by key, so a key whose bytes can change is a stale hit waiting to happen.
        /// </summary>
        public static string NewOriginalKey(string extension) =>
            OriginalPrefix + Guid.NewGuid() + "." + extension;

        /// <summary>True when the key names an original rather than a cropped avatar.</summary>
        public static bool IsOriginalKey(string key)
        {
            if (string.IsNullOrWhiteSpace(key))
            {
                return false;
            }

            return Normalize(key).StartsWith(OriginalPrefix, StringComparison.OrdinalIgnoreCase);
        }

        /// <summary>
        /// May the anonymous <c>/images/{fileName}</c> redirect sign this name?
        ///
        /// Refuses originals, anything carrying a path separator, and **anything carrying a
        /// percent sign at all** - which is the rule that had to be found by driving the
        /// running app rather than reasoned out.
        ///
        /// ASP.NET Core decodes most percent-escapes into a route value but deliberately leaves
        /// <c>%2F</c> encoded, so a request to <c>/images/originals%2F{guid}.jpg</c> arrives
        /// here as that literal string: no slash in it, and it does not start with the prefix.
        /// The first version of this check therefore signed it and answered 302. Nothing was
        /// actually exposed - the SDK escapes the <c>%</c> again, so the presigned URL names a
        /// doubly-encoded key that does not exist and R2 404s - but that is the privacy of an
        /// original resting on two encoders happening to disagree, which is not a property this
        /// app controls.
        ///
        /// A stored key is always <c>{Guid}.{ext}</c>, so a percent sign is never legitimate
        /// here and refusing it outright costs nothing. The unescaped form is checked as well,
        /// so a future encoding this does not anticipate still has to get past the prefix.
        /// </summary>
        public static bool IsPubliclyServable(string fileName)
        {
            if (string.IsNullOrWhiteSpace(fileName))
            {
                return false;
            }

            if (fileName.IndexOf('%') >= 0)
            {
                return false;
            }

            return fileName.IndexOf('/') < 0
                && fileName.IndexOf('\\') < 0
                && !IsOriginalKey(fileName)
                && !IsOriginalKey(Unescape(fileName));
        }

        /// <summary>
        /// Percent-decodes for the purposes of the check above, and returns the input unchanged
        /// if it will not decode. Never used to build a key - only to ask what one could turn
        /// into.
        /// </summary>
        private static string Unescape(string value)
        {
            try
            {
                return Uri.UnescapeDataString(value);
            }
            catch (UriFormatException)
            {
                return value;
            }
        }

        /// <summary>
        /// The part of an original's key after the prefix, or null when the key is not a
        /// well-formed original key. Used by the local-disk store to map a key onto a file
        /// name, so it must refuse anything that could climb out of that directory.
        /// </summary>
        public static string OriginalFileNameOf(string key)
        {
            if (!IsOriginalKey(key))
            {
                return null;
            }

            var name = Normalize(key).Substring(OriginalPrefix.Length);

            if (name.Length == 0
                || name.IndexOf('/') >= 0
                || name.IndexOf('\\') >= 0
                || name.Contains(".."))
            {
                return null;
            }

            return name;
        }

        private static string Normalize(string key) => key.Replace('\\', '/').TrimStart('/');
    }
}
