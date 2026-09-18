using Xorva.Modules.Accounting.Banking.Entities;
using Xorva.Modules.Accounting.Banking.Import;
using Xorva.Modules.Accounting.Enums;

namespace Xorva.Modules.Accounting.DTOs;

/// <summary>Dry-run result of parsing a CSV — what the import screen previews before committing.</summary>
public record BankCsvPreviewDto
{
    public bool Success { get; init; }
    public string BankFormat { get; init; } = "unknown";
    public List<string> Headers { get; init; } = [];
    public int LineCount { get; init; }
    public int SkippedRows { get; init; }
    public List<string> Errors { get; init; } = [];
    public DateOnly? PeriodFrom { get; init; }
    public DateOnly? PeriodTo { get; init; }
    public decimal TotalDebits { get; init; }
    public decimal TotalCredits { get; init; }
    /// <summary>First rows for the preview grid (max 20).</summary>
    public List<BankCsvPreviewLineDto> Sample { get; init; } = [];
}

public record BankCsvPreviewLineDto
{
    public DateOnly LineDate { get; init; }
    public DateOnly? ValueDate { get; init; }
    public string Description { get; init; } = string.Empty;
    public string? Reference { get; init; }
    public string? ChequeNumber { get; init; }
    public decimal Debit { get; init; }
    public decimal Credit { get; init; }
    public decimal? Balance { get; init; }
}

public record BankStatementDto
{
    public Guid Id { get; init; }
    public Guid BankAccountId { get; init; }
    public string? BankAccountName { get; init; }
    public DateOnly? StatementDate { get; init; }
    public DateOnly PeriodFrom { get; init; }
    public DateOnly PeriodTo { get; init; }
    public decimal? OpeningBalance { get; init; }
    public decimal? ClosingBalance { get; init; }
    public decimal TotalDebits { get; init; }
    public decimal TotalCredits { get; init; }
    public int LineCount { get; init; }
    public string? SourceFile { get; init; }
    public string? SourceFormat { get; init; }
    public BankImportStatus ImportStatus { get; init; }
    public string? ImportErrors { get; init; }
    public DateTime ImportedAt { get; init; }
    public int MatchedCount { get; init; }
    public int SuggestedCount { get; init; }
    public int UnmatchedCount { get; init; }
    public int IgnoredCount { get; init; }
}

public record BankStatementLineDto
{
    public Guid Id { get; init; }
    public Guid StatementId { get; init; }
    public int LineNumber { get; init; }
    public DateOnly LineDate { get; init; }
    public DateOnly? ValueDate { get; init; }
    public string Description { get; init; } = string.Empty;
    public string? Reference { get; init; }
    public string? ChequeNumber { get; init; }
    public decimal Debit { get; init; }
    public decimal Credit { get; init; }
    public decimal? Balance { get; init; }
    public BankMatchStatus MatchStatus { get; init; }
    public Guid? MatchedJournalLineId { get; init; }
    public Guid? MatchedVoucherId { get; init; }
    public string? MatchedEntryNumber { get; init; }
    public string? MatchedDescription { get; init; }
    public Guid? MatchRuleId { get; init; }
    public string? MatchRuleName { get; init; }
    public Guid? SuggestedAccountId { get; init; }
    public string? SuggestedAccountName { get; init; }
    public Guid? SuggestedContactId { get; init; }
    public DateTime? MatchedAt { get; init; }
}

public record BankStatementDetailDto
{
    public BankStatementDto Statement { get; init; } = new();
    public List<BankStatementLineDto> Lines { get; init; } = [];
}

/// <summary>Unreconciled GL lines on the bank's ledger account — candidates for a manual match.</summary>
public record BankMatchCandidateDto
{
    public Guid JournalLineId { get; init; }
    public Guid JournalEntryId { get; init; }
    public string EntryNumber { get; init; } = string.Empty;
    public DateTime Date { get; init; }
    public string? Description { get; init; }
    public decimal Debit { get; init; }
    public decimal Credit { get; init; }
    public Guid? ContactId { get; init; }
}

