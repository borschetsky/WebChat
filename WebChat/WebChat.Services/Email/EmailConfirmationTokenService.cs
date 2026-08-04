using System;
using System.Security.Cryptography;
using System.Text;

namespace WebChat.Services.Email
{
    /// <summary>A freshly issued token and the value to persist against the user.</summary>
    public readonly struct IssuedToken
    {
        public IssuedToken(string token, string hash)
        {
            Token = token;
            Hash = hash;
        }

        /// <summary>Goes in the confirmation link. Never stored.</summary>
        public string Token { get; }

        /// <summary>Stored on the user. Cannot be turned back into the token.</summary>
        public string Hash { get; }
    }

    /// <summary>
    /// Issues and checks email-confirmation tokens.
    ///
    /// Three properties matter, and each is pinned by a test:
    ///
    /// - The token comes from a cryptographic RNG, 256 bits of it. Guid.NewGuid() is the
    ///   tempting shortcut and the wrong one: it is not a CSPRNG, and its version and variant
    ///   bits are fixed, so it carries well under the 128 bits its size suggests.
    /// - Only a hash is stored. Whoever reads the database still cannot produce a link,
    ///   which is the difference between a database leak and a full account takeover.
    /// - Comparison is constant-time. Comparing hashes leaks less than comparing secrets, but
    ///   the cost of doing it properly is nil and the reasoning about when it is safe to be
    ///   sloppy is exactly what rots as code changes.
    ///
    /// Expiry is checked here rather than at the call site so that no caller can forget it.
    /// </summary>
    public class EmailConfirmationTokenService : IEmailConfirmationTokenService
    {
        private const int TokenBytes = 32; // 256 bits

        private readonly TimeSpan lifetime;

        public EmailConfirmationTokenService(TimeSpan lifetime)
        {
            this.lifetime = lifetime;
        }

        public IssuedToken Issue()
        {
            var raw = RandomNumberGenerator.GetBytes(TokenBytes);
            var token = ToBase64Url(raw);
            return new IssuedToken(token, Hash(token));
        }

        public bool Verify(string token, string storedHash, DateTime? sentAt)
        {
            // A user with nothing pending has no hash and no send time. Treating either as a
            // match would let an empty token confirm an arbitrary account.
            if (string.IsNullOrWhiteSpace(token) || string.IsNullOrWhiteSpace(storedHash))
            {
                return false;
            }

            if (sentAt == null || DateTime.UtcNow - sentAt.Value > this.lifetime)
            {
                return false;
            }

            var candidate = Encoding.UTF8.GetBytes(Hash(token));
            var expected = Encoding.UTF8.GetBytes(storedHash);

            // FixedTimeEquals returns false on a length mismatch rather than throwing, which
            // also covers a stored hash that has been truncated or corrupted.
            return candidate.Length == expected.Length
                   && CryptographicOperations.FixedTimeEquals(candidate, expected);
        }

        private static string Hash(string token)
        {
            var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(token));
            return Convert.ToHexString(bytes);
        }

        /// <summary>
        /// Base64url, so the token survives a query string untouched. Standard base64 would
        /// produce '+' and '/', which some mail clients escape and others do not - a link
        /// that works in one inbox and silently fails in another.
        /// </summary>
        private static string ToBase64Url(byte[] bytes) =>
            Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }
}
