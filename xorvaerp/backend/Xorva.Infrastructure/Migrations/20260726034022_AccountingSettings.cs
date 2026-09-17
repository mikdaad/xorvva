using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Xorva.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AccountingSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AccountingSettings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    BaseCurrency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    ReceivableAccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    PayableAccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    SalesAccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    PurchaseAccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    VatOutputAccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    VatInputAccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    DefaultBankAccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    CashAccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    RetainedEarningsAccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    RoundingAccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    SalaryExpenseAccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    SalaryPayableAccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    InvoicePrefix = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    BillPrefix = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    JournalPrefix = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    PaymentPrefix = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    NextInvoiceNumber = table.Column<int>(type: "integer", nullable: false),
                    NextBillNumber = table.Column<int>(type: "integer", nullable: false),
                    NextJournalNumber = table.Column<int>(type: "integer", nullable: false),
                    NextPaymentNumber = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AccountingSettings", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AccountingSettings_CompanyId",
                table: "AccountingSettings",
                column: "CompanyId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AccountingSettings");
        }
    }
}
