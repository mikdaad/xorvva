using FluentAssertions;
using Xorva.Core.Constants;
using Xorva.Core.Entities;
using Xorva.Core.Enums;
using Xorva.Modules.Accounting.Banking.Commands.CreateBankAccount;
using Xorva.Modules.Accounting.Banking.Commands.SetLineReconciled;
using Xorva.Modules.Accounting.Banking.Queries.GetBankReconciliation;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Ledger.Commands.CreateManualJournal;
using Xorva.Modules.Accounting.Ledger.Commands.SeedChartOfAccounts;
using Xorva.Modules.Accounting.Ledger.Entities;
using Xorva.Tests.Unit.TestHelpers;

namespace Xorva.Tests.Unit.Accounting;

public class BankReconciliationTests : AuthHandlerTestBase
{
    private readonly Company _company;

    public BankReconciliationTests()
    {
        var tenant = SeedTenant();
        _company = SeedCompany(tenant.Id, "Recon Co");
        _company.ActiveModules = [ModuleCatalog.Sales, ModuleCatalog.Accounting];
        Db.SaveChanges();
        ActAs(SeedUser("rec@co.test", role: SystemRole.CompanyAdmin, tenantId: tenant.Id, companyId: _company.Id));
        new SeedChartOfAccountsHandler(Db, TenantService)
            .Handle(new SeedChartOfAccountsCommand { Industry = "General" }, CancellationToken.None).GetAwaiter().GetResult();
    }

    private JournalPoster Poster => new(Db, TenantService);
    private Guid Acct(string code) => Db.Set<Account>().Single(a => a.Code == code).Id;

    [Fact]
    public async Task Reconciliation_TracksReconciledVsLedgerBalance()
    {
        var bank = await new CreateBankAccountHandler(Db, TenantService)
            .Handle(new CreateBankAccountCommand { Name = "Main", AccountId = Acct(ChartTemplates.Codes.Bank) }, CancellationToken.None);

        // Two cash-in journals: 1,000 and 400.
        var manual = new CreateManualJournalHandler(Db, TenantService, Poster);
        foreach (var amt in new[] { 1000m, 400m })
            await manual.Handle(new CreateManualJournalCommand
            {
                Date = new DateTime(2026, 3, 5),
                Lines = [new() { AccountId = Acct(ChartTemplates.Codes.Bank), Debit = amt }, new() { AccountId = Acct(ChartTemplates.Codes.Sales), Credit = amt }],
            }, CancellationToken.None);

        var recon = await new GetBankReconciliationHandler(Db, TenantService)
            .Handle(new GetBankReconciliationQuery { BankAccountId = bank.Data!.Id }, CancellationToken.None);

        recon.Data!.LedgerBalance.Should().Be(1400m);
        recon.Data.ReconciledBalance.Should().Be(0m);
        recon.Data.Lines.Should().HaveCount(2);

        // Reconcile the first line (1,000).
        var firstLine = recon.Data.Lines.First(l => l.Debit == 1000m);
        await new SetLineReconciledHandler(Db, TenantService)
            .Handle(new SetLineReconciledCommand { Id = firstLine.Id, IsReconciled = true }, CancellationToken.None);

        var after = await new GetBankReconciliationHandler(Db, TenantService)
            .Handle(new GetBankReconciliationQuery { BankAccountId = bank.Data.Id }, CancellationToken.None);
        after.Data!.ReconciledBalance.Should().Be(1000m);
        after.Data.UnreconciledBalance.Should().Be(400m);
    }
}
