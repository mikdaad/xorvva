using MediatR;
using Xorva.Core.Common;
using Xorva.Modules.Approvals.DTOs;

namespace Xorva.Modules.Approvals.Queries.PendingApprovals;

/// <summary>
/// The approver's inbox: pending requests whose CURRENT step this caller can act on.
/// </summary>
public record PendingApprovalsQuery : IRequest<ApiResponse<List<ApprovalRequestDto>>>;
