using System;
using System.ComponentModel.DataAnnotations;

namespace WebChat.Models
{
    /// <summary>
    /// One way of signing in to one account, issued by an external identity provider -
    /// Microsoft Entra today, any OpenID Connect issuer tomorrow. The same shape as ASP.NET
    /// Identity's <c>AspNetUserLogins</c>, for the same reason: an account can carry several
    /// of these, and adding a provider is a configuration change rather than a migration.
    ///
    /// **The local password is not a row here.** It still lives on <see cref="User.Password"/>,
    /// so turning on an external provider changes nothing for an account that never uses one.
    ///
    /// The key is (<see cref="Provider"/>, <see cref="Subject"/>), and that pair being unique is
    /// what makes a new user's first sign-in race-safe: two concurrent first requests both try
    /// to insert, one loses on the key, and the loser re-reads instead of creating a second
    /// account.
    /// </summary>
    public class UserLogin
    {
        /// <summary>
        /// The configured provider name - <c>Auth:Oidc:n:Name</c>, e.g. <c>entra</c>. Not the
        /// issuer URL: an issuer can move (a tenant renamed, a custom domain added) while the
        /// accounts it vouches for stay the same people.
        /// </summary>
        [Required]
        [MaxLength(50)]
        public string Provider { get; set; }

        /// <summary>
        /// The provider's stable id for the person - <c>oid</c> for Entra, <c>sub</c> for most
        /// others; which claim is read is per-provider configuration. Never the email: that can
        /// be changed by its owner, and keying on it would let a renamed address walk into
        /// somebody else's account.
        /// </summary>
        [Required]
        [MaxLength(128)]
        public string Subject { get; set; }

        [Required]
        public string UserId { get; set; }

        public User User { get; set; }

        /// <summary>UTC, like every stored timestamp - see the note on <c>BaseEntity</c>.</summary>
        public DateTime CreatedAtUtc { get; set; }
    }
}
