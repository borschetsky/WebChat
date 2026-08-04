using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WebChat.Connection.Migrations
{
    /// <inheritdoc />
    public partial class AddEmailConfirmation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "EmailConfirmationSentAt",
                table: "User",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EmailConfirmationTokenHash",
                table: "User",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "EmailConfirmed",
                table: "User",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            // Grandfather everyone who already exists.
            //
            // Without this the column default applies to existing rows and every account in
            // the database becomes unconfirmed - and since sign-in is refused while it is
            // false, deploying this migration would lock out every existing user, with no
            // pending token to rescue them. The default of false is correct for rows inserted
            // after this point; it is wrong for rows that predate the feature.
            migrationBuilder.Sql(@"UPDATE ""User"" SET ""EmailConfirmed"" = TRUE;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "EmailConfirmationSentAt",
                table: "User");

            migrationBuilder.DropColumn(
                name: "EmailConfirmationTokenHash",
                table: "User");

            migrationBuilder.DropColumn(
                name: "EmailConfirmed",
                table: "User");
        }
    }
}
