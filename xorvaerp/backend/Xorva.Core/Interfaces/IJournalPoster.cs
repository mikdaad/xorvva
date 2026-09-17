using Xorva.Core.Enums;

namespace Xorva.Core.Interfaces;

/// <summary>
/// The double-entry posting contract. Implemented by the Accounting module's JournalPoster
/// and consumed by any module that must record a journal (e.g. HR payroll) WITHOUT
/// referencing Accounting — the same inversion-of-dependency pattern as
/// <see cref="IUserProvisioningService"/>.
///
/// The implementation <b>stages</b> the journal on the current <see cref="IXorvaDbContext"/>;
/// the caller commits (one unit of work with the source document → atomicity).
/// </summary>
public interface IJournalPoster
{
    /// <summary>Validates + stages a balanced journal. Returns the new JournalEntry id.</summary>
    Task<Guid> PostAsync(JournalDraft draft, CancellationToken ct);
}

/// <summary>
/// A balanced set of lines to post. Core-level DTO — carries only account ids and amounts,
/// so no Accounting entity types leak into Core.
/// </summary>
public sealed record JournalDraft
{
    /// <summary>Target company. Null → resolve from the current tenant context.</summary>
    public Guid? CompanyId { get; init; }
    public DateTime Date { get; init; }
    public string Description { get; init; } = string.Empty;
    public JournalSourceType SourceType { get; init; } = JournalSourceType.Manual;
    public Guid? SourceId { get; init; }
    public IReadOnlyList<JournalLineDraft> Lines { get; init; } = [];
}

public sealed record JournalLineDraft
{
    /// <summary>Explicit ledger account. Ignored when <see cref="SystemAccount"/> is set.</summary>
    public Guid AccountId { get; init; }

    /// <summary>
    /// Post to a well-known account resolved per-company (e.g. SalaryExpense). Lets modules
    /// that don't know the chart (HR payroll) still post correctly.
    /// </summary>
    public SystemAccount? SystemAccount { get; init; }

    public decimal Debit { get; init; }
    public decimal Credit { get; init; }
    public Guid? ContactId { get; init; }
    public Guid? TaxRateId { get; init; }
    public string? Description { get; init; }
}
