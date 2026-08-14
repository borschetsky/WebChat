using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WebChat.Connection.Migrations
{
    /// <inheritdoc />
    public partial class AddWorkspaceSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "WorkspaceSettings",
                columns: table => new
                {
                    Id = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    PoliciesJson = table.Column<string>(type: "jsonb", nullable: true),
                    ModifiedOn = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorkspaceSettings", x => x.Id);
                });

            // "Exactly one row" is a claim the entity makes, so the database is where it
            // should be true. Without this the singleton is only a convention held up by every
            // caller remembering to pass the same id, and the failure it prevents is a quiet
            // one: a second row means half the process reads a configuration nobody set.
            //
            // A check constraint rather than a unique index on a constant column, because this
            // states the actual rule and reads as the rule when somebody opens the schema.
            migrationBuilder.Sql(
                @"ALTER TABLE ""WorkspaceSettings""
                  ADD CONSTRAINT ""CK_WorkspaceSettings_Singleton"" CHECK (""Id"" = 'workspace');");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "WorkspaceSettings");
        }
    }
}
