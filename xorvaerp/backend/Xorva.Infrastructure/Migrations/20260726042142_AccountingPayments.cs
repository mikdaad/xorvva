using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Xorva.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AccountingPayments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CustomerPayments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Number = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    ContactId = table.Column<Guid>(type: "uuid", nullable: false),
                    Date = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(18,2)", nullable: false),
                    Currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    BankAccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    Method = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    JournalEntryId = table.Column<Guid>(type: "uuid", nullable: true),
                    Reference = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CustomerPayments", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PaymentAllocations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CustomerPaymentId = table.Column<Guid>(type: "uuid", nullable: false),
                    InvoiceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(18,2)", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PaymentAllocations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PaymentAllocations_CustomerPayments_CustomerPaymentId",
                        column: x => x.CustomerPaymentId,
                        principalTable: "CustomerPayments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CustomerPayments_CompanyId_ContactId",
                table: "CustomerPayments",
                columns: new[] { "CompanyId", "ContactId" });

            migrationBuilder.CreateIndex(
                name: "IX_CustomerPayments_CompanyId_Number",
                table: "CustomerPayments",
                columns: new[] { "CompanyId", "Number" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PaymentAllocations_CustomerPaymentId",
                table: "PaymentAllocations",
                column: "CustomerPaymentId");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentAllocations_InvoiceId",
                table: "PaymentAllocations",
                column: "InvoiceId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PaymentAllocations");

            migrationBuilder.DropTable(
                name: "CustomerPayments");
        }
    }
}
