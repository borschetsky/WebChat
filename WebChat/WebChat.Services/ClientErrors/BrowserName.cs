using System;
using System.Text.RegularExpressions;

namespace WebChat.Services.ClientErrors
{
    /// <summary>
    /// Turns a User-Agent header into "Chrome 141" - a name and a major version, and nothing
    /// else.
    ///
    /// **The full header is deliberately not stored.** It is a fingerprinting surface with a
    /// platform, a build number and often a device model in it, and the only thing the screen
    /// shows is which browsers an issue happens on. Reducing it here means the raw string never
    /// reaches the database at all.
    ///
    /// Hand-rolled rather than a UA-parsing library, and it is worth saying why that is
    /// defensible: this is not routing or feature-gating, it is a label on an admin screen. The
    /// cost of getting one wrong is that a row reads "Chrome 141" for something Chromium-based,
    /// which is what a library trained on a stale database would often say too. A dependency
    /// whose whole value is a regularly-updated table is a poor trade for a caption.
    ///
    /// **Order matters and is the only subtle part**: every one of these lies about the others.
    /// Edge's UA contains "Chrome" and "Safari", Chrome's contains "Safari", and Safari's
    /// contains neither of the first two - so the checks run most-specific first.
    /// </summary>
    public static class BrowserName
    {
        /// <summary>What an unparseable or absent User-Agent becomes.</summary>
        public const string Unknown = "Unknown";

        private static readonly (string Label, string Token)[] Browsers =
        {
            // Before Chrome: Edge's UA ends "Chrome/141... Safari/537.36 Edg/141".
            ("Edge", "Edg"),
            ("Opera", "OPR"),
            ("Samsung Internet", "SamsungBrowser"),
            ("Firefox", "Firefox"),
            ("Chrome", "Chrome"),
            // Last, because Chrome, Edge and Opera all claim to be Safari.
            ("Safari", "Version"),
        };

        public static string From(string userAgent)
        {
            if (string.IsNullOrWhiteSpace(userAgent)) return Unknown;

            foreach (var (label, token) in Browsers)
            {
                var match = Regex.Match(
                    userAgent,
                    Regex.Escape(token) + @"/(\d+)",
                    RegexOptions.None,
                    TimeSpan.FromMilliseconds(100));

                if (!match.Success) continue;

                // "Safari" is only claimed by the Version/ token, and only when the string
                // really is Safari - the browsers above are all matched before this point.
                if (label == "Safari" && !userAgent.Contains("Safari", StringComparison.Ordinal))
                {
                    continue;
                }

                return $"{label} {match.Groups[1].Value}";
            }

            return Unknown;
        }
    }
}
