using MediatR;
using Xorva.Core.Common;
using Xorva.Modules.Approvals.DTOs;

namespace Xorva.Modules.Approvals.Queries.ApprovalHistory;

/// <summary>
/// Full audit trail of approval requests (all statuses) in the caller's scope.
/// </summary>
public record ApprovalHistoryQuery : IRequest<ApiResponse<List<ApprovalRequestDto>>>;
