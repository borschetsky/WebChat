using System.Collections.Generic;
using Microsoft.EntityFrameworkCore;

namespace WebChat.Connection
{
    /// <summary>
    /// The database-level half of #100: two unique indexes that make "one account per username,
    /// one per address" an invariant rather than a convention.
    ///
    /// **They are functional indexes on <c>lower()</c>, not plain unique indexes, and the
    /// reason is that the index and the lookup must agree.** Every lookup in
    /// <c>UserQueries</c> - sign-in, password reset, and both availability checks - compares on
    /// <c>lower()</c>. A plain unique index would be *looser* than those lookups: it would
    /// happily store <c>Victim94</c> beside <c>victim94</c>, which sign-in already treats as
    /// one identifier and which reads as one person in every member list the app draws. An
    /// index stricter than the lookup would be the opposite fault - refusing saves nobody
    /// expects. <c>citext</c> would express the same rule, but it needs an extension and it
    /// changes the comparison semantics of the columns everywhere; <c>lower()</c> is the
    /// smaller, reversible choice and it is already what the LINQ emits.
    ///
    /// **Deliberately not partial.** Neither a soft-deleted row nor an unconfirmed one is
    /// excluded, because none of the lookups exclude them either - a name released by an index
    /// filter would still resolve a sign-in.
    ///
    /// A null username is not covered, and that is correct in both engines: PostgreSQL and
    /// SQLite both treat NULLs in a unique index as distinct. Registration refuses an empty
    /// username, so the only nulls are legacy rows.
    ///
    /// **These strings are frozen.** <c>20260831…_AddUserUniqueIndexes</c> executes them, and a
    /// migration that has run somewhere is history: changing an index means a new migration and
    /// a new constant, not an edit here. They live in one place so a test can exercise the DDL
    /// that actually ships rather than a retyped copy of it - <c>EnsureCreated</c> knows nothing
    /// about them, since EF Core cannot express a functional index in the model.
    /// </summary>
    public static class UserUniqueIndexes
    {
        public const string UsernameIndexName = "IX_User_Username_Lower";

        public const string EmailIndexName = "IX_User_Email_Lower";

        public const string CreateUsernameIndex =
            @"CREATE UNIQUE INDEX ""IX_User_Username_Lower"" ON ""User"" (lower(""Username""));";

        public const string CreateEmailIndex =
            @"CREATE UNIQUE INDEX ""IX_User_Email_Lower"" ON ""User"" (lower(""Email""));";

        public const string DropUsernameIndex = @"DROP INDEX IF EXISTS ""IX_User_Username_Lower"";";

        public const string DropEmailIndex = @"DROP INDEX IF EXISTS ""IX_User_Email_Lower"";";

        /// <summary>
        /// Creates both indexes on an already-built schema.
        ///
        /// For tests. The suite builds its SQLite schema with <c>EnsureCreated</c>, which works
        /// from the EF model and therefore cannot know about an index EF cannot express - so
        /// without this the test database would permit exactly the duplicates production
        /// refuses. Throws whatever the provider throws when the data already violates the
        /// index, which is the case worth exercising.
        /// </summary>
        public static void ApplyTo(DbContext context)
        {
            foreach (var sql in new List<string> { CreateUsernameIndex, CreateEmailIndex })
            {
                context.Database.ExecuteSqlRaw(sql);
            }
        }
    }
}
