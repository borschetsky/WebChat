using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WebChat.Connection.Migrations
{
    /// <inheritdoc />
    public partial class SystemMessages : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "SystemData",
                table: "Message",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SystemKind",
                table: "Message",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Type",
                table: "Message",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SystemData",
                table: "Message");

            migrationBuilder.DropColumn(
                name: "SystemKind",
                table: "Message");

            migrationBuilder.DropColumn(
                name: "Type",
                table: "Message");
        }
    }
}
