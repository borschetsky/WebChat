using Microsoft.EntityFrameworkCore.Migrations;
using WebChat.Models;

#nullable disable

namespace WebChat.Connection.Migrations
{
    /// <inheritdoc />
    public partial class AddAccountStatus : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // "active", not the generated empty string: every account that exists before this
            // migration is by definition one that can sign in, and an empty status matches no
            // AccountStatus constant, so AccountStatus.CanSignIn would refuse all of them.
            migrationBuilder.AddColumn<string>(
                name: "Status",
                table: "User",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: AccountStatus.Active);

            // Belt and braces on top of the column default, and the same pairing #67 used:
            // the default only applies to rows the ALTER writes, and reading the intent out
            // of a DDL default is harder than reading it here.
            //
            // **The backfill is the dangerous half of this migration.** It leaves the data
            // correct everywhere anyone would think to look, which is exactly what hid #63's
            // ownerless-groups bug for as long as it did. The other half - UserService
            // .CreateUser naming the status, proven by RegistrationStatusTests against a
            // property with no initializer - is the half that actually matters.
            migrationBuilder.Sql(
                $"UPDATE \"User\" SET \"Status\" = '{AccountStatus.Active}' " +
                "WHERE \"Status\" IS NULL OR \"Status\" = '';");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Status",
                table: "User");
        }
    }
}
