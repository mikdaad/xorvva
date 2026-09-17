using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Xorva.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AccountingFixedAssets : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "FixedAssets",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    Code = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    Category = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: true),
                    AcquisitionDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Cost = table.Column<decimal>(type: "numeric(18,2)", nullable: false),
                    SalvageValue = table.Column<decimal>(type: "numeric(18,2)", nullable: false),
                    UsefulLifeMonths = table.Column<int>(type: "integer", nullable: false),
                    AccumulatedDepreciation = table.Column<decimal>(type: "numeric(18,2)", nullable: false),
                    IsDisposed = table.Column<bool>(type: "boolean", nullable: false),
                    AssetAccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    AccumulatedDepreciationAccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    DepreciationExpenseAccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FixedAssets", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_FixedAssets_CompanyId_Name",
                table: "FixedAssets",
                columns: new[] { "CompanyId", "Name" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "FixedAssets");
        }
    }
}