public record BankMatchRuleDto
{
    public Guid Id { get; init; }
    public string RuleName { get; init; } = string.Empty;
    public string? Description { get; init; }
    public string Pattern { get; init; } = string.Empty;
    public BankMatchPatternField PatternField { get; init; }
    public Guid? TargetAccountId { get; init; }
    public Guid? TargetContactId { get; init; }
    public VoucherType? TargetVoucherType { get; init; }
    public int Priority { get; init; }
    public bool IsActive { get; init; }
    public int TimesUsed { get; init; }
    public DateTime? LastUsedAt { get; init; }
}

public static class BankImportMappers
{
    public static BankCsvPreviewDto ToPreviewDto(this BankCsvParseResult r) => new()
    {
        Success = r.Success, BankFormat = r.BankFormat, Headers = [.. r.Headers], LineCount = r.Lines.Count, SkippedRows = r.SkippedRows,
        Errors = [.. r.Errors], PeriodFrom = r.PeriodFrom, PeriodTo = r.PeriodTo, TotalDebits = r.TotalDebits, TotalCredits = r.TotalCredits,
        Sample = [.. r.Lines.Take(20).Select(l => new BankCsvPreviewLineDto
        {
            LineDate = l.LineDate, ValueDate = l.ValueDate, Description = l.Description, Reference = l.Reference,
            ChequeNumber = l.ChequeNumber, Debit = l.Debit, Credit = l.Credit, Balance = l.Balance,
        })],
    };

    public static BankStatementDto ToDto(this BankStatement s, string? bankAccountName, int matched, int suggested, int unmatched, int ignored) => new()
    {
        Id = s.Id, BankAccountId = s.BankAccountId, BankAccountName = bankAccountName, StatementDate = s.StatementDate,
        PeriodFrom = s.PeriodFrom, PeriodTo = s.PeriodTo, OpeningBalance = s.OpeningBalance, ClosingBalance = s.ClosingBalance,
        TotalDebits = s.TotalDebits, TotalCredits = s.TotalCredits, LineCount = s.LineCount, SourceFile = s.SourceFile, SourceFormat = s.SourceFormat,
        ImportStatus = s.ImportStatus, ImportErrors = s.ImportErrors, ImportedAt = s.ImportedAt,
        MatchedCount = matched, SuggestedCount = suggested, UnmatchedCount = unmatched, IgnoredCount = ignored,
    };

    public static BankStatementLineDto ToDto(this BankStatementLine l, string? matchedEntryNumber = null, string? matchedDescription = null,
        string? ruleName = null, string? suggestedAccountName = null) => new()
    {
        Id = l.Id, StatementId = l.StatementId, LineNumber = l.LineNumber, LineDate = l.LineDate, ValueDate = l.ValueDate,
        Description = l.Description, Reference = l.Reference, ChequeNumber = l.ChequeNumber, Debit = l.Debit, Credit = l.Credit, Balance = l.Balance,
        MatchStatus = l.MatchStatus, MatchedJournalLineId = l.MatchedJournalLineId, MatchedVoucherId = l.MatchedVoucherId,
        MatchedEntryNumber = matchedEntryNumber, MatchedDescription = matchedDescription,
        MatchRuleId = l.MatchRuleId, MatchRuleName = ruleName, SuggestedAccountId = l.SuggestedAccountId, SuggestedAccountName = suggestedAccountName,
        SuggestedContactId = l.SuggestedContactId, MatchedAt = l.MatchedAt,
    };

    public static BankMatchRuleDto ToDto(this BankMatchRule r) => new()
    {
        Id = r.Id, RuleName = r.RuleName, Description = r.Description, Pattern = r.Pattern, PatternField = r.PatternField,
        TargetAccountId = r.TargetAccountId, TargetContactId = r.TargetContactId, TargetVoucherType = r.TargetVoucherType,
        Priority = r.Priority, IsActive = r.IsActive, TimesUsed = r.TimesUsed, LastUsedAt = r.LastUsedAt,
    };
}
