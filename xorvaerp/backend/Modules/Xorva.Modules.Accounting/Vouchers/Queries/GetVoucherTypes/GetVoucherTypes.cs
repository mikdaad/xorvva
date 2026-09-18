using MediatR;
using Xorva.Core.Common;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Vouchers.Common;

namespace Xorva.Modules.Accounting.Vouchers.Queries.GetVoucherTypes;

/// <summary>The F4–F9 catalogue the entry screen renders its type switcher from.</summary>
public record GetVoucherTypesQuery : IRequest<ApiResponse<List<VoucherTypeDto>>>;

public class GetVoucherTypesHandler : IRequestHandler<GetVoucherTypesQuery, ApiResponse<List<VoucherTypeDto>>>
{
    public Task<ApiResponse<List<VoucherTypeDto>>> Handle(GetVoucherTypesQuery request, CancellationToken ct) =>
        Task.FromResult(ApiResponse<List<VoucherTypeDto>>.Ok([.. VoucherTypes.EntryTypes.Select(t => t.ToDto())]));
}
