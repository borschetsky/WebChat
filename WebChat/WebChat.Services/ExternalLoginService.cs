using Microsoft.EntityFrameworkCore;
using System;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using WebChat.Connection;
using WebChat.Models;

namespace WebChat.Services
{
    /// <summary>What a validated external token says about the person presenting it.</summary>
    /// <param name="Provider">Configured provider name, e.g. <c>entra</c>.</param>
    /// <param name="Subject">The provider's stable id for the person (<c>oid</c>, <c>sub</c>).</param>
    /// <param name="Email">The address in the token, or null when it carries none.</param>
    /// <param name="EmailVerified">
    /// Whether the provider has proved the person controls <paramref name="Email"/>. Linking to
    /// an existing account by email is safe only when this is true.
    /// </param>
    /// <param name="DisplayName">Used only to suggest a username for a new account.</param>
    public sealed record ExternalIdentity(
        string Provider, string Subject, string Email, bool EmailVerified, string DisplayName);

    /// <summary>The account an external identity resolved to, or why it did not.</summary>
    public sealed record ExternalLoginResult(string UserId, string Role, string Status, string Error)
    {
        public bool Succeeded => this.Error == null;

        public static ExternalLoginResult Fail(string error) => new(null, null, null, error);

        public static ExternalLoginResult For(User user) => new(user.Id, user.Role, user.Status, null);
    }

    public interface IExternalLoginService
    {
        /// <summary>
        /// Maps an external identity onto a local account, linking or creating one on first
        /// sign-in. Does not decide whether the account may sign in - the caller checks
        /// <see cref="ExternalLoginResult.Status"/>, so a blocked account is refused by the
        /// same rule whichever provider it arrived through.
        /// </summary>
        Task<ExternalLoginResult> ResolveAsync(ExternalIdentity identity, CancellationToken cancellationToken = default);
    }

    /// <summary>
    /// Provider-agnostic: nothing here knows it is talking to Entra. Every provider configured
    /// under <c>Auth:Oidc</c> arrives as the same <see cref="ExternalIdentity"/>.
    ///
    /// Resolution order, and why each step is where it is:
    ///
    /// 1. **An existing <see cref="UserLogin"/>** wins outright. After the first sign-in the
    ///    email in the token is never consulted again, so a person who changes their address
    ///    at the provider keeps their account, and somebody who acquires their old address
    ///    does not inherit it.
    /// 2. **An account with the same email** is linked - only when the provider vouches for the
    ///    address. Otherwise anyone able to register that address at a careless provider could
    ///    sign in as its owner here.
    /// 3. **Otherwise a new account** is created, as a plain active member.
    /// </summary>
    public sealed class ExternalLoginService : IExternalLoginService
    {
        public const string ErrorNoEmail = "external_login_no_email";
        public const string ErrorEmailNotVerified = "external_login_email_not_verified";
        public const string ErrorAlreadyLinked = "external_login_already_linked";
        public const string ErrorAccountGone = "external_login_account_gone";

        private const int MaxUsernameLength = 60;

        private readonly WebChatContext db;

        public ExternalLoginService(WebChatContext db) => this.db = db ?? throw new ArgumentNullException(nameof(db));

        public async Task<ExternalLoginResult> ResolveAsync(
            ExternalIdentity identity, CancellationToken cancellationToken = default)
        {
            ArgumentNullException.ThrowIfNull(identity);

            var linked = await this.FindLinkedAsync(identity, cancellationToken);
            if (linked != null)
            {
                return linked;
            }

            try
            {
                return await this.LinkOrCreateAsync(identity, cancellationToken);
            }
            catch (DbUpdateException)
            {
                // Two first requests from the same new person raced, and the other one won
                // the (Provider, Subject) key. Its account is the account.
                this.db.ChangeTracker.Clear();
                return await this.FindLinkedAsync(identity, cancellationToken) ?? throw new InvalidOperationException(
                    "Saving an external login failed, and no login exists for it afterwards.");
            }
        }

        private async Task<ExternalLoginResult> FindLinkedAsync(ExternalIdentity identity, CancellationToken ct)
        {
            var userId = await this.db.UserLogin
                .Where(l => l.Provider == identity.Provider && l.Subject == identity.Subject)
                .Select(l => l.UserId)
                .FirstOrDefaultAsync(ct);

            if (userId == null)
            {
                return null;
            }

            var user = await this.db.User
                .Where(u => u.Id == userId)
                .Select(u => new User { Id = u.Id, Role = u.Role, Status = u.Status })
                .FirstOrDefaultAsync(ct);

            return user == null ? ExternalLoginResult.Fail(ErrorAccountGone) : ExternalLoginResult.For(user);
        }

