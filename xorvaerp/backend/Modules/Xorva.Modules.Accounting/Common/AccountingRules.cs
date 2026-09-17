using Xorva.Modules.Accounting.Enums;

namespace Xorva.Modules.Accounting.Common;

/// <summary>Small, pure accounting rules shared across handlers.</summary>
public static class AccountingRules
{
    /// <summary>Asset &amp; Expense accounts increase on the debit side; everything else on the credit side.</summary>
    public static NormalBalance NormalBalanceFor(AccountType type) => type switch
    {
        AccountType.Asset or AccountType.Expense => NormalBalance.Debit,
        _ => NormalBalance.Credit
    };
}
