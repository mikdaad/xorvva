using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Xorva.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class HRPersonRegistry : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Departments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Code = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    HeadEmployeeId = table.Column<Guid>(type: "uuid", nullable: true),
                    ParentDepartmentId = table.Column<Guid>(type: "uuid", nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Departments", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Designations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Code = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    Level = table.Column<int>(type: "integer", nullable: false),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Designations", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "EmployeeHistories",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    EmployeeId = table.Column<Guid>(type: "uuid", nullable: false),
                    ChangeType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    OldValue = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    NewValue = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    ChangedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ChangedByEmail = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    Reason = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EmployeeHistories", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Employees",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    EmployeeCode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    FirstName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    LastName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Email = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    Phone = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    DateOfBirth = table.Column<DateOnly>(type: "date", nullable: true),
                    Gender = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Nationality = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    NationalId = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    MaritalStatus = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    EmergencyContactName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    EmergencyContactPhone = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    EmergencyContactRelation = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    DepartmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    DesignationId = table.Column<Guid>(type: "uuid", nullable: false),
                    ReportingToId = table.Column<Guid>(type: "uuid", nullable: true),
                    BranchId = table.Column<Guid>(type: "uuid", nullable: true),
                    JoinDate = table.Column<DateOnly>(type: "date", nullable: false),
                    ProbationEndDate = table.Column<DateOnly>(type: "date", nullable: true),
                    ConfirmationDate = table.Column<DateOnly>(type: "date", nullable: true),
                    EmploymentType = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    EmploymentStatus = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    BasicSalary = table.Column<decimal>(type: "numeric(18,2)", nullable: false),
                    Currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    BankName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    AccountNumber = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    Iban = table.Column<string>(type: "character varying(34)", maxLength: 34, nullable: true),
                    UserId = table.Column<Guid>(type: "uuid", nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    Notes = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    ProfilePhotoUrl = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Employees", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Departments_CompanyId_Code",
                table: "Departments",
                columns: new[] { "CompanyId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Departments_CompanyId_Name",
                table: "Departments",
                columns: new[] { "CompanyId", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Designations_CompanyId_Title",
                table: "Designations",
                columns: new[] { "CompanyId", "Title" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_EmployeeHistories_CompanyId_EmployeeId",
                table: "EmployeeHistories",
                columns: new[] { "CompanyId", "EmployeeId" });

            migrationBuilder.CreateIndex(
                name: "IX_Employees_CompanyId_DepartmentId",
                table: "Employees",
                columns: new[] { "CompanyId", "DepartmentId" });

            migrationBuilder.CreateIndex(
                name: "IX_Employees_CompanyId_EmployeeCode",
                table: "Employees",
                columns: new[] { "CompanyId", "EmployeeCode" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Employees_CompanyId_EmploymentStatus",
                table: "Employees",
                columns: new[] { "CompanyId", "EmploymentStatus" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Departments");

            migrationBuilder.DropTable(
                name: "Designations");

            migrationBuilder.DropTable(
                name: "EmployeeHistories");

            migrationBuilder.DropTable(
                name: "Employees");
        }
    }
}
