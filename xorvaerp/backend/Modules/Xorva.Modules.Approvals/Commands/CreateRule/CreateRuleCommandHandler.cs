using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Approvals;
using Xorva.Core.Common;
using Xorva.Core.Entities;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Infrastructure.Data;
using Xorva.Modules.Approvals.Common;
using Xorva.Modules.Approvals.DTOs;

namespace Xorva.Modules.Approvals.Commands.CreateRule;

public class CreateRuleCommandHandler : IRequestHandler<CreateRuleCommand, ApiResponse<ApprovalRuleDto>>
{
    private readonly XorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;
    private readonly IApprovableActionRegistry _registry;

    public CreateRuleCommandHandler(
        XorvaDbContext db, ICurrentTenantService tenant, IApprovableActionRegistry registry)
    {
        _db = db;
        _tenant = tenant;
        _registry = registry;
    }

    public async Task<ApiResponse<ApprovalRuleDto>> Handle(
        CreateRuleCommand request, CancellationToken cancellationToken)
    {
        ApprovalRuleGuards.EnsureCanManageCompany(_tenant, request.CompanyId);
        ApprovalRuleGuards.EnsureCanSetMandatory(_tenant, request.IsMandatory);

        // Company must be in the caller's tenant.
        var company = await _db.Companies
            .FirstOrDefaultAsync(c => c.Id == request.CompanyId, cancellationToken)
            ?? throw new NotFoundException("Company", request.CompanyId);

        // Action must be a registered, available action for this company.
        var descriptor = _registry.Find(request.ActionKey)
            ?? throw new BadRequestException($"Unknown action '{request.ActionKey}'.");
        if (descriptor.RequiresModuleActivation && !company.ActiveModules.Contains(descriptor.Module))
            throw new BadRequestException(
                $"The '{descriptor.Module}' module is not active for this company.");

        // An amount threshold only makes sense for actions that expose an amount.
        if (request.AmountThreshold.HasValue && !descriptor.SupportsAmountThreshold)
            throw new BadRequestException("This action does not support an amount threshold.");

        // Decision 3: at most one ACTIVE rule per (company, action).
        var duplicate = await _db.ApprovalRules.AnyAsync(r =>
            r.CompanyId == request.CompanyId &&
            r.ActionKey == request.ActionKey &&
            r.IsActive, cancellationToken);
        if (duplicate)
            throw new ConflictException(
                "An active rule already exists for this action in this company. Edit or deactivate it first.");

        var rule = new ApprovalRule
        {
            TenantId = _tenant.TenantId,
            CompanyId = request.CompanyId,
            Name = request.Name.Trim(),
            Module = descriptor.Module,
            ActionKey = descriptor.ActionKey,
            // Store lowest-privilege first (Manager → CompanyAdmin → CEO) — sequential order.
            ApproverRoles = request.ApproverRoles.OrderByDescending(r => (int)r).ToList(),
            IsActive = request.IsActive,
            IsMandatory = request.IsMandatory,
            AmountThreshold = request.AmountThreshold
        };

        _db.ApprovalRules.Add(rule);
        _db.ApprovalRuleAudits.Add(Audit(rule, "Created", $"Rule '{rule.Name}' created for {rule.ActionKey}."));
        await _db.SaveChangesAsync(cancellationToken);

        return ApiResponse<ApprovalRuleDto>.Ok(
            rule.ToDto(ApprovalRuleGuards.IsReadOnlyTo(_tenant, rule)), "Approval rule created.");
    }

    private ApprovalRuleAudit Audit(ApprovalRule rule, string change, string detail) => new()
    {
        TenantId = rule.TenantId,
        CompanyId = rule.CompanyId,
        RuleId = rule.Id,
        RuleName = rule.Name,
        ChangeType = change,
        ChangedByUserId = _tenant.UserId,
        ChangedByEmail = _tenant.Email,
        Detail = detail
    };
}
