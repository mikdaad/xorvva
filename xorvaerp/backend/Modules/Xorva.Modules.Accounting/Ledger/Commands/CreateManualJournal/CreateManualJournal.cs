using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Approvals;
using Xorva.Core.Common;
using Xorva.Core.Enums;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Currency.Common;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Ledger.Entities;

namespace Xorva.Modules.Accounting.Ledger.Commands.CreateManualJournal;

public record ManualJournalLineInput
{
    public Guid AccountId { get; init; }
    public decimal Debit { get; init; }
    public decimal Credit { get; init; }
    public Guid? ContactId { get; init; }
    public string? Description { get; init; }
}

public record CreateManualJournalCommand : IRequest<ApiResponse<JournalEntryDto>>, IAmountApprovableAction
{
    public Guid? CompanyId { get; init; }
    public DateTime Date { get; init; }
    public string Description { get; init; } = string.Empty;
    /// <summary>Currency the debit/credit amounts are entered in (ISO 4217). Defaults to base.</summary>
    public string? Currency { get; init; }
    /// <summary>Optional explicit base-per-foreign rate; when omitted, resolved from the rate table.</summary>
    public decimal? ExchangeRate { get; init; }
    public List<ManualJournalLineInput> Lines { get; init; } = [];

    public const string ActionKey = "Accounting.ManualJournal";
    public string ApprovalActionKey => ActionKey;
    public string ApprovalSummary => $"Manual journal: AED {Lines.Sum(l => l.Debit) * (ExchangeRate ?? 1m):0.00}" + (string.IsNullOrWhiteSpace(Description) ? "" : $" — {Description}");
    public Guid? ApprovalCompanyId => CompanyId;

    // A balanced journal's debit total is its size (converted to base at the entered rate).
    public Task<decimal> ResolveApprovalAmountAsync(IXorvaDbContext db, CancellationToken ct) =>
        Task.FromResult(Lines.Sum(l => l.Debit) * (ExchangeRate ?? 1m));
}

public class CreateManualJournalValidator : AbstractValidator<CreateManualJournalCommand>
{
    public CreateManualJournalValidator()
    {
        RuleFor(x => x.Date).NotEmpty().WithMessage("Journal date is required.");
        RuleFor(x => x.Lines).Must(l => l.Count >= 2).WithMessage("A journal needs at least two lines.");
        RuleForEach(x => x.Lines).ChildRules(line =>
            line.RuleFor(l => l.AccountId).NotEmpty().WithMessage("Each line needs an account."));
    }
}

public class CreateManualJournalHandler : IRequestHandler<CreateManualJournalCommand, ApiResponse<JournalEntryDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;
    private readonly IJournalPoster _poster;

    public CreateManualJournalHandler(IXorvaDbContext db, ICurrentTenantService tenant, IJournalPoster poster)
    {
        _db = db;
        _tenant = tenant;
        _poster = poster;
    }

    public async Task<ApiResponse<JournalEntryDto>> Handle(CreateManualJournalCommand request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        var settings = await _db.Set<AccountingSettings>().FirstOrDefaultAsync(s => s.CompanyId == companyId, ct)
            ?? throw new BadRequestException("Accounting is not set up for this company.");

        // Amounts are entered in the transaction currency; the ledger posts in base at this rate
        // (rate == 1 for base-currency journals, so those are unchanged).
        var currency = ExchangeRateResolver.Normalize(request.Currency, settings.BaseCurrency);
        var rate = await ExchangeRateResolver.ResolveAsync(_db, companyId, currency, settings.BaseCurrency, request.Date, request.ExchangeRate, ct);
        var foreign = rate != 1m;

        var draft = new JournalDraft
        {
            CompanyId = companyId,
            Date = request.Date,
            Description = foreign ? $"{request.Description} ({currency} @ {rate})".Trim() : request.Description,
            SourceType = JournalSourceType.Manual,
            Lines = [.. request.Lines.Select(l => new JournalLineDraft
            {
                AccountId = l.AccountId,
                Debit = Math.Round(l.Debit * rate, 2),
                Credit = Math.Round(l.Credit * rate, 2),
                ContactId = l.ContactId,
                Description = l.Description,
            })],
        };

        var id = await _poster.PostAsync(draft, ct);
        await _db.SaveChangesAsync(ct);

        var entry = await _db.Set<JournalEntry>().Include(e => e.Lines).FirstAsync(e => e.Id == id, ct);
        var ids = entry.Lines.Select(l => l.AccountId).Distinct().ToList();
        var accounts = await _db.Set<Account>().Where(a => ids.Contains(a.Id)).ToDictionaryAsync(a => a.Id, ct);

        return ApiResponse<JournalEntryDto>.Ok(entry.ToDto(accounts), "Journal posted.");
    }
}
