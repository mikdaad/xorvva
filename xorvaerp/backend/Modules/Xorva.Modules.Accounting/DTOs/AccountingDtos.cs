using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Ledger.Entities;

namespace Xorva.Modules.Accounting.DTOs;

public record AccountDto
{
    public Guid Id { get; init; }
    public string Code { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public AccountType AccountType { get; init; }
    public AccountSubType AccountSubType { get; init; }
    public NormalBalance NormalBalance { get; init; }
    public Guid? ParentAccountId { get; init; }
    public string? Description { get; init; }
    public bool IsSystemAccount { get; init; }
    public decimal CurrentBalance { get; init; }
    public bool IsActive { get; init; }
    public int SortOrder { get; init; }
}

public record JournalLineDto
{
    public Guid Id { get; init; }
    public Guid AccountId { get; init; }
    public string? AccountCode { get; init; }
    public string? AccountName { get; init; }
    public decimal Debit { get; init; }
    public decimal Credit { get; init; }
    public Guid? ContactId { get; init; }
    public string? Description { get; init; }
}

public record JournalEntryDto
{
    public Guid Id { get; init; }
    public string EntryNumber { get; init; } = string.Empty;
    public DateTime Date { get; init; }
    public string Description { get; init; } = string.Empty;
    public string SourceType { get; init; } = string.Empty;
    public string Status { get; init; } = string.Empty;
    public decimal TotalDebit { get; init; }
    public decimal TotalCredit { get; init; }
    public List<JournalLineDto> Lines { get; init; } = [];
}

public record JournalEntrySummaryDto
{
    public Guid Id { get; init; }
    public string EntryNumber { get; init; } = string.Empty;
    public DateTime Date { get; init; }
    public string Description { get; init; } = string.Empty;
    public string SourceType { get; init; } = string.Empty;
    public string Status { get; init; } = string.Empty;
    public decimal TotalDebit { get; init; }
    public decimal TotalCredit { get; init; }
}

/// <summary>Entity → DTO mappers (static extensions, same pattern as HR).</summary>
public static class AccountingMappers
{
    public static AccountDto ToDto(this Account a) => new()
    {
        Id = a.Id,
        Code = a.Code,
        Name = a.Name,
        AccountType = a.AccountType,
        AccountSubType = a.AccountSubType,
        NormalBalance = a.NormalBalance,
        ParentAccountId = a.ParentAccountId,
        Description = a.Description,
        IsSystemAccount = a.IsSystemAccount,
        CurrentBalance = a.CurrentBalance,
        IsActive = a.IsActive,
        SortOrder = a.SortOrder
    };

    public static JournalEntrySummaryDto ToSummaryDto(this JournalEntry e) => new()
    {
        Id = e.Id,
        EntryNumber = e.EntryNumber,
        Date = e.Date,
        Description = e.Description,
        SourceType = e.SourceType.ToString(),
        Status = e.Status.ToString(),
        TotalDebit = e.TotalDebit,
        TotalCredit = e.TotalCredit
    };

    /// <summary>Full entry with lines. Pass an account lookup to show code/name on each line.</summary>
    public static JournalEntryDto ToDto(this JournalEntry e, IReadOnlyDictionary<Guid, Account>? accounts = null) => new()
    {
        Id = e.Id,
        EntryNumber = e.EntryNumber,
        Date = e.Date,
        Description = e.Description,
        SourceType = e.SourceType.ToString(),
        Status = e.Status.ToString(),
        TotalDebit = e.TotalDebit,
        TotalCredit = e.TotalCredit,
        Lines = [.. e.Lines.Select(l => new JournalLineDto
        {
            Id = l.Id,
            AccountId = l.AccountId,
            AccountCode = Lookup(accounts, l.AccountId)?.Code,
            AccountName = Lookup(accounts, l.AccountId)?.Name,
            Debit = l.Debit,
            Credit = l.Credit,
            ContactId = l.ContactId,
            Description = l.Description
        })]
    };

    private static Account? Lookup(IReadOnlyDictionary<Guid, Account>? accounts, Guid id)
        => accounts is not null && accounts.TryGetValue(id, out var a) ? a : null;
}
