using MediatR;
using Xorva.Core.Common;
using Xorva.Modules.Approvals.DTOs;

namespace Xorva.Modules.Approvals.Commands.RejectRequest;

public record RejectRequestCommand : IRequest<ApiResponse<ApprovalRequestDto>>
{
    public Guid RequestId { get; init; }
    public string? Reason { get; init; }
}