        private async Task<ExternalLoginResult> LinkOrCreateAsync(ExternalIdentity identity, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(identity.Email))
            {
                // Email is NOT NULL and is how people find each other in the directory, so an
                // account cannot exist without one. For Entra this means the API registration
                // is missing the `email` optional claim on its access token.
                return ExternalLoginResult.Fail(ErrorNoEmail);
            }

            var email = identity.Email.Trim();
            var existing = UserQueries.ByEmail(this.db.User, email);

            if (existing != null)
            {
                if (!identity.EmailVerified)
                {
                    return ExternalLoginResult.Fail(ErrorEmailNotVerified);
                }

                // One identity per provider per account. A second, different subject from the
                // same provider claiming this address means the provider has re-issued the
                // address to someone else - the person already linked keeps the account.
                var alreadyLinked = await this.db.UserLogin
                    .AnyAsync(l => l.UserId == existing.Id && l.Provider == identity.Provider, ct);
                if (alreadyLinked)
                {
                    return ExternalLoginResult.Fail(ErrorAlreadyLinked);
                }

                if (!existing.EmailConfirmed)
                {
                    // An unconfirmed registration proves nothing about who made it. The person
                    // in front of us has just proved the address is theirs, so the row is
                    // theirs - and whatever password the registrant chose must stop working,
                    // or confirming the address here would hand them the account.
                    existing.Password = AuthService.NoLocalPassword;
                    existing.EmailConfirmed = true;
                    existing.EmailConfirmationTokenHash = null;
                    existing.EmailConfirmationSentAt = null;
                    existing.PasswordResetTokenHash = null;
                    existing.SecurityStamp = Guid.NewGuid().ToString();
                }

                this.AddLogin(identity, existing.Id);
                await this.db.SaveChangesAsync(ct);
                return ExternalLoginResult.For(existing);
            }

            var user = new User
            {
                Id = Guid.NewGuid().ToString(),
                Username = this.AvailableUsername(identity.DisplayName, email),
                Email = email,
                Password = AuthService.NoLocalPassword,

                // Explicit for the same reasons as UserService.CreateUser: nobody arrives in a
                // privileged role, and a missing status must never default to anything.
                Role = WorkspaceRole.Member,
                Status = AccountStatus.Active,

                // Only as confirmed as the provider says it is. BootstrapAdmins promotes
                // confirmed addresses only, so this is also what stops an unvouched address
                // from inheriting a configured owner role.
                EmailConfirmed = identity.EmailVerified,
                SecurityStamp = Guid.NewGuid().ToString(),
                CreatedOn = DateTime.UtcNow,
            };

            this.db.User.Add(user);
            this.AddLogin(identity, user.Id);
            await this.db.SaveChangesAsync(ct);
            return ExternalLoginResult.For(user);
        }

        private void AddLogin(ExternalIdentity identity, string userId) =>
            this.db.UserLogin.Add(new UserLogin
            {
                Provider = identity.Provider,
                Subject = identity.Subject,
                UserId = userId,
                CreatedAtUtc = DateTime.UtcNow,
            });

        /// <summary>
        /// A username is required and unique (case-insensitively, by index), but an external
        /// sign-in has no form to ask for one. Derived from the display name, else the email's
        /// local part, and suffixed until free. The person can change it in settings.
        /// </summary>
        private string AvailableUsername(string displayName, string email)
        {
            var stem = Sanitise(displayName);
            if (stem.Length < 3)
            {
                stem = Sanitise(email.Split('@')[0]);
            }
            if (stem.Length < 3)
            {
                stem = "user";
            }

            stem = stem.Length > MaxUsernameLength - 8 ? stem[..(MaxUsernameLength - 8)] : stem;

            if (UserQueries.IsUsernameAvailable(this.db.User, stem))
            {
                return stem;
            }

            for (var n = 2; n < 50; n++)
            {
                var candidate = $"{stem}{n}";
                if (UserQueries.IsUsernameAvailable(this.db.User, candidate))
                {
                    return candidate;
                }
            }

            // Fifty people called the same thing. Stop counting; a random tail is unique enough
            // and the unique index catches the rest.
            return $"{stem}{Guid.NewGuid():N}"[..MaxUsernameLength];
        }

        private static string Sanitise(string value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return string.Empty;
            }

            var builder = new StringBuilder();
            foreach (var c in value.Trim())
            {
                if (char.IsLetterOrDigit(c) || c is '.' or '_' or '-')
                {
                    builder.Append(char.ToLowerInvariant(c));
                }
                else if (char.IsWhiteSpace(c) && builder.Length > 0 && builder[^1] != '.')
                {
                    builder.Append('.');
                }
            }

            return builder.ToString().Trim('.');
        }
    }
}
