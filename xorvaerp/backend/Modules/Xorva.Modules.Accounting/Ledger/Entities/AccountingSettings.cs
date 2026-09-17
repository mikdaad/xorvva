using Xorva.Core.Entities;

namespace Xorva.Modules.Accounting.Ledger.Entities;

/// <summary>
/// One row per company — the <b>posting map</b> that tells every auto-journal which
/// account to hit, plus the document number sequences. Seeded when the chart of
/// accounts is created (each template knows its own system-account codes).
/// </summary>
public class AccountingSettings : CompanyEntity
{
    public string BaseCurrency { get; set; } = "AED";

    // ── Seller identity for e-invoicing (UBL / PINT AE) ──
    /// <summary>Registered legal name shown on the e-invoice. Falls back to the company name when blank.</summary>
    public string? LegalName { get; set; }
    /// <summary>Seller Tax Registration Number (TRN) — mandatory on a UAE tax invoice.</summary>
    public string? TaxRegistrationNumber { get; set; }
    public string? AddressLine { get; set; }
    public string? City { get; set; }
    /// <summary>ISO 3166-1 alpha-2 country code (UAE = "AE").</summary>
    public string CountryCode { get; set; } = "AE";

    // ── Default posting accounts ──
    public Guid ReceivableAccountId { get; set; }      // AR — customers owe us
    public Guid PayableAccountId { get; set; }         // AP — we owe suppliers
    public Guid SalesAccountId { get; set; }           // default revenue
    public Guid PurchaseAccountId { get; set; }        // default expense / COGS
    public Guid VatOutputAccountId { get; set; }       // VAT collected on sales (payable)
    public Guid VatInputAccountId { get; set; }        // VAT paid on purchases (recoverable)
    public Guid DefaultBankAccountId { get; set; }     // where cash lands
    public Guid CashAccountId { get; set; }
    public Guid RetainedEarningsAccountId { get; set; }// year-end close target
    public Guid RoundingAccountId { get; set; }        // rounding differences
    public Guid SalaryExpenseAccountId { get; set; }   // payroll expense
    public Guid SalaryPayableAccountId { get; set; }   // payroll liability
    public Guid FxGainLossAccountId { get; set; }           // realized foreign-exchange gain/loss
    public Guid UnrealizedFxGainLossAccountId { get; set; }  // period-end revaluation of open balances

    // ── Number sequences (prefix + fiscal year + zero-padded counter) ──
    public string InvoicePrefix { get; set; } = "INV";
    public string BillPrefix { get; set; } = "BILL";
    public string JournalPrefix { get; set; } = "JV";
    public string PaymentPrefix { get; set; } = "PMT";
    public int NextInvoiceNumber { get; set; } = 1;
    public int NextBillNumber { get; set; } = 1;
    public int NextJournalNumber { get; set; } = 1;
    public int NextPaymentNumber { get; set; } = 1;
}
