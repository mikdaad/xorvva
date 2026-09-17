namespace Xorva.Core.Enums;

/// <summary>
/// A well-known posting account, resolved per-company to a real ledger account by the
/// JournalPoster (via AccountingSettings). Lets any module post to standard accounts
/// (e.g. HR payroll → Salary Expense / Salary Payable) without knowing account ids.
/// </summary>
public enum SystemAccount
{
    Bank,
    Cash,
    AccountsReceivable,
    AccountsPayable,
    VatOutput,
    VatInput,
    RetainedEarnings,
    Rounding,
    SalaryExpense,
    SalaryPayable,
    Sales,
    Purchase,
    /// <summary>Realized foreign-exchange gain/loss on settling foreign-currency documents.</summary>
    FxGainLoss,
    /// <summary>Unrealized foreign-exchange gain/loss from period-end revaluation of open balances.</summary>
    UnrealizedFxGainLoss
}
