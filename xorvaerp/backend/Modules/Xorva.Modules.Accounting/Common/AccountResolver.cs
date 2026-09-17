using Xorva.Modules.Accounting.Ledger.Entities;

namespace Xorva.Modules.Accounting.Common;

/// <summary>
/// Resolves the system posting accounts. Builds the per-company <see cref="AccountingSettings"/>
/// map from a freshly-seeded chart by matching the fixed <see cref="ChartTemplates.Codes"/>.
/// </summary>
public static class AccountResolver
{
    /// <summary>
    /// Produces the posting map for a company from its seeded accounts. Every system code must
    /// be present (guaranteed by <see cref="ChartTemplates"/>), else the chart is malformed.
    /// </summary>
    public static AccountingSettings BuildSettings(Guid tenantId, Guid companyId, IEnumerable<Account> accounts)
    {
        var byCode = accounts.ToDictionary(a => a.Code, a => a.Id);

        Guid Id(string code) => byCode.TryGetValue(code, out var id)
            ? id
            : throw new InvalidOperationException($"System account '{code}' is missing from the chart of accounts.");

        return new AccountingSettings
        {
            TenantId = tenantId,
            CompanyId = companyId,
            BaseCurrency = "AED",
            ReceivableAccountId = Id(ChartTemplates.Codes.AccountsReceivable),
            PayableAccountId = Id(ChartTemplates.Codes.AccountsPayable),
            SalesAccountId = Id(ChartTemplates.Codes.Sales),
            PurchaseAccountId = Id(ChartTemplates.Codes.Cogs),
            VatOutputAccountId = Id(ChartTemplates.Codes.VatOutput),
            VatInputAccountId = Id(ChartTemplates.Codes.VatInput),
            DefaultBankAccountId = Id(ChartTemplates.Codes.Bank),
            CashAccountId = Id(ChartTemplates.Codes.Cash),
            RetainedEarningsAccountId = Id(ChartTemplates.Codes.RetainedEarnings),
            RoundingAccountId = Id(ChartTemplates.Codes.Rounding),
            SalaryExpenseAccountId = Id(ChartTemplates.Codes.SalaryExpense),
            SalaryPayableAccountId = Id(ChartTemplates.Codes.SalaryPayable),
            FxGainLossAccountId = Id(ChartTemplates.Codes.ForexGainLoss),
            UnrealizedFxGainLossAccountId = Id(ChartTemplates.Codes.UnrealizedForexGainLoss),
        };
    }
}
