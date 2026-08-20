using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WebChat.Connection.Migrations
{
    /// <summary>
    /// The retention marker behind Remove photo (#89).
    ///
    /// **Nullable and deliberately not backfilled.** Null means "this user has not removed
    /// their photo", which is the state every existing row is in and the behaviour that
    /// predates the column - a default of anything else would take every avatar in the
    /// workspace away on deploy. Nothing else moves: the two file-name columns and the four
    /// crop columns are what Undo restores, and they are only meaningful if a removal leaves
    /// them exactly as they were.
    /// </summary>
    public partial class AddAvatarRemovedAt : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "AvatarRemovedAt",
                table: "User",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AvatarRemovedAt",
                table: "User");
        }
    }
}
