using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WebChat.Connection.Migrations
{
    /// <summary>
    /// The two tables behind the admin console's UI errors section (#74).
    ///
    /// <c>ClientErrorIssue</c> is one row per fingerprint - the thing an administrator triages
    /// - and <c>ClientErrorEvent</c> is one row per occurrence, which exists only to answer the
    /// three questions the issue row cannot: the 14-day sparkline, how many distinct people hit
    /// it, and on which browsers.
    ///
    /// **The event table is the only unbounded one in this database**, which is 512 MB and
    /// shared with all application data, so it ships with a retention job in the same change -
    /// see <c>ClientErrorRetentionService</c>. Its cascade delete is deliberate and unlike
    /// every other relationship here: an occurrence has no meaning without its issue, so
    /// retiring an issue must take its occurrences with it rather than leave orphans the
    /// pruner has to sweep separately.
    ///
    /// No append-only trigger, unlike <c>AuditEntry</c>. These rows are evidence about the
    /// software, not about a person's actions, and they are meant to be updated - every
    /// occurrence rewrites its issue's counters and sample.
    /// </summary>
    public partial class AddClientErrors : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ClientErrorIssue",
                columns: table => new
                {
                    Id = table.Column<string>(type: "text", nullable: false),
                    Fingerprint = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    Level = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Message = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Culprit = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    Route = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    Release = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    Events = table.Column<int>(type: "integer", nullable: false),
                    FirstSeenUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    LastSeenUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    StackJson = table.Column<string>(type: "text", nullable: true),
                    CrumbsJson = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ClientErrorIssue", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ClientErrorEvent",
                columns: table => new
                {
                    Id = table.Column<string>(type: "text", nullable: false),
                    IssueId = table.Column<string>(type: "text", nullable: false),
                    OccurredAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UserId = table.Column<string>(type: "character varying(450)", maxLength: 450, nullable: true),
                    Browser = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ClientErrorEvent", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ClientErrorEvent_ClientErrorIssue_IssueId",
                        column: x => x.IssueId,
                        principalTable: "ClientErrorIssue",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ClientErrorEvent_IssueId_OccurredAtUtc",
                table: "ClientErrorEvent",
                columns: new[] { "IssueId", "OccurredAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_ClientErrorEvent_OccurredAtUtc",
                table: "ClientErrorEvent",
                column: "OccurredAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_ClientErrorIssue_Fingerprint",
                table: "ClientErrorIssue",
                column: "Fingerprint",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ClientErrorIssue_LastSeenUtc",
                table: "ClientErrorIssue",
                column: "LastSeenUtc",
                descending: new bool[0]);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ClientErrorEvent");

            migrationBuilder.DropTable(
                name: "ClientErrorIssue");
        }
    }
}
