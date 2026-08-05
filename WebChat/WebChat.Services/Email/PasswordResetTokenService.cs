using System;

namespace WebChat.Services.Email
{
    /// <summary>
    /// Password-reset tokens. Separate from the confirmation service only so the two can hold
    /// different lifetimes and be injected independently - the security properties are
    /// identical and deliberately shared rather than reimplemented.
    /// </summary>
    public interface IPasswordResetTokenService
    {
        IssuedToken Issue();

        bool Verify(string token, string storedHash, DateTime? sentAt);

        string HashFor(string token);
    }

    /// <summary>
    /// The same token mechanism as email confirmation - 256 bits from a CSPRNG, hash-only
    /// storage, constant-time comparison, base64url - with a much shorter default lifetime.
    ///
    /// One hour rather than twenty-four, because a reset link is a live credential for the
    /// account it opens. A confirmation link that lingers in an inbox can only confirm an
    /// address the holder already controls; a reset link that lingers can take the account.
    /// </summary>
    public class PasswordResetTokenService : EmailConfirmationTokenService, IPasswordResetTokenService
    {
        public PasswordResetTokenService(TimeSpan lifetime)
            : base(lifetime)
        {
        }
    }
}
