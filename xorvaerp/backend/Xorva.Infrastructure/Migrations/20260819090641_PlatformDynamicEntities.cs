using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Xorva.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class PlatformDynamicEntities : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "EntityDefinitions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Key = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Label = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    PluralLabel = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    ModuleKey = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Icon = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: true),
                    Description = table.Column<string>(type: "character varying(400)", maxLength: 400, nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EntityDefinitions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "CustomRecords",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    EntityDefinitionId = table.Column<Guid>(type: "uuid", nullable: false),
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
                    table.PrimaryKey("PK_CustomRecords", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CustomRecords_EntityDefinitions_EntityDefinitionId",
                        column: x => x.EntityDefinitionId,
                        principalTable: "EntityDefinitions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "FieldDefinitions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    EntityDefinitionId = table.Column<Guid>(type: "uuid", nullable: false),
                    Key = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Label = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Type = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    IsRequired = table.Column<bool>(type: "boolean", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    Options = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    Placeholder = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FieldDefinitions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FieldDefinitions_EntityDefinitions_EntityDefinitionId",
                        column: x => x.EntityDefinitionId,
                        principalTable: "EntityDefinitions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CustomRecords_CompanyId_EntityDefinitionId",
                table: "CustomRecords",
                columns: new[] { "CompanyId", "EntityDefinitionId" });

            migrationBuilder.CreateIndex(
                name: "IX_CustomRecords_EntityDefinitionId",
                table: "CustomRecords",
                column: "EntityDefinitionId");

            migrationBuilder.CreateIndex(
                name: "IX_EntityDefinitions_TenantId_Key",
                table: "EntityDefinitions",
                columns: new[] { "TenantId", "Key" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_FieldDefinitions_EntityDefinitionId_SortOrder",
                table: "FieldDefinitions",
                columns: new[] { "EntityDefinitionId", "SortOrder" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CustomRecords");

            migrationBuilder.DropTable(
                name: "FieldDefinitions");

            migrationBuilder.DropTable(
                name: "EntityDefinitions");
        }
    }
}
