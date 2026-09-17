using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Ledger.Entities;

namespace Xorva.Modules.Accounting.Ledger.Queries.GetJournal;

public record GetJournalQuery : IRequest<ApiResponse<JournalEntryDto>>
{
    public Guid Id { get; init; }
    public Guid? CompanyId { get; init; }
}

public class GetJournalHandler : IRequestHandler<GetJournalQuery, ApiResponse<JournalEntryDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public GetJournalHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<JournalEntryDto>> Handle(GetJournalQuery request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);

        var entry = await _db.Set<JournalEntry>().Include(e => e.Lines)
            .FirstOrDefaultAsync(e => e.Id == request.Id && e.CompanyId == companyId, ct)
            ?? throw new NotFoundException("Journal entry", request.Id);

        var ids = entry.Lines.Select(l => l.AccountId).Distinct().ToList();
        var accounts = await _db.Set<Account>().Where(a => ids.Contains(a.Id)).ToDictionaryAsync(a => a.Id, ct);

        return ApiResponse<JournalEntryDto>.Ok(entry.ToDto(accounts));
    }
}
