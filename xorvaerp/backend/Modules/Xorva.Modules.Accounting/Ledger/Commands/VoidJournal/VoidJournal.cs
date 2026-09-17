using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Enums;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Ledger.Entities;

namespace Xorva.Modules.Accounting.Ledger.Commands.VoidJournal;

/// <summary>Voids a posted journal by posting a balanced REVERSING entry (never deletes).</summary>
public record VoidJournalCommand : IRequest<ApiResponse<JournalEntryDto>>
{
    public Guid Id { get; init; }
    public Guid? CompanyId { get; init; }
    public string? Reason { get; init; }
}

public class VoidJournalHandler : IRequestHandler<VoidJournalCommand, ApiResponse<JournalEntryDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;
    private readonly IJournalPoster _poster;

    public VoidJournalHandler(IXorvaDbContext db, ICurrentTenantService tenant, IJournalPoster poster)
    {
        _db = db;
        _tenant = tenant;
        _poster = poster;
    }

    public async Task<ApiResponse<JournalEntryDto>> Handle(VoidJournalCommand request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);

        var original = await _db.Set<JournalEntry>().Include(e => e.Lines)
            .FirstOrDefaultAsync(e => e.Id == request.Id && e.CompanyId == companyId, ct)
            ?? throw new NotFoundException("Journal entry", request.Id);

        if (original.Status == JournalStatus.Voided)
            throw new BadRequestException("This journal is already voided.");

        var reason = string.IsNullOrWhiteSpace(request.Reason) ? "" : $" — {request.Reason.Trim()}";
        var reversal = new JournalDraft
        {
            CompanyId = companyId,
            Date = original.Date,
            Description = $"Reversal of {original.EntryNumber}{reason}",
            SourceType = JournalSourceType.Reversal,
            SourceId = original.Id,
            Lines = [.. original.Lines.Select(l => new JournalLineDraft
            {
                AccountId = l.AccountId,
                Debit = l.Credit,   // swap sides to reverse
                Credit = l.Debit,
                ContactId = l.ContactId,
                TaxRateId = l.TaxRateId,
                Description = l.Description,
            })],
        };

        var reversalId = await _poster.PostAsync(reversal, ct);
        original.Status = JournalStatus.Voided;
        await _db.SaveChangesAsync(ct);

        var entry = await _db.Set<JournalEntry>().Include(e => e.Lines).FirstAsync(e => e.Id == reversalId, ct);
        var ids = entry.Lines.Select(l => l.AccountId).Distinct().ToList();
        var accounts = await _db.Set<Account>().Where(a => ids.Contains(a.Id)).ToDictionaryAsync(a => a.Id, ct);

        return ApiResponse<JournalEntryDto>.Ok(entry.ToDto(accounts), "Journal voided (reversing entry posted).");
    }
}
