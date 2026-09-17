using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Xorva.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class MultiCurrency : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "ExchangeRate",
                table: "SupplierPayments",
                type: "numeric(18,6)",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "BaseTotal",
                table: "Invoices",
                type: "numeric(18,2)",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "ExchangeRate",
                table: "Invoices",
                type: "numeric(18,6)",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "ExchangeRate",
                table: "CustomerPayments",
                type: "numeric(18,6)",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "BaseTotal",
                table: "Bills",
                type: "numeric(18,2)",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "ExchangeRate",
                table: "Bills",
                type: "numeric(18,6)",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<Guid>(
                name: "FxGainLossAccountId",
                table: "AccountingSettings",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.CreateTable(
                name: "ExchangeRates",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CurrencyCode = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    RateDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Rate = table.Column<decimal>(type: "numeric(18,6)", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ExchangeRates", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ExchangeRates_CompanyId_Currency_Date",
                table: "ExchangeRates",
                columns: new[] { "CompanyId", "CurrencyCode", "RateDate" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ExchangeRates");

            migrationBuilder.DropColumn(
                name: "ExchangeRate",
                table: "SupplierPayments");

            migrationBuilder.DropColumn(
                name: "BaseTotal",
                table: "Invoices");

            migrationBuilder.DropColumn(
                name: "ExchangeRate",
                table: "Invoices");

            migrationBuilder.DropColumn(
                name: "ExchangeRate",
                table: "CustomerPayments");

            migrationBuilder.DropColumn(
                name: "BaseTotal",
                table: "Bills");

            migrationBuilder.DropColumn(
                name: "ExchangeRate",
                table: "Bills");

            migrationBuilder.DropColumn(
                name: "FxGainLossAccountId",
                table: "AccountingSettings");
        }
    }
}
