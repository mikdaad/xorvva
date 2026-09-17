using FluentAssertions;
using Xorva.Core.Constants;
using Xorva.Core.Entities;
using Xorva.Core.Enums;
using Xorva.Core.Exceptions;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Ledger.Commands.SeedChartOfAccounts;
using Xorva.Modules.Accounting.Ledger.Entities;
using Xorva.Modules.Accounting.Ledger.Queries.GetTrialBalance;
using Xorva.Modules.HR.Commands.PostPayRun;
using Xorva.Modules.HR.Commands.RunPayroll;
using Xorva.Modules.HR.Entities;
using Xorva.Modules.HR.Enums;
using Xorva.Tests.Unit.TestHelpers;

namespace Xorva.Tests.Unit.Accounting;

public class PayrollTests : AuthHandlerTestBase
{
    private readonly Company _company;

    public PayrollTests()
    {
        var tenant = SeedTenant();
        _company = SeedCompany(tenant.Id, "Payroll Co");
        _company.ActiveModules = [ModuleCatalog.HR, ModuleCatalog.Accounting];
        Db.SaveChanges();
        ActAs(SeedUser("hr@co.test", role: SystemRole.CompanyAdmin, tenantId: tenant.Id, companyId: _company.Id));
    }

    private void SeedEmployee(decimal salary)
    {
        Db.Set<Employee>().Add(new Employee
        {
            TenantId = _company.TenantId, CompanyId = _company.Id,
            EmployeeCode = $"EMP-{Guid.NewGuid():N}"[..8], FirstName = "E", LastName = "E",
            DepartmentId = Guid.NewGuid(), DesignationId = Guid.NewGuid(),
            JoinDate = new DateOnly(2026, 1, 1), BasicSalary = salary,
            EmploymentStatus = EmploymentStatus.Active, IsActive = true,
        });
        Db.SaveChanges();
    }

    private Guid Acct(string code) => Db.Set<Account>().Single(a => a.Code == code).Id;

    [Fact]
    public async Task RunPayroll_GeneratesPayslips_FromActiveEmployees()
    {
        SeedEmployee(5000);
        SeedEmployee(3000);

        var res = await new RunPayrollHandler(Db, TenantService)
            .Handle(new RunPayrollCommand { Year = 2026, Month = 6 }, CancellationToken.None);

        res.Data!.Payslips.Should().HaveCount(2);
        res.Data.TotalGross.Should().Be(8000m);
        res.Data.TotalNet.Should().Be(8000m);
        res.Data.Number.Should().Be("PR-2026-06");
        res.Data.Status.Should().Be("Draft");
    }

    [Fact]
    public async Task PostPayRun_PostsSalaryJournal_ViaJournalPoster()
    {
        SeedEmployee(5000);
        SeedEmployee(3000);
        await new SeedChartOfAccountsHandler(Db, TenantService)
            .Handle(new SeedChartOfAccountsCommand { Industry = "General" }, CancellationToken.None);

        var run = await new RunPayrollHandler(Db, TenantService)
            .Handle(new RunPayrollCommand { Year = 2026, Month = 6 }, CancellationToken.None);

        var poster = new JournalPoster(Db, TenantService);
        var posted = await new PostPayRunHandler(Db, TenantService, poster)
            .Handle(new PostPayRunCommand { Id = run.Data!.Id }, CancellationToken.None);

        posted.Data!.Status.Should().Be("Posted");
        posted.Data.JournalEntryId.Should().NotBeNull();

        // DR Salary Expense 8,000 · CR Salary Payable 8,000
        Db.Set<Account>().Single(a => a.Id == Acct(ChartTemplates.Codes.SalaryExpense)).CurrentBalance.Should().Be(8000m);
        Db.Set<Account>().Single(a => a.Id == Acct(ChartTemplates.Codes.SalaryPayable)).CurrentBalance.Should().Be(8000m);

        var tb = await new GetTrialBalanceHandler(Db, TenantService).Handle(new GetTrialBalanceQuery(), CancellationToken.None);
        tb.Data!.IsBalanced.Should().BeTrue();
    }

    [Fact]
    public async Task RunPayroll_SameMonthTwice_IsRejected()
    {
        SeedEmployee(1000);
        var h = new RunPayrollHandler(Db, TenantService);
        await h.Handle(new RunPayrollCommand { Year = 2026, Month = 7 }, CancellationToken.None);

        var act = () => h.Handle(new RunPayrollCommand { Year = 2026, Month = 7 }, CancellationToken.None);
        await act.Should().ThrowAsync<ConflictException>();
    }
}
