using Xorva.Modules.Accounting.Ledger.Entities;

namespace Xorva.Modules.Accounting.Common;

public enum DocumentSequence { Invoice, Bill, Journal, Payment }

/// <summary>
/// Generates the next document number (<c>INV-2026-0001</c>) by incrementing the counter on
/// <see cref="AccountingSettings"/>. The mutation is committed in the SAME unit of work as the
/// document, and a unique index on the document's <c>Number</c> + retry guards against races.
/// </summary>
public static class NumberSequence
{
    public static string Next(AccountingSettings s, DocumentSequence type, DateTime date)
    {
        var year = date.Year;
        return type switch
        {
            DocumentSequence.Invoice => Format(s.InvoicePrefix, year, s.NextInvoiceNumber++),
            DocumentSequence.Bill    => Format(s.BillPrefix, year, s.NextBillNumber++),
            DocumentSequence.Journal => Format(s.JournalPrefix, year, s.NextJournalNumber++),
            DocumentSequence.Payment => Format(s.PaymentPrefix, year, s.NextPaymentNumber++),
            _ => throw new ArgumentOutOfRangeException(nameof(type)),
        };
    }

    private static string Format(string prefix, int year, int n) => $"{prefix}-{year}-{n:D4}";
}
