using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WebChat.Connection.Migrations
{
    /// <inheritdoc />
    public partial class ThreadNamedFlag : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "Named",
                table: "Thread",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            // The backfill is the migration. Without it every existing group flips to a derived
            // title the moment this deploys, and people watch their conversations rename
            // themselves - the exact failure the derived-name change exists to prevent, just
            // pointed the other way.
            //
            // Every group that already has a name keeps it. We cannot tell, after the fact,
            // which of those names somebody chose and which were snapshotted at creation by the
            // old code, and guessing wrong is destructive in one direction only: wrongly marking
            // a chosen name as derived would silently rewrite it later. So the safe reading is
            // "leave what people already see alone".
            //
            // Direct messages are untouched: they have no name and are titled after the other
            // person, so Named stays false and means nothing for them.
            migrationBuilder.Sql(@"
                UPDATE ""Thread""
                SET ""Named"" = TRUE
                WHERE ""IsGroup"" = TRUE
                  AND ""Name"" IS NOT NULL
                  AND btrim(""Name"") <> '';
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Named",
                table: "Thread");
        }
    }
}
