using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.CostCentres.Entities;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Ledger.Entities;
using Xorva.Modules.Accounting.Vouchers.Entities;

namespace Xorva.Modules.Accounting.Vouchers.Queries.GetVoucher;

/// <summary>One voucher with its lines (account names, cost centre names, linked journal number).</summary>
public record GetVoucherQuery : IRequest<ApiResponse<VoucherDto>>
{
    public Guid Id { get; init; }
    public Guid? CompanyId { get; init; }
}

public class GetVoucherHandler : IRequestHandler<GetVoucherQuery, ApiResponse<VoucherDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;
    private readonly IPartyDirectory _parties;

    public GetVoucherHandler(IXorvaDbContext db, ICurrentTenantService tenant, IPartyDirectory parties)
    {
        _db = db;
        _tenant = tenant;
        _parties = parties;
    }

    public async Task<ApiResponse<VoucherDto>> Handle(GetVoucherQuery request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        return ApiResponse<VoucherDto>.Ok(await VoucherReader.LoadAsync(_db, _parties, request.Id, companyId, ct));
    }
}

/// <summary>Shared DTO loader so command handlers can return the same shape without going back through MediatR.</summary>
public static class VoucherReader
{
    public static async Task<VoucherDto> LoadAsync(IXorvaDbContext _db, IPartyDirectory parties, Guid id, Guid companyId, CancellationToken ct)
    {
        var voucher = await _db.Set<Voucher>().AsNoTracking().Include(v => v.Lines)
            .FirstOrDefaultAsync(v => v.Id == id && v.CompanyId == companyId, ct)
            ?? throw new NotFoundException("Voucher", id);

        var accountIds = voucher.Lines.Select(l => l.AccountId).Distinct().ToList();
        var accounts = await _db.Set<Account>().AsNoTracking()
            .Where(a => accountIds.Contains(a.Id)).Select(a => new { a.Id, a.Code, a.Name }).ToDictionaryAsync(a => a.Id, ct);

        var ccIds = voucher.Lines.Where(l => l.CostCentreId.HasValue).Select(l => l.CostCentreId!.Value).Distinct().ToList();
        var ccs = ccIds.Count == 0 ? new Dictionary<Guid, string>()
            : await _db.Set<CostCentre>().AsNoTracking().Where(c => ccIds.Contains(c.Id)).ToDictionaryAsync(c => c.Id, c => c.Name, ct);

        string? contactName = voucher.ContactId is { } cid
            ? (await parties.PartyNamesAsync([cid], ct)).GetValueOrDefault(cid)
            : null;
        string? entryNumber = voucher.JournalEntryId is { } jid
            ? await _db.Set<JournalEntry>().AsNoTracking().Where(e => e.Id == jid).Select(e => e.EntryNumber).FirstOrDefaultAsync(ct)
            : null;

        var lines = voucher.Lines.Select(l =>
        {
            accounts.TryGetValue(l.AccountId, out var acc);
            return l.ToDto(acc?.Code, acc?.Name, l.CostCentreId is { } c && ccs.TryGetValue(c, out var n) ? n : null);
        });

        return voucher.ToDto(lines, contactName, entryNumber);
    }
}
