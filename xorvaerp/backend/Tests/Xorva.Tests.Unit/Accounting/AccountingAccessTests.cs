using FluentAssertions;
using Xorva.API.Filters;
using Xorva.Core.Constants;
using Xorva.Core.Entities;
using Xorva.Core.Enums;
using Xorva.Modules.HR.Entities;
using Xorva.Modules.HR.Enums;
using Xorva.Tests.Unit.TestHelpers;

namespace Xorva.Tests.Unit.Accounting;

public class AccountingAccessTests : AuthHandlerTestBase
{
    private readonly Company _company;
    private readonly Guid _tenantId;

    public AccountingAccessTests()
    {
        _tenantId = SeedTenant().Id;
        _company = SeedCompany(_tenantId, "Acc Co");
        _company.ActiveModules = [ModuleCatalog.Sales, ModuleCatalog.Accounting];
        Db.SaveChanges();
    }

    private ApplicationUser SeedManagerHeadingDept(DepartmentFunction function)
    {
        var mgr = SeedUser($"mgr-{Guid.NewGuid():N}@acc.test", role: SystemRole.Manager, tenantId: _tenantId, companyId: _company.Id);
        var emp = new Employee
        {
            TenantId = _tenantId, CompanyId = _company.Id, EmployeeCode = "EMP-1",
            FirstName = "Man", LastName = "Ager", DepartmentId = Guid.NewGuid(), DesignationId = Guid.NewGuid(),
            JoinDate = new DateOnly(2026, 1, 1), UserId = mgr.Id,
        };
        Db.Set<Employee>().Add(emp);
        Db.Set<Department>().Add(new Department
        {
            TenantId = _tenantId, CompanyId = _company.Id, Name = "Dept", Code = $"D{Guid.NewGuid():N}"[..8],
            Function = function, HeadEmployeeId = emp.Id,
        });
        Db.SaveChanges();
        return mgr;
    }

    private Task<bool> Access() => AccountingAccess.HasAsync(TenantService, Db, CancellationToken.None);

    [Fact]
    public async Task Manager_HeadingAccountingDept_HasAccess()
    {
        ActAs(SeedManagerHeadingDept(DepartmentFunction.Accounting));
        (await Access()).Should().BeTrue();
    }

    [Fact]
    public async Task Manager_HeadingHrDept_NoAccess()
    {
        ActAs(SeedManagerHeadingDept(DepartmentFunction.HR));
        (await Access()).Should().BeFalse();
    }

    [Fact]
    public async Task PlainManager_NoAccess()
    {
        ActAs(SeedUser("plain@acc.test", role: SystemRole.Manager, tenantId: _tenantId, companyId: _company.Id));
        (await Access()).Should().BeFalse();
    }

    [Fact]
    public async Task CompanyAdmin_HasAccess()
    {
        ActAs(SeedUser("admin@acc.test", role: SystemRole.CompanyAdmin, tenantId: _tenantId, companyId: _company.Id));
        (await Access()).Should().BeTrue();
    }

    [Fact]
    public async Task Employee_NoAccess()
    {
        ActAs(SeedUser("emp@acc.test", role: SystemRole.Employee, tenantId: _tenantId, companyId: _company.Id));
        (await Access()).Should().BeFalse();
    }
}
