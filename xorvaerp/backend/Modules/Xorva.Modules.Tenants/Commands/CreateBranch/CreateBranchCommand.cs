using MediatR;
using Xorva.Core.Approvals;
using Xorva.Core.Common;
using Xorva.Modules.Tenants.DTOs;

namespace Xorva.Modules.Tenants.Commands.CreateBranch;

/// <summary>
/// Add a physical location to a company. CompanyAdmin (own company) or SuperAdmin.
/// Approvable: when a rule exists for "Tenants.CreateBranch" in the target company,
/// this is queued instead of executed immediately.
/// </summary>
public record CreateBranchCommand : IRequest<ApiResponse<BranchDto>>, IApprovableAction
{
    public Guid CompanyId { get; init; }
    public string Name { get; init; } = string.Empty;
    public string? Address { get; init; }
    public string? City { get; init; }
    public string? Country { get; init; }

    // ─── IApprovableAction ──────────────────────────────────────
    public const string ActionKey = "Tenants.CreateBranch";
    public string ApprovalActionKey => ActionKey;
    public string ApprovalSummary => $"Create Branch: {Name}";
    public Guid? ApprovalCompanyId => CompanyId;
}
