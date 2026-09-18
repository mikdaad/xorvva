using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Approvals;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Vouchers.Entities;
using Xorva.Modules.Accounting.Vouchers.Queries.GetVoucher;

namespace Xorva.Modules.Accounting.Vouchers.Commands.ReverseVoucher;

/// <summary>
/// Reverses a posted voucher through <c>accounting.reverse_voucher</c>: a mirror-image voucher + journal
/// is posted on <see cref="ReversalDate"/>, the original journal becomes Voided and the voucher Reversed.
/// Nothing is ever deleted — same audit stance as Xorva's VoidJournal.
/// </summary>
public record ReverseVoucherCommand : IRequest<ApiResponse<VoucherDto>>, IAmountApprovableAction
{
    public Guid Id { get; init; }
    public Guid? CompanyId { get; init; }
    public string Reason { get; init; } = string.Empty;
    /// <summary>Defaults to today (UTC). Must be on/after the original voucher date and in an open period.</summary>
    public DateOnly? ReversalDate { get; init; }

    public const string ActionKey = "Accounting.ReverseVoucher";
    public string ApprovalActionKey => ActionKey;
    public string ApprovalSummary => $"Reverse voucher — {Reason}";
    public Guid? ApprovalCompanyId => CompanyId;
    public async Task<decimal> ResolveApprovalAmountAsync(IXorvaDbContext db, CancellationToken ct) =>
        await db.Set<Voucher>().Where(v => v.Id == Id).Select(v => v.BaseTotalAmount).FirstOrDefaultAsync(ct);
}

public class ReverseVoucherValidator : AbstractValidator<ReverseVoucherCommand>
{
    public ReverseVoucherValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Reason).NotEmpty().WithMessage("A reversal reason is required.").MaximumLength(500);
    }
}

public class ReverseVoucherHandler : IRequestHandler<ReverseVoucherCommand, ApiResponse<VoucherDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;
    private readonly IAccountingRpc _rpc;
    private readonly IPartyDirectory _parties;

    public ReverseVoucherHandler(IXorvaDbContext db, ICurrentTenantService tenant, IAccountingRpc rpc, IPartyDirectory parties)
    {
        _db = db;
        _tenant = tenant;
        _rpc = rpc;
        _parties = parties;
    }

    public async Task<ApiResponse<VoucherDto>> Handle(ReverseVoucherCommand request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);

        var voucher = await _db.Set<Voucher>().AsNoTracking()
            .FirstOrDefaultAsync(v => v.Id == request.Id && v.CompanyId == companyId, ct)
            ?? throw new NotFoundException("Voucher", request.Id);
        if (voucher.Status != VoucherStatus.Posted)
            throw new ConflictException($"Only posted vouchers can be reversed — {voucher.VoucherNumber} is {voucher.Status}.");

        var date = request.ReversalDate ?? DateOnly.FromDateTime(DateTime.UtcNow);
        if (date < voucher.VoucherDate)
            throw new BadRequestException("The reversal date cannot be before the original voucher date.");
        await PeriodGuard.EnsureOpenAsync(_db, companyId, date.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc), ct, _tenant.Role);

        var reversalId = await _rpc.ReverseVoucherAsync(voucher.Id, request.Reason.Trim(), date, ct);

        var dto = await VoucherReader.LoadAsync(_db, _parties, reversalId, companyId, ct);
        return ApiResponse<VoucherDto>.Ok(dto, $"{voucher.VoucherNumber} reversed by {dto.VoucherNumber}.");
    }
}
