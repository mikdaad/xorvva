using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Xorva.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ApprovalAmountThreshold : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "AmountThreshold",
                table: "ApprovalRules",
                type: "numeric(18,2)",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AmountThreshold",
                table: "ApprovalRules");
        }
    }
}
