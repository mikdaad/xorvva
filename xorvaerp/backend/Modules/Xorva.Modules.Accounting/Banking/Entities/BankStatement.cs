using Xorva.Core.Entities;
using Xorva.Modules.Accounting.Enums;

namespace Xorva.Modules.Accounting.Banking.Entities;

/// <summary>
/// One imported bank statement file (ported from TrueLedge <c>bank_statements</c>). Rows are
/// created by <c>accounting.import_bank_statement</c>; EF reads them. DDL/RLS in
/// <c>Sql/Accounting/0004_bank_import.sql</c>.
/// </summary>
public class BankStatement : CompanyEntity
{
    public Guid BankAccountId { get; set; }
    public DateOnly? StatementDate { get; set; }
    public DateOnly PeriodFrom { get; set; }
    public DateOnly PeriodTo { get; set; }
    public decimal? OpeningBalance { get; set; }
    public decimal? ClosingBalance { get; set; }
    public decimal TotalDebits { get; set; }
    public decimal TotalCredits { get; set; }
    public int LineCount { get; set; }
    public string? SourceFile { get; set; }
    /// <summary>enbd / adcb / fab / mashreq / rak / dib / unknown (csv parser detection).</summary>
    public string? SourceFormat { get; set; }
    public BankImportStatus ImportStatus { get; set; } = BankImportStatus.Pending;
    /// <summary>JSONB diagnostics from the import RPC (duplicates_skipped, …).</summary>
    public string? ImportErrors { get; set; }
    public DateTime ImportedAt { get; set; }
    public Guid? ImportedBy { get; set; }

    public List<BankStatementLine> Lines { get; set; } = [];
}

/// <summary>A statement row and its matching state (ported from <c>bank_statement_lines</c>).</summary>
public class BankStatementLine : CompanyEntity
{
    public Guid StatementId { get; set; }
    public Guid BankAccountId { get; set; }
    public DateOnly LineDate { get; set; }
    public DateOnly? ValueDate { get; set; }
    public string Description { get; set; } = string.Empty;
    public string? Reference { get; set; }
    public string? ChequeNumber { get; set; }
    /// <summary>Money OUT of the bank (bank's debit column).</summary>
    public decimal Debit { get; set; }
    /// <summary>Money INTO the bank.</summary>
    public decimal Credit { get; set; }
    public decimal? Balance { get; set; }
    /// <summary>Original CSV row (JSONB).</summary>
    public string? RawData { get; set; }
    public int LineNumber { get; set; }

    public BankMatchStatus MatchStatus { get; set; } = BankMatchStatus.Unmatched;
    public Guid? MatchedJournalLineId { get; set; }
    public Guid? MatchedVoucherId { get; set; }
    public Guid? MatchRuleId { get; set; }
    public Guid? SuggestedAccountId { get; set; }
    public Guid? SuggestedContactId { get; set; }
    public DateTime? MatchedAt { get; set; }
    public Guid? MatchedBy { get; set; }
}

/// <summary>Regex rule that auto-suggests an account/contact for statement lines (ported from <c>bank_match_rules</c>).</summary>
public class BankMatchRule : CompanyEntity
{
    public string RuleName { get; set; } = string.Empty;
    public string? Description { get; set; }
    /// <summary>PostgreSQL regex, matched case-insensitively against <see cref="PatternField"/>.</summary>
    public string Pattern { get; set; } = string.Empty;
    public BankMatchPatternField PatternField { get; set; } = BankMatchPatternField.Description;
    public Guid? TargetAccountId { get; set; }
    public Guid? TargetContactId { get; set; }
    /// <summary>Receipt / Payment / Contra / Journal — the voucher the UI pre-fills.</summary>
    public VoucherType? TargetVoucherType { get; set; }
    /// <summary>Lower runs first.</summary>
    public int Priority { get; set; } = 100;
    public bool IsActive { get; set; } = true;
    public int TimesUsed { get; set; }
    public DateTime? LastUsedAt { get; set; }
}
