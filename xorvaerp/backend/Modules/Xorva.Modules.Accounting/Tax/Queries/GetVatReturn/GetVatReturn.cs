using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Ledger.Entities;

namespace Xorva.Modules.Accounting.Tax.Queries.GetVatReturn;

public record VatReturnDto
{
    public DateTime From { get; init; }
    public DateTime To { get; init; }
    public decimal OutputVat { get; init; }   // VAT collected on sales
    public decimal InputVat { get; init; }     // VAT paid on purchases (recoverable)
    public decimal NetPayable { get; init; }   // Output − Input (positive = pay FTA, negative = refund)
}

/// <summary>UAE VAT return: Output VAT − Input VAT over a period, straight from the VAT ledger accounts.</summary>
public record GetVatReturnQuery : IRequest<ApiResponse<VatReturnDto>>
{
    public Guid? CompanyId { get; init; }
    public DateTime? From { get; init; }
    public DateTime? To { get; init; }
}

public class GetVatReturnHandler : IRequestHandler<GetVatReturnQuery, ApiResponse<VatReturnDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public GetVatReturnHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<VatReturnDto>> Handle(GetVatReturnQuery request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        var now = DateTime.UtcNow;
        var fromDate = DateTime.SpecifyKind((request.From ?? new DateTime(now.Year, 1, 1)).Date, DateTimeKind.Utc);
        var toDate = DateTime.SpecifyKind((request.To ?? now).Date, DateTimeKind.Utc);

        var settings = await _db.Set<AccountingSettings>().FirstOrDefaultAsync(s => s.CompanyId == companyId, ct)
            ?? throw new BadRequestException("Accounting is not set up for this company.");

        var rows = await (
            from l in _db.Set<JournalLine>()
            join e in _db.Set<JournalEntry>() on l.JournalEntryId equals e.Id
            where e.CompanyId == companyId && e.Date >= fromDate && e.Date <= toDate
                  && (l.AccountId == settings.VatOutputAccountId || l.AccountId == settings.VatInputAccountId)
            select new { l.AccountId, l.Debit, l.Credit }
        ).ToListAsync(ct);

        // Output VAT is a liability (credit-natural); Input VAT is an asset (debit-natural).
        var outputVat = Math.Round(rows.Where(r => r.AccountId == settings.VatOutputAccountId).Sum(r => r.Credit - r.Debit), 2);
        var inputVat = Math.Round(rows.Where(r => r.AccountId == settings.VatInputAccountId).Sum(r => r.Debit - r.Credit), 2);

        return ApiResponse<VatReturnDto>.Ok(new VatReturnDto
        {
            From = fromDate,
            To = toDate,
            OutputVat = outputVat,
            InputVat = inputVat,
            NetPayable = Math.Round(outputVat - inputVat, 2),
        });
    }
}
