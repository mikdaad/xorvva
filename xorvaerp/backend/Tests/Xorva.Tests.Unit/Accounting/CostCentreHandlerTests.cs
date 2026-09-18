using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Constants;
using Xorva.Core.Entities;
using Xorva.Core.Enums;
using Xorva.Core.Exceptions;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.CostCentres.Commands.DeleteCostCentre;
using Xorva.Modules.Accounting.CostCentres.Commands.UpsertCostCentre;
using Xorva.Modules.Accounting.CostCentres.Commands.UpsertCostCentreDimension;
using Xorva.Modules.Accounting.CostCentres.Entities;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Ledger.Commands.CreateManualJournal;
using Xorva.Modules.Accounting.Ledger.Commands.SeedChartOfAccounts;
using Xorva.Modules.Accounting.Ledger.Entities;
using Xorva.Tests.Unit.TestHelpers;

namespace Xorva.Tests.Unit.Accounting;

public class CostCentreHandlerTests : AuthHandlerTestBase
{
    private readonly Company _company;

    public CostCentreHandlerTests()
    {
        var tenant = SeedTenant();
        _company = SeedCompany(tenant.Id, "CC Co");
        _company.ActiveModules = [ModuleCatalog.Sales, ModuleCatalog.Accounting];
        Db.SaveChanges();
        ActAs(SeedUser("cc@co.test", role: SystemRole.CompanyAdmin, tenantId: tenant.Id, companyId: _company.Id));
        new SeedChartOfAccountsHandler(Db, TenantService)
            .Handle(new SeedChartOfAccountsCommand { Industry = "General" }, CancellationToken.None).GetAwaiter().GetResult();
    }

    private Guid Acct(string code) => Db.Set<Account>().Single(a => a.Code == code).Id;

    private async Task<Guid> Dimension(string code = "DEPT")
    {
        var r = await new UpsertCostCentreDimensionHandler(Db, TenantService).Handle(new UpsertCostCentreDimensionCommand
        {
            Code = code, Name = "Department", DimensionType = CostCentreDimensionType.Department,
        }, CancellationToken.None);
        return r.Data!.Id;
    }

    private Task<Xorva.Core.Common.ApiResponse<Xorva.Modules.Accounting.DTOs.CostCentreDto>> Upsert(UpsertCostCentreCommand cmd)
        => new UpsertCostCentreHandler(Db, TenantService).Handle(cmd, CancellationToken.None);

    [Fact]
    public async Task Hierarchy_DerivesLevel_UppercasesCode_RejectsDuplicates()
    {
        var dim = await Dimension();
        var ops = await Upsert(new() { DimensionId = dim, Code = "ops", Name = "Operations", IsGroup = true });
        var dxb = await Upsert(new() { DimensionId = dim, Code = "ops-dxb", Name = "Dubai", ParentId = ops.Data!.Id });

        ops.Data.Code.Should().Be("OPS");
        ops.Data.Level.Should().Be(1);
        dxb.Data!.Level.Should().Be(2);

        var dup = () => Upsert(new() { DimensionId = dim, Code = "OPS", Name = "Again" });
        await dup.Should().ThrowAsync<ConflictException>();
    }

    [Fact]
    public async Task Child_UnderPostingCentre_IsRejected()
    {
        var dim = await Dimension();
        var leaf = await Upsert(new() { DimensionId = dim, Code = "L1", Name = "Leaf" });
        var act = () => Upsert(new() { DimensionId = dim, Code = "L2", Name = "Child", ParentId = leaf.Data!.Id });
        await act.Should().ThrowAsync<BadRequestException>().WithMessage("*not a group*");
    }

    [Fact]
    public async Task Parent_FromOtherDimension_IsRejected()
    {
        var dept = await Dimension("DEPT");
        var proj = await Dimension("PROJ");
        var grp = await Upsert(new() { DimensionId = dept, Code = "G", Name = "Group", IsGroup = true });
        var act = () => Upsert(new() { DimensionId = proj, Code = "P", Name = "Proj", ParentId = grp.Data!.Id });
        await act.Should().ThrowAsync<BadRequestException>().WithMessage("*same dimension*");
    }

    [Fact]
    public async Task Delete_BlockedWhenChildrenExist_AllowedWhenLeafUnused()
    {
        var dim = await Dimension();
        var grp = await Upsert(new() { DimensionId = dim, Code = "G", Name = "Group", IsGroup = true });
        var leaf = await Upsert(new() { DimensionId = dim, Code = "L", Name = "Leaf", ParentId = grp.Data!.Id });

        var del = new DeleteCostCentreHandler(Db, TenantService);
        var blocked = () => del.Handle(new DeleteCostCentreCommand { Id = grp.Data.Id }, CancellationToken.None);
        await blocked.Should().ThrowAsync<ConflictException>();

        await del.Handle(new DeleteCostCentreCommand { Id = leaf.Data!.Id }, CancellationToken.None);
        (await Db.Set<CostCentre>().CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task ManualJournal_CanTagLines_WithCostCentre_AndRejectsGroups()
    {
        var dim = await Dimension();
        var grp = await Upsert(new() { DimensionId = dim, Code = "G", Name = "Group", IsGroup = true });
        var leaf = await Upsert(new() { DimensionId = dim, Code = "L", Name = "Leaf", ParentId = grp.Data!.Id });

        var manual = new CreateManualJournalHandler(Db, TenantService, new JournalPoster(Db, TenantService));
        var res = await manual.Handle(new CreateManualJournalCommand
        {
            Date = new DateTime(2026, 4, 1),
            Lines =
            [
                new() { AccountId = Acct(ChartTemplates.Codes.Rounding), Debit = 40, CostCentreId = leaf.Data!.Id },
                new() { AccountId = Acct(ChartTemplates.Codes.Bank), Credit = 40 },
            ],
        }, CancellationToken.None);
        res.Success.Should().BeTrue();
        (await Db.Set<JournalLine>().CountAsync(l => l.CostCentreId == leaf.Data.Id)).Should().Be(1);

        var act = () => manual.Handle(new CreateManualJournalCommand
        {
            Date = new DateTime(2026, 4, 2),
            Lines =
            [
                new() { AccountId = Acct(ChartTemplates.Codes.Rounding), Debit = 40, CostCentreId = grp.Data.Id },
                new() { AccountId = Acct(ChartTemplates.Codes.Bank), Credit = 40 },
            ],
        }, CancellationToken.None);
        await act.Should().ThrowAsync<BadRequestException>().WithMessage("*group*");

        // and a leaf with journal lines can no longer be deleted
        var del = () => new DeleteCostCentreHandler(Db, TenantService).Handle(new DeleteCostCentreCommand { Id = leaf.Data.Id }, CancellationToken.None);
        await del.Should().ThrowAsync<ConflictException>();
    }
}
