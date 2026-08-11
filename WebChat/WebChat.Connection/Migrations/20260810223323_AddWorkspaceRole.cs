using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WebChat.Connection.Migrations
{
    /// <summary>
    /// Adds the workspace role (see <c>WorkspaceRole</c>) and backfills every existing user to
    /// <c>member</c>.
    ///
    /// NOT NULL, so there is no such thing as a user whose workspace role is unknown - a null
    /// would have to be interpreted somewhere, and the safe reading and the convenient one are
    /// rarely the same. The scaffolded default was an empty string, which is not a valid role
    /// at all; every existing account is a member, and that is what it should say.
    ///
    /// The backfill is only half the change. <c>UserService.CreateUser</c> assigns the role
    /// explicitly on registration, in this same commit. #63 shipped a migration that
    /// backfilled existing rows while the write path still relied on the column default, and
    /// the backfill disguised it completely: every group created afterwards had no owner.
    /// </summary>
    public partial class AddWorkspaceRole : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Role",
                table: "User",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "member");

            // Explicit, and not redundant: ADD COLUMN fills existing rows from the default,
            // but this also repairs any row a re-run or an earlier partial apply left empty,
            // and it states the intent where someone reading the history will look for it.
            migrationBuilder.Sql(
                @"UPDATE ""User"" SET ""Role"" = 'member' WHERE ""Role"" IS NULL OR ""Role"" = '';");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Role",
                table: "User");
        }
    }
}
