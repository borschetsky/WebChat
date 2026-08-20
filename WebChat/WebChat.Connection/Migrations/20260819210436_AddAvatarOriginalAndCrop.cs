using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WebChat.Connection.Migrations
{
    /// <inheritdoc />
    public partial class AddAvatarOriginalAndCrop : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "AvatarCropHeight",
                table: "User",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "AvatarCropWidth",
                table: "User",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "AvatarCropX",
                table: "User",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "AvatarCropY",
                table: "User",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AvatarOriginalFileName",
                table: "User",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AvatarCropHeight",
                table: "User");

            migrationBuilder.DropColumn(
                name: "AvatarCropWidth",
                table: "User");

            migrationBuilder.DropColumn(
                name: "AvatarCropX",
                table: "User");

            migrationBuilder.DropColumn(
                name: "AvatarCropY",
                table: "User");

            migrationBuilder.DropColumn(
                name: "AvatarOriginalFileName",
                table: "User");
        }
    }
}
