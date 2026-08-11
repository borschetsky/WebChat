using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WebChat.Connection.Migrations
{
    /// <inheritdoc />
    public partial class AddAuditLog : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AuditEntry",
                columns: table => new
                {
                    Id = table.Column<string>(type: "text", nullable: false),
                    ActorId = table.Column<string>(type: "character varying(450)", maxLength: 450, nullable: false),
                    Action = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    TargetType = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    TargetId = table.Column<string>(type: "character varying(450)", maxLength: 450, nullable: true),
                    DetailJson = table.Column<string>(type: "text", nullable: true),
                    OccurredAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AuditEntry", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AuditEntry_OccurredAtUtc",
                table: "AuditEntry",
                column: "OccurredAtUtc",
                descending: new bool[0]);

            // Append-only, enforced rather than agreed.
            //
            // The usual way - REVOKE UPDATE, DELETE ON "AuditEntry" - is not available here:
            // the application connects to DigitalOcean's managed Postgres as the role that
            // owns the table, and an owner can always grant itself back what it revoked. A
            // trigger cannot be talked out of it, and it holds against anything EF or a
            // console session does, including a well-meant "just fix this one row".
            //
            // The point is narrow and worth stating: an audit log that can be edited proves
            // nothing about the actions in it, so this is the line that makes the log worth
            // keeping at all. Correcting a mistaken entry means writing another entry.
            migrationBuilder.Sql(@"
                CREATE OR REPLACE FUNCTION webchat_audit_is_append_only()
                RETURNS trigger AS $$
                BEGIN
                    RAISE EXCEPTION
                        'AuditEntry is append-only: % is not permitted. Record a correcting entry instead.',
                        TG_OP;
                END;
                $$ LANGUAGE plpgsql;

                CREATE TRIGGER audit_entry_append_only
                BEFORE UPDATE OR DELETE ON ""AuditEntry""
                FOR EACH ROW EXECUTE FUNCTION webchat_audit_is_append_only();
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // The trigger goes with the table, but the function does not - dropping a table
            // drops its triggers and leaves the function behind, where it would collide with
            // CREATE OR REPLACE on a re-apply only by luck.
            migrationBuilder.DropTable(
                name: "AuditEntry");

            migrationBuilder.Sql("DROP FUNCTION IF EXISTS webchat_audit_is_append_only();");
        }
    }
}
