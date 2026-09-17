namespace Xorva.Core.Enums;

/// <summary>
/// Origin of a journal entry. Part of the Core posting contract (<c>IJournalPoster</c>)
/// so any module can describe why it is posting without referencing the Accounting module.
/// </summary>
public enum JournalSourceType
{
    Manual = 0,
    Invoice = 1,
    Bill = 2,
    CustomerPayment = 3,
    SupplierPayment = 4,
    CreditNote = 5,
    DebitNote = 6,
    Payroll = 7,
    Opening = 8,
    Fx = 9,
    Depreciation = 10,
    YearEndClose = 11,
    Reversal = 12
}
