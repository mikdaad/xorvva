using Xorva.Core.Entities;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;

namespace Xorva.Modules.Approvals.Common;

/// <summary>
/// Shared permission checks for managing approval rules:
/// - CEO (cross-company) manages rules in any company and owns the Mandatory flag.
/// - CompanyAdmin manages only their own company and cannot set Mandatory.
/// - A CEO-set Mandatory rule is READ-ONLY to a CompanyAdmin.
/// </summary>
internal static class ApprovalRuleGuards
{
    public static void EnsureCanManageCompany(ICurrentTenantService caller, Guid companyId)
    {
        if (!caller.HasCrossCompanyAccess && companyId != caller.CompanyId)
            throw new ForbiddenException("You can only manage approval rules for your own company.");
    }

    public static void EnsureCanModify(ICurrentTenantService caller, ApprovalRule rule)
    {
        EnsureCanManageCompany(caller, rule.CompanyId);

        // Mandatory rules are CEO-owned; a CompanyAdmin can view but not touch them.
        if (rule.IsMandatory && !caller.HasCrossCompanyAccess)
            throw new ForbiddenException("This rule was marked Mandatory by the CEO and cannot be changed.");
    }

    public static void EnsureCanSetMandatory(ICurrentTenantService caller, bool wantsMandatory)
    {
        if (wantsMandatory && !caller.HasCrossCompanyAccess)
            throw new ForbiddenException("Only the CEO can mark a rule as Mandatory.");
    }

    /// <summary>A rule is read-only to the caller when it's Mandatory and they aren't the CEO.</summary>
    public static bool IsReadOnlyTo(ICurrentTenantService caller, ApprovalRule rule) =>
        rule.IsMandatory && !caller.HasCrossCompanyAccess;
}
