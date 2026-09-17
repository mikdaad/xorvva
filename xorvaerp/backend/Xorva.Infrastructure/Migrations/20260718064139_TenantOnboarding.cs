using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Xorva.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class TenantOnboarding : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "OnboardedAt",
                table: "Tenants",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "OnboardedAt",
                table: "Tenants");
        }
    }
}
