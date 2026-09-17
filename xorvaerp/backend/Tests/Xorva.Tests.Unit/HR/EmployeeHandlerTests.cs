using FluentAssertions;
using Xorva.Core.Entities;
using Xorva.Core.Enums;
using Xorva.Core.Interfaces;
using Xorva.Modules.HR.Commands.CreateEmployee;
using Xorva.Modules.HR.Commands.UpdateEmployee;
using Xorva.Modules.HR.Entities;
using Xorva.Modules.HR.Enums;
using Xorva.Modules.HR.Queries.GetEmployee;
using Xorva.Modules.HR.Queries.ListEmployees;
using Xorva.Tests.Unit.TestHelpers;

namespace Xorva.Tests.Unit.HR;

/// <summary>
/// Unit tests for the HR employee handlers: code generation, field persistence, update,
/// paged/filtered listing, and the salary-visibility rule (Managers must not see pay).
/// </summary>
public class EmployeeHandlerTests : AuthHandlerTestBase
{
    private readonly Company _company;
    private readonly Department _dept;
    private readonly Designation _desig;
    private static readonly DateOnly Join = new(2026, 1, 1);

    public EmployeeHandlerTests()
    {
        var tenant = SeedTenant();
        _company = SeedCompany(tenant.Id, "HR Co");
        _company.ActiveModules = ["HR"];
        _dept = new Department { TenantId = tenant.Id, CompanyId = _company.Id, Name = "Engineering", Code = "ENG", Function = DepartmentFunction.General, IsActive = true };
        _desig = new Designation { TenantId = tenant.Id, CompanyId = _company.Id, Title = "Engineer", Code = "ENG", Category = "Technical", IsActive = true };
        Db.Set<Department>().Add(_dept);
        Db.Set<Designation>().Add(_desig);
        Db.SaveChanges();
        ActAs(SeedUser("admin@hr.test", role: SystemRole.CompanyAdmin, tenantId: tenant.Id, companyId: _company.Id));
    }

    // GrantAccess is never used by these tests, so a no-op provisioning stub is enough.
    private sealed class StubProvisioning : IUserProvisioningService
    {
        public Task<ApplicationUser> ProvisionAsync(ProvisionLoginRequest r, CancellationToken ct) =>
            Task.FromResult(new ApplicationUser { Email = r.Email, Role = r.Role, CompanyId = r.CompanyId });
    }

    private CreateEmployeeCommandHandler CreateHandler => new(Db, TenantService, new StubProvisioning());

    private CreateEmployeeCommand NewHire(string first, string last, decimal salary = 15000m) => new()
    {
        FirstName = first, LastName = last, Gender = Gender.Male,
        DepartmentId = _dept.Id, DesignationId = _desig.Id,
        JoinDate = Join, EmploymentType = EmploymentType.FullTime, BasicSalary = salary,
    };

    [Fact]
    public async Task Create_GeneratesEmployeeCode_AndPersistsFields()
    {
        var res = await CreateHandler.Handle(NewHire("Ahmed", "Ali"), CancellationToken.None);

        res.Data!.EmployeeCode.Should().Be("EMP-0001");
        res.Data.FullName.Should().Be("Ahmed Ali");
        res.Data.DepartmentName.Should().Be("Engineering");
        res.Data.DesignationTitle.Should().Be("Engineer");
        res.Data.EmploymentStatus.Should().Be(EmploymentStatus.Active);
        res.Data.BasicSalary.Should().Be(15000m);   // CompanyAdmin sees salary
        Db.Set<Employee>().Should().ContainSingle();
    }

    [Fact]
    public async Task Create_Second_IncrementsCode()
    {
        await CreateHandler.Handle(NewHire("Ahmed", "Ali"), CancellationToken.None);
        var second = await CreateHandler.Handle(NewHire("Sara", "Khan"), CancellationToken.None);
        second.Data!.EmployeeCode.Should().Be("EMP-0002");
    }

    [Fact]
    public async Task Update_ChangesEditableFields()
    {
        var created = await CreateHandler.Handle(NewHire("Ahmed", "Ali"), CancellationToken.None);

        var updated = await new UpdateEmployeeCommandHandler(Db, TenantService).Handle(new UpdateEmployeeCommand
        {
            Id = created.Data!.Id,
            FirstName = "Ahmed", LastName = "Al-Farsi", Gender = Gender.Male,
            Phone = "+971500000000",
            DepartmentId = _dept.Id, DesignationId = _desig.Id, EmploymentType = EmploymentType.FullTime,
        }, CancellationToken.None);

        updated.Data!.LastName.Should().Be("Al-Farsi");
        updated.Data.FullName.Should().Be("Ahmed Al-Farsi");
        updated.Data.Phone.Should().Be("+971500000000");
    }

    [Fact]
    public async Task List_ReturnsEmployees_WithPagingAndSearch()
    {
        await CreateHandler.Handle(NewHire("Ahmed", "Ali"), CancellationToken.None);
        await CreateHandler.Handle(NewHire("Sara", "Khan"), CancellationToken.None);

        var all = await new ListEmployeesQueryHandler(Db, TenantService)
            .Handle(new ListEmployeesQuery(), CancellationToken.None);
        all.Data!.TotalCount.Should().Be(2);
        all.Data.Items.Should().HaveCount(2);

        var search = await new ListEmployeesQueryHandler(Db, TenantService)
            .Handle(new ListEmployeesQuery { Search = "Sara" }, CancellationToken.None);
        search.Data!.TotalCount.Should().Be(1);
        search.Data.Items.Single().FullName.Should().Be("Sara Khan");
    }

    [Fact]
    public async Task Salary_IsVisibleToAdmin_ButHiddenFromManager()
    {
        var created = await CreateHandler.Handle(NewHire("Ahmed", "Ali", salary: 20000m), CancellationToken.None);
        var empId = created.Data!.Id;

        // CompanyAdmin sees the salary.
        var asAdmin = await new GetEmployeeQueryHandler(Db, TenantService)
            .Handle(new GetEmployeeQuery(empId), CancellationToken.None);
        asAdmin.Data!.BasicSalary.Should().Be(20000m);

        // A Manager who heads this department can view the person — but NOT their salary.
        var mgr = new ApplicationUser
        {
            Email = "mgr@hr.test", PasswordHash = Hasher.Hash("Password@123"),
            FirstName = "Man", LastName = "Ager", Role = SystemRole.Manager,
            TenantId = _company.TenantId, CompanyId = _company.Id, DepartmentId = _dept.Id, IsActive = true,
        };
        Db.Users.Add(mgr);
        Db.SaveChanges();
        ActAs(mgr);

        var asManager = await new GetEmployeeQueryHandler(Db, TenantService)
            .Handle(new GetEmployeeQuery(empId), CancellationToken.None);
        asManager.Data!.FullName.Should().Be("Ahmed Ali");   // person is visible
        asManager.Data.BasicSalary.Should().BeNull();          // salary is masked
    }
}
