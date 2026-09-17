using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Xorva.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class DesignationCategory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Level",
                table: "Designations");

            migrationBuilder.AddColumn<string>(
                name: "Category",
                table: "Designations",
                type: "character varying(60)",
                maxLength: 60,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Category",
                table: "Designations");

            migrationBuilder.AddColumn<int>(
                name: "Level",
                table: "Designations",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }
    }
}
