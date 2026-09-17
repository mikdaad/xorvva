using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Xorva.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class DepartmentRules : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Rules",
                table: "Departments",
                type: "jsonb",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Rules",
                table: "Departments");
        }
    }
}
