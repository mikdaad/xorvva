using MediatR;
using Xorva.Core.Common;
using Xorva.Modules.Approvals.DTOs;

namespace Xorva.Modules.Approvals.Commands.ApproveRequest;

public record ApproveRequestCommand : IRequest<ApiResponse<ApprovalRequestDto>>
{
    public Guid RequestId { get; init; }
    public string? Comment { get; init; }
}
