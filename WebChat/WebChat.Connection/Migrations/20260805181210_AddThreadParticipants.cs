using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WebChat.Connection.Migrations
{
    /// <inheritdoc />
    public partial class AddThreadParticipants : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsGroup",
                table: "Thread",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "Name",
                table: "Thread",
                type: "text",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ThreadParticipant",
                columns: table => new
                {
                    Id = table.Column<string>(type: "text", nullable: false),
                    ThreadId = table.Column<string>(type: "text", nullable: true),
                    UserId = table.Column<string>(type: "text", nullable: true),
                    isDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedOn = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedOn = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ModifiedOn = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ThreadParticipant", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ThreadParticipant_Thread_ThreadId",
                        column: x => x.ThreadId,
                        principalTable: "Thread",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ThreadParticipant_User_UserId",
                        column: x => x.UserId,
                        principalTable: "User",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_ThreadParticipant_ThreadId",
                table: "ThreadParticipant",
                column: "ThreadId");

            migrationBuilder.CreateIndex(
                name: "IX_ThreadParticipant_UserId",
                table: "ThreadParticipant",
                column: "UserId");

            // Give every existing thread its two members.
            //
            // This is not tidying up - it is the migration. Thread authorization now asks
            // whether a ThreadParticipant row exists, so a thread with no rows is a thread
            // nobody can open. Without this, deploying would make every existing conversation
            // invisible to the people in it, with no error to explain why.
            //
            // UNION rather than UNION ALL: a thread whose owner is also its opponent would
            // otherwise get the same person twice, and a duplicate member would send them
            // two copies of every message.
            migrationBuilder.Sql(@"
                INSERT INTO ""ThreadParticipant"" (""Id"", ""ThreadId"", ""UserId"", ""CreatedOn"", ""isDeleted"")
                SELECT gen_random_uuid()::text, m.""ThreadId"", m.""UserId"", NOW(), false
                FROM (
                    SELECT t.""Id"" AS ""ThreadId"", t.""OwnerId"" AS ""UserId""
                    FROM ""Thread"" t
                    WHERE t.""OwnerId"" IS NOT NULL
                    UNION
                    SELECT t.""Id"", t.""OponentId""
                    FROM ""Thread"" t
                    WHERE t.""OponentId"" IS NOT NULL
                ) m
                -- Only users that still exist, or the foreign key rejects the whole migration
                -- because of one thread pointing at a deleted account.
                WHERE EXISTS (SELECT 1 FROM ""User"" u WHERE u.""Id"" = m.""UserId"");
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ThreadParticipant");

            migrationBuilder.DropColumn(
                name: "IsGroup",
                table: "Thread");

            migrationBuilder.DropColumn(
                name: "Name",
                table: "Thread");
        }
    }
}
