using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WebChat.Connection.Migrations
{
    /// <inheritdoc />
    public partial class GroupRolesPermissionsAndVersion : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "GRole",
                table: "ThreadParticipant",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PermInvite",
                table: "Thread",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PermRemove",
                table: "Thread",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PermRename",
                table: "Thread",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Version",
                table: "Thread",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            // The backfill is the migration, as it was for the participants table itself.
            // Every existing membership row predates roles, so without this every group has no
            // owner - and an ownerless group cannot be renamed, cannot have its members
            // managed, and has no way back through the UI.
            //
            // Thread.OwnerId still records who created each thread. That column was kept
            // precisely so a rollback could reconstruct membership, and it is what makes this
            // backfill a fact rather than a guess.
            migrationBuilder.Sql(@"
                UPDATE ""ThreadParticipant"" SET ""GRole"" = 'member' WHERE ""GRole"" IS NULL;

                UPDATE ""ThreadParticipant"" p
                SET ""GRole"" = 'owner'
                FROM ""Thread"" t
                WHERE p.""ThreadId"" = t.""Id""
                  AND p.""UserId"" = t.""OwnerId"";

                UPDATE ""Thread""
                SET ""PermRename"" = COALESCE(""PermRename"", 'admins'),
                    ""PermInvite"" = COALESCE(""PermInvite"", 'admins'),
                    ""PermRemove"" = COALESCE(""PermRemove"", 'admins');
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "GRole",
                table: "ThreadParticipant");

            migrationBuilder.DropColumn(
                name: "PermInvite",
                table: "Thread");

            migrationBuilder.DropColumn(
                name: "PermRemove",
                table: "Thread");

            migrationBuilder.DropColumn(
                name: "PermRename",
                table: "Thread");

            migrationBuilder.DropColumn(
                name: "Version",
                table: "Thread");
        }
    }
}
