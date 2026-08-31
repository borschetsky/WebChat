using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WebChat.Connection.Migrations
{
    /// <summary>
    /// #100 - one account per username, one per email address, enforced by the database.
    ///
    /// Empty of model changes on purpose: EF Core cannot express a functional index, and these
    /// have to be functional. <see cref="UserUniqueIndexes"/> holds the DDL and the reasoning;
    /// it is also what a test executes, so the statements below are the ones under test rather
    /// than a retyped copy.
    ///
    /// **The preflight is the point of this file.** Adding a unique index to a table that
    /// already violates it fails - and <c>PrepDB.MigrateDatabaseAsync</c> runs in
    /// <c>Program.Main</c> *before the host starts*, so a failure here is not a degraded
    /// deployment, it is an app that will not boot. Three options were on the table:
    ///
    /// 1. Let the index creation fail on its own. PostgreSQL does name the duplicated value
    ///    (`Key (lower(email))=(…) is duplicated`), but only the *first* one, never the rows
    ///    holding it, and never how many more are behind it.
    /// 2. Repair the data - rename or merge the losers automatically. Rejected outright: the
    ///    two rows in a collision are two people, an automatic rename picks one of them to
    ///    silently rebrand, and a merge would move messages between accounts. Neither is a
    ///    decision a migration gets to take at four in the morning.
    /// 3. **Refuse, and say exactly what is in the way.** Chosen.
    ///
    /// So this raises before touching the schema, listing every colliding identifier with the
    /// ids of the accounts holding it and a query that prints the rest. The migration is
    /// transactional, so nothing is applied and <c>__EFMigrationsHistory</c> is untouched: fix
    /// the data and deploy again. On App Platform the failing instance never becomes healthy
    /// and the previous release keeps serving, which is the right way round - a live app with a
    /// duplicate username beats no app at all.
    /// </summary>
    public partial class AddUserUniqueIndexes : Migration
    {
        /// <summary>
        /// PostgreSQL-specific, and deliberately so - it is the only engine this runs against.
        /// The suite's SQLite databases are built by <c>EnsureCreated</c> and never see a
        /// migration.
        ///
        /// **The list of offending rows is in the message, not in <c>DETAIL</c>, and that is
        /// not a style choice.** The first version put it in <c>DETAIL</c>, where it belongs by
        /// PostgreSQL convention, and a run against a real database with duplicates came back
        /// saying `Detail redacted as it may contain sensitive data. Specify 'Include Error
        /// Detail' in the connection string` - Npgsql strips it by default, and the connection
        /// string this app deploys with does not opt in. The whole point of the preflight is
        /// that the operator learns *which rows*; a diagnostic the driver silently removes is
        /// worse than none, because the migration still fails and now says nothing useful.
        /// <c>HINT</c> is not redacted, so the remediation query can stay there.
        /// </summary>
        private const string RefuseIfDuplicatesExist = @"
DO $do$
DECLARE
    duplicate_groups integer;
    report text;
BEGIN
    CREATE TEMPORARY TABLE webchat_identifier_duplicates ON COMMIT DROP AS
    SELECT 'username' AS field,
           lower(""Username"") AS value,
           count(*) AS accounts,
           string_agg(""Id"", ', ' ORDER BY ""Id"") AS ids
    FROM ""User""
    WHERE ""Username"" IS NOT NULL
    GROUP BY lower(""Username"")
    HAVING count(*) > 1
    UNION ALL
    SELECT 'email',
           lower(""Email""),
           count(*),
           string_agg(""Id"", ', ' ORDER BY ""Id"")
    FROM ""User""
    WHERE ""Email"" IS NOT NULL
    GROUP BY lower(""Email"")
    HAVING count(*) > 1;

    SELECT count(*) INTO duplicate_groups FROM webchat_identifier_duplicates;

    IF duplicate_groups > 0 THEN
        SELECT string_agg(line, chr(10))
        INTO report
        FROM (
            SELECT format('%s %L is held by %s accounts: %s', field, value, accounts, ids) AS line
            FROM webchat_identifier_duplicates
            ORDER BY field, value
            LIMIT 20
        ) capped;

        RAISE EXCEPTION
            E'Cannot make usernames and email addresses unique: % identifier(s) are held by more than one account.\n%',
            duplicate_groups, report
            USING HINT = $hint$Rename or remove the duplicate accounts above, then deploy again - nothing has been changed. The full list, if it was truncated at 20:
SELECT lower(""Username"") AS identifier, count(*), string_agg(""Id"", ', ') FROM ""User"" GROUP BY 1 HAVING count(*) > 1;
SELECT lower(""Email"") AS identifier, count(*), string_agg(""Id"", ', ') FROM ""User"" GROUP BY 1 HAVING count(*) > 1;$hint$;
    END IF;
END
$do$;
";

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(RefuseIfDuplicatesExist);
            migrationBuilder.Sql(UserUniqueIndexes.CreateUsernameIndex);
            migrationBuilder.Sql(UserUniqueIndexes.CreateEmailIndex);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(UserUniqueIndexes.DropUsernameIndex);
            migrationBuilder.Sql(UserUniqueIndexes.DropEmailIndex);
        }
    }
}
