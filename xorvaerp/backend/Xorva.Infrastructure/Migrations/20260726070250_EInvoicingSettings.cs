using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Xorva.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class EInvoicingSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AddressLine",
                table: "AccountingSettings",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "City",
                table: "AccountingSettings",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CountryCode",
                table: "AccountingSettings",
                type: "character varying(2)",
                maxLength: 2,
                nullable: false,
                defaultValue: "AE");

            migrationBuilder.AddColumn<string>(
                name: "LegalName",
                table: "AccountingSettings",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TaxRegistrationNumber",
                table: "AccountingSettings",
                type: "character varying(30)",
                maxLength: 30,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AddressLine",
                table: "AccountingSettings");

            migrationBuilder.DropColumn(
                name: "City",
                table: "AccountingSettings");

            migrationBuilder.DropColumn(
                name: "CountryCode",
                table: "AccountingSettings");

            migrationBuilder.DropColumn(
                name: "LegalName",
                table: "AccountingSettings");

            migrationBuilder.DropColumn(
                name: "TaxRegistrationNumber",
                table: "AccountingSettings");
        }
    }
}
