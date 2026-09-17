using MediatR;
using Xorva.Core.Common;
using Xorva.Modules.Tenants.DTOs;

namespace Xorva.Modules.Tenants.Queries.ListBranches;

/// <summary>
/// Branches visible to the caller. Branch is company-scoped, so the global
/// query filter already confines non-SuperAdmins to their own company.
/// Optional CompanyId narrows further (useful for SuperAdmin).
/// </summary>
public record ListBranchesQuery : IRequest<ApiResponse<List<BranchDto>>>
{
    public Guid? CompanyId { get; init; }
}
