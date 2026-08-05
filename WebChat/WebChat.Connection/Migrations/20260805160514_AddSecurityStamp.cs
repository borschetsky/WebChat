using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WebChat.Connection.Migrations
{
    /// <inheritdoc />
    public partial class AddSecurityStamp : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "SecurityStamp",
                table: "User",
                type: "text",
                nullable: true);

            // Give every existing row a stamp. Leaving them null would mean the first reset
            // rotates a value that nothing was ever signed with, and every account would sit
            // in a state authentication has no rule for.
            //
            // gen_random_uuid() is built into PostgreSQL 13+, so no extension is needed - and
            // one distinct value per row matters: a shared stamp would make one user's reset
            // sign everybody out.
            migrationBuilder.Sql(@"UPDATE ""User"" SET ""SecurityStamp"" = gen_random_uuid()::text;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SecurityStamp",
                table: "User");
        }
    }
}
