using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Vouchers.Entities;
using Xorva.Modules.Accounting.Vouchers.Queries.GetVoucher;

namespace Xorva.Modules.Accounting.Vouchers.Commands.CancelVoucher;

/// <summary>Cancels a Draft/Submitted voucher that was never posted (its number stays consumed). Posted vouchers must be reversed instead.</summary>
public record CancelVoucherCommand : IRequest<ApiResponse<VoucherDto>>
{
    public Guid Id { get; init; }
    public Guid? CompanyId { get; init; }
    public string? Reason { get; init; }
}

public class CancelVoucherHandler : IRequestHandler<CancelVoucherCommand, ApiResponse<VoucherDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;
    private readonly IPartyDirectory _parties;

    public CancelVoucherHandler(IXorvaDbContext db, ICurrentTenantService tenant, IPartyDirectory parties)
    {
        _db = db;
        _tenant = tenant;
        _parties = parties;
    }

    public async Task<ApiResponse<VoucherDto>> Handle(CancelVoucherCommand request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        var voucher = await _db.Set<Voucher>().FirstOrDefaultAsync(v => v.Id == request.Id && v.CompanyId == companyId, ct)
            ?? throw new NotFoundException("Voucher", request.Id);
        if (voucher.Status is not (VoucherStatus.Draft or VoucherStatus.Submitted))
            throw new ConflictException($"{voucher.VoucherNumber} is {voucher.Status} — only unposted vouchers can be cancelled; reverse posted ones.");

        voucher.Status = VoucherStatus.Cancelled;
        voucher.InternalNotes = string.IsNullOrWhiteSpace(request.Reason) ? voucher.InternalNotes
            : $"{voucher.InternalNotes}\nCancelled: {request.Reason.Trim()}".Trim();
        await _db.SaveChangesAsync(ct);

        return ApiResponse<VoucherDto>.Ok(await VoucherReader.LoadAsync(_db, _parties, voucher.Id, companyId, ct), $"{voucher.VoucherNumber} cancelled.");
    }
}
