using System;

namespace WebChat.Services.Email
{
    /// <summary>
    /// Invitation tokens. Separate from the confirmation and reset services only so the three
    /// can hold different lifetimes and be injected independently - the security properties
    /// are identical and deliberately shared rather than reimplemented.
    /// </summary>
    public interface IInvitationTokenService
    {
        IssuedToken Issue();

        bool Verify(string token, string storedHash, DateTime? sentAt);

        string HashFor(string token);
    }

    /// <summary>
    /// The same mechanism again - 256 bits from a CSPRNG, hash-only storage, constant-time
    /// comparison, base64url - with by far the longest lifetime of the three: 30 days.
    ///
    /// **That length is defensible only because of what the token grants.** A reset link is
    /// a live credential for an account and lasts an hour; a confirmation link proves an
    /// address the holder already controls and lasts a day. An invitation grants *workspace
    /// membership* to whoever opens it - real, but not account control - and 30 days is what
    /// makes it usable by someone who is on leave when it arrives.
    ///
    /// The compensations are what earn it, and none of them is optional: single-use
    /// redemption, revocation the redemption path checks, an audit entry naming who actually
    /// redeemed, and a resend that *rotates* rather than extending the same secret's life.
    /// </summary>
    public class InvitationTokenService : EmailConfirmationTokenService, IInvitationTokenService
    {
        public InvitationTokenService(TimeSpan lifetime)
            : base(lifetime)
        {
        }
    }
}
