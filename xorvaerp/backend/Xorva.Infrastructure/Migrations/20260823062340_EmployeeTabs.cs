using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Xorva.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class EmployeeTabs : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "EmployeeTabs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Key = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Label = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    IsList = table.Column<bool>(type: "boolean", nullable: false),
                    Icon = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: true),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EmployeeTabs", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "EmployeeTabFields",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    EmployeeTabId = table.Column<Guid>(type: "uuid", nullable: false),
                    Key = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Label = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Type = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    IsRequired = table.Column<bool>(type: "boolean", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    Options = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EmployeeTabFields", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EmployeeTabFields_EmployeeTabs_EmployeeTabId",
                        column: x => x.EmployeeTabId,
                        principalTable: "EmployeeTabs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "EmployeeTabRecords",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    EmployeeTabId = table.Column<Guid>(type: "uuid", nullable: false),
                    EmployeeId = table.Column<Guid>(type: "uuid", nullable: false),
                    Data = table.Column<string>(type: "jsonb", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EmployeeTabRecords", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EmployeeTabRecords_EmployeeTabs_EmployeeTabId",
                        column: x => x.EmployeeTabId,
                        principalTable: "EmployeeTabs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_EmployeeTabFields_EmployeeTabId_SortOrder",
                table: "EmployeeTabFields",
                columns: new[] { "EmployeeTabId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_EmployeeTabRecords_EmployeeId_EmployeeTabId",
                table: "EmployeeTabRecords",
                columns: new[] { "EmployeeId", "EmployeeTabId" });

            migrationBuilder.CreateIndex(
                name: "IX_EmployeeTabRecords_EmployeeTabId",
                table: "EmployeeTabRecords",
                column: "EmployeeTabId");

            migrationBuilder.CreateIndex(
                name: "IX_EmployeeTabs_CompanyId_Key",
                table: "EmployeeTabs",
                columns: new[] { "CompanyId", "Key" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "EmployeeTabFields");

            migrationBuilder.DropTable(
                name: "EmployeeTabRecords");

            migrationBuilder.DropTable(
                name: "EmployeeTabs");
        }
    }
}
