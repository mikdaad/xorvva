using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Xorva.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class EmployeeAttachedTabs : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_CustomRecords_EntityDefinitionId",
                table: "CustomRecords");

            migrationBuilder.AddColumn<string>(
                name: "AttachTo",
                table: "EntityDefinitions",
                type: "character varying(40)",
                maxLength: 40,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ParentId",
                table: "CustomRecords",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_CustomRecords_EntityDefinitionId_ParentId",
                table: "CustomRecords",
                columns: new[] { "EntityDefinitionId", "ParentId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_CustomRecords_EntityDefinitionId_ParentId",
                table: "CustomRecords");

            migrationBuilder.DropColumn(
                name: "AttachTo",
                table: "EntityDefinitions");

            migrationBuilder.DropColumn(
                name: "ParentId",
                table: "CustomRecords");

            migrationBuilder.CreateIndex(
                name: "IX_CustomRecords_EntityDefinitionId",
                table: "CustomRecords",
                column: "EntityDefinitionId");
        }
    }
}
