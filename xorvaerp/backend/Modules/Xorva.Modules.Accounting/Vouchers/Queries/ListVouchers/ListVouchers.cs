using FluentValidation;
using MediatR;
using Xorva.Core.Common;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Enums;

namespace Xorva.Modules.Accounting.Vouchers.Queries.ListVouchers;

/// <summary>
/// Transaction register (TrueLedge "Day Book") — pages through <c>accounting.get_transaction_register</c>
/// with date / type / status / party / free-text filters. SystemAdmin/TenantAdmin may pass no CompanyId
/// to see every company in the tenant.
/// </summary>
public record ListVouchersQuery : IRequest<ApiResponse<VoucherRegisterDto>>
{
    public Guid? CompanyId { get; init; }
    public DateOnly? From { get; init; }
    public DateOnly? To { get; init; }
    public VoucherType? VoucherType { get; init; }
    public VoucherStatus? Status { get; init; }
    public Guid? ContactId { get; init; }
    /// <summary>Matches voucher number, reference, narration or party name.</summary>
    public string? Search { get; init; }
    public int Limit { get; init; } = 50;
    public int Offset { get; init; }
}

public class ListVouchersValidator : AbstractValidator<ListVouchersQuery>
{
    public ListVouchersValidator()
    {
        RuleFor(x => x.Limit).InclusiveBetween(1, 500);
        RuleFor(x => x.Offset).GreaterThanOrEqualTo(0);
        RuleFor(x => x.Search).MaximumLength(100);
        RuleFor(x => x).Must(x => x.From is null || x.To is null || x.From <= x.To).WithMessage("'From' must be on or before 'To'.");
    }
}

public class ListVouchersHandler : IRequestHandler<ListVouchersQuery, ApiResponse<VoucherRegisterDto>>
{
    private readonly ICurrentTenantService _tenant;
    private readonly IAccountingRpc _rpc;

    public ListVouchersHandler(ICurrentTenantService tenant, IAccountingRpc rpc)
    {
        _tenant = tenant;
        _rpc = rpc;
    }

    public async Task<ApiResponse<VoucherRegisterDto>> Handle(ListVouchersQuery request, CancellationToken ct)
    {
        var scope = AccountingGuard.ResolveReportScope(_tenant, request.CompanyId);
        var rows = await _rpc.GetTransactionRegisterAsync(scope, request.From, request.To, request.VoucherType, request.Status,
            request.ContactId, string.IsNullOrWhiteSpace(request.Search) ? null : request.Search.Trim(), request.Limit, request.Offset, ct);

        return ApiResponse<VoucherRegisterDto>.Ok(new VoucherRegisterDto
        {
            Rows = [.. rows.Select(r => r.ToDto())],
            TotalCount = rows.Count > 0 ? rows[0].TotalCount : 0,
            TotalBaseAmount = rows.Count > 0 ? rows[0].TotalBaseAmount : 0m,
            Limit = request.Limit,
            Offset = request.Offset,
        });
    }
}
