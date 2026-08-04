using System;

namespace WebChat.Services.Email
{
    public interface IEmailConfirmationTokenService
    {
        /// <summary>Mints a token for a confirmation link, with the hash to persist.</summary>
        IssuedToken Issue();

        /// <summary>
        /// True when <paramref name="token"/> matches <paramref name="storedHash"/> and was
        /// issued recently enough. Returns false rather than throwing for any malformed
        /// input - the token arrives from a public URL, so a throw here is a 500 on an
        /// endpoint anyone can call.
        /// </summary>
        bool Verify(string token, string storedHash, DateTime? sentAt);

        /// <summary>
        /// The stored form of a token, so a confirmation request can find its user with an
        /// indexed lookup instead of reading every row and comparing. Finding the candidate
        /// this way does not replace <see cref="Verify"/>: that still checks expiry and does
        /// the constant-time comparison.
        /// </summary>
        string HashFor(string token);
    }
}
