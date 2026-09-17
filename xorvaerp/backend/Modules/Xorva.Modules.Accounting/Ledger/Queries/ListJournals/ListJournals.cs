using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Ledger.Entities;

namespace Xorva.Modules.Accounting.Ledger.Queries.ListJournals;

public record ListJournalsQuery : IRequest<ApiResponse<List<JournalEntrySummaryDto>>>
{
    public Guid? CompanyId { get; init; }
}

public class ListJournalsHandler : IRequestHandler<ListJournalsQuery, ApiResponse<List<JournalEntrySummaryDto>>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public ListJournalsHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<List<JournalEntrySummaryDto>>> Handle(ListJournalsQuery request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);

        var entries = await _db.Set<JournalEntry>()
            .Where(e => e.CompanyId == companyId)
            .OrderByDescending(e => e.Date).ThenByDescending(e => e.EntryNumber)
            .ToListAsync(ct);

        return ApiResponse<List<JournalEntrySummaryDto>>.Ok([.. entries.Select(e => e.ToSummaryDto())]);
    }
}
