using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Ledger.Entities;

namespace Xorva.Modules.Accounting.Reports.Queries.GetGeneralLedger;

public record GlLineDto
{
    public DateTime Date { get; init; }
    public string EntryNumber { get; init; } = string.Empty;
    public string Description { get; init; } = string.Empty;
    public decimal Debit { get; init; }
    public decimal Credit { get; init; }
    public decimal Running { get; init; }
}

public record GeneralLedgerDto
{
    public Guid AccountId { get; init; }
    public string Code { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public decimal Opening { get; init; }
    public List<GlLineDto> Lines { get; init; } = [];
    public decimal Closing { get; init; }
}

/// <summary>General Ledger — every movement on one account with a running balance (natural side).</summary>
public record GetGeneralLedgerQuery : IRequest<ApiResponse<GeneralLedgerDto>>
{
    public Guid? CompanyId { get; init; }
    public Guid AccountId { get; init; }
    public DateTime? From { get; init; }
    public DateTime? To { get; init; }
}

public class GetGeneralLedgerHandler : IRequestHandler<GetGeneralLedgerQuery, ApiResponse<GeneralLedgerDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public GetGeneralLedgerHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<GeneralLedgerDto>> Handle(GetGeneralLedgerQuery request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        var now = DateTime.UtcNow;
        var fromDate = DateTime.SpecifyKind((request.From ?? new DateTime(now.Year, 1, 1)).Date, DateTimeKind.Utc);
        var toDate = DateTime.SpecifyKind((request.To ?? now).Date, DateTimeKind.Utc);

        var account = await _db.Set<Account>()
            .FirstOrDefaultAsync(a => a.Id == request.AccountId && a.CompanyId == companyId, ct)
            ?? throw new NotFoundException("Account", request.AccountId);

        var sign = account.NormalBalance == NormalBalance.Debit ? 1 : -1;

        var all = await (
            from l in _db.Set<JournalLine>()
            join e in _db.Set<JournalEntry>() on l.JournalEntryId equals e.Id
            where e.CompanyId == companyId && l.AccountId == account.Id
            orderby e.Date, e.EntryNumber
            select new { e.Date, e.EntryNumber, e.Description, l.Debit, l.Credit }
        ).ToListAsync(ct);

        var opening = Math.Round(all.Where(x => x.Date < fromDate).Sum(x => (x.Debit - x.Credit) * sign), 2);

        var running = opening;
        var lines = new List<GlLineDto>();
        foreach (var x in all.Where(x => x.Date >= fromDate && x.Date <= toDate))
        {
            running = Math.Round(running + (x.Debit - x.Credit) * sign, 2);
            lines.Add(new GlLineDto
            {
                Date = x.Date,
                EntryNumber = x.EntryNumber,
                Description = x.Description,
                Debit = x.Debit,
                Credit = x.Credit,
                Running = running,
            });
        }

        return ApiResponse<GeneralLedgerDto>.Ok(new GeneralLedgerDto
        {
            AccountId = account.Id,
            Code = account.Code,
            Name = account.Name,
            Opening = opening,
            Lines = lines,
            Closing = running,
        });
    }
}
