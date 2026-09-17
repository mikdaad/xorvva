using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Xorva.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ApprovalEngine : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ApprovalRequests",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ActionKey = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Title = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    CommandJson = table.Column<string>(type: "text", nullable: false),
                    RequesterUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    RequesterTenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    RequesterCompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    RequesterRole = table.Column<int>(type: "integer", nullable: false),
                    RequesterEmail = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    RuleId = table.Column<Guid>(type: "uuid", nullable: true),
                    RuleNameSnapshot = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    CompletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    Outcome = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ApprovalRequests", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ApprovalRuleAudits",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RuleId = table.Column<Guid>(type: "uuid", nullable: false),
                    RuleName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ChangeType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    ChangedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ChangedByEmail = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    Detail = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ApprovalRuleAudits", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ApprovalRules",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Module = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ActionKey = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ApproverRoles = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    IsMandatory = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ApprovalRules", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ApprovalRequestSteps",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ApprovalRequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    Order = table.Column<int>(type: "integer", nullable: false),
                    RequiredRole = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    ActedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    ActedByEmail = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    Comment = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    ActedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ApprovalRequestSteps", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ApprovalRequestSteps_ApprovalRequests_ApprovalRequestId",
                        column: x => x.ApprovalRequestId,
                        principalTable: "ApprovalRequests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ApprovalRequests_CompanyId_Status",
                table: "ApprovalRequests",
                columns: new[] { "CompanyId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_ApprovalRequestSteps_ApprovalRequestId",
                table: "ApprovalRequestSteps",
                column: "ApprovalRequestId");

            migrationBuilder.CreateIndex(
                name: "IX_ApprovalRuleAudits_CompanyId",
                table: "ApprovalRuleAudits",
                column: "CompanyId");

            migrationBuilder.CreateIndex(
                name: "IX_ApprovalRules_CompanyId_ActionKey",
                table: "ApprovalRules",
                columns: new[] { "CompanyId", "ActionKey" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ApprovalRequestSteps");

            migrationBuilder.DropTable(
                name: "ApprovalRuleAudits");

            migrationBuilder.DropTable(
                name: "ApprovalRules");

            migrationBuilder.DropTable(
                name: "ApprovalRequests");
        }
    }
}
