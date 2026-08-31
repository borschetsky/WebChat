using System.Linq;
using WebChat.Models;

namespace WebChat.Services
{
    /// <summary>
    /// Lookup queries shared by <see cref="UserService"/> and its tests.
    ///
    /// They live here, taking an <see cref="IQueryable{T}"/>, so a test can exercise the real
    /// query against a real database rather than a copy of it written in the test file. A test
    /// that reimplements the expression it is checking proves only that the author can write
    /// the same line twice.
    /// </summary>
    public static class UserQueries
    {
        /// <summary>
        /// Finds a user by email address or username, case-insensitively.
        ///
        /// Email is tried first because it is the stricter field: nothing prevents someone
        /// registering the username `someone@example.com`, and an address typed at sign-in
        /// must resolve to whoever owns that mailbox rather than to whoever claimed it as a
        /// display name.
        ///
        /// Case-insensitive because PostgreSQL compares strings exactly, so the previous
        /// `u.Email == email` locked out anyone whose password manager had capitalised their
        /// address. ToLower translates to the database's own lower(), so the comparison stays
        /// server-side rather than pulling the table into memory.
        /// </summary>
        public static User ByEmailOrUsername(IQueryable<User> users, string identifier)
        {
            if (string.IsNullOrWhiteSpace(identifier))
            {
                return null;
            }

            var normalised = identifier.Trim().ToLower();

            return users.FirstOrDefault(u => u.Email.ToLower() == normalised)
                   ?? users.FirstOrDefault(u => u.Username.ToLower() == normalised);
        }

        /// <summary>
        /// Finds a user by email address only, case-insensitively.
        ///
        /// Kept separate from <see cref="ByEmailOrUsername"/> on purpose. Password reset and
        /// resend-confirmation must not accept a username: both send to a mailbox, and
        /// matching a username there would let someone discover that a username exists by
        /// watching which requests are accepted.
        /// </summary>
        public static User ByEmail(IQueryable<User> users, string email)
        {
            if (string.IsNullOrWhiteSpace(email))
            {
                return null;
            }

            var normalised = email.Trim().ToLower();
            return users.FirstOrDefault(u => u.Email.ToLower() == normalised);
        }

        /// <summary>
        /// True when no account already uses this email, ignoring case. Without the case fold
        /// both `User@x.com` and `user@x.com` can be registered, and sign-in then resolves to
        /// whichever the database returns first.
        ///
        /// <paramref name="exceptUserId"/> is what makes this usable from an *update* as well
        /// as from register (#100). Without it, saving a profile whose address has not changed
        /// collides with the caller's own row and is refused - a security fix that breaks the
        /// settings drawer for everybody who presses Save twice.
        /// </summary>
        public static bool IsEmailAvailable(IQueryable<User> users, string email, string exceptUserId = null)
        {
            if (string.IsNullOrWhiteSpace(email))
            {
                return false;
            }

            var normalised = email.Trim().ToLower();
            return !Others(users, exceptUserId).Any(u => u.Email.ToLower() == normalised);
        }

        /// <summary>
        /// True when no account already uses this username, ignoring case. See
        /// <see cref="IsEmailAvailable"/> for <paramref name="exceptUserId"/>.
        /// </summary>
        public static bool IsUsernameAvailable(IQueryable<User> users, string username, string exceptUserId = null)
        {
            if (string.IsNullOrWhiteSpace(username))
            {
                return false;
            }

            var normalised = username.Trim().ToLower();
            return !Others(users, exceptUserId).Any(u => u.Username.ToLower() == normalised);
        }

        /// <summary>
        /// Everyone but one row, or everyone when no id is given.
        ///
        /// Branched in C# rather than folded into the predicate as
        /// <c>(exceptUserId == null || u.Id != exceptUserId)</c>, so what reaches the database
        /// is the same single-term filter register has always issued and no provider has to be
        /// trusted to fold a constant away.
        ///
        /// Deliberately does **not** exclude soft-deleted rows. Every lookup here counts them -
        /// <see cref="ByEmailOrUsername"/> would resolve a sign-in to one - so a uniqueness
        /// check that skipped them would hand out an identifier that is still answering.
        /// </summary>
        private static IQueryable<User> Others(IQueryable<User> users, string exceptUserId) =>
            string.IsNullOrEmpty(exceptUserId) ? users : users.Where(u => u.Id != exceptUserId);
    }
}
