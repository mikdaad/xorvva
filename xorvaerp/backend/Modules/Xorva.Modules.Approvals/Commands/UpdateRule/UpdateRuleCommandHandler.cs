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

namespace Xorva.Modules.Approvals.Commands.UpdateRule;

public class UpdateRuleCommandHandler : IRequestHandler<UpdateRuleCommand, ApiResponse<ApprovalRuleDto>>
{
    private readonly XorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;
    private readonly IApprovableActionRegistry _registry;

    public UpdateRuleCommandHandler(
        XorvaDbContext db, ICurrentTenantService tenant, IApprovableActionRegistry registry)
    {
        _db = db;
        _tenant = tenant;
        _registry = registry;
    }

    public async Task<ApiResponse<ApprovalRuleDto>> Handle(
        UpdateRuleCommand request, CancellationToken cancellationToken)
    {
        var rule = await _db.ApprovalRules
            .FirstOrDefaultAsync(r => r.Id == request.RuleId, cancellationToken)
            ?? throw new NotFoundException("Approval rule", request.RuleId);

        // Blocks CompanyAdmin editing another company's rule or a CEO Mandatory rule.
        ApprovalRuleGuards.EnsureCanModify(_tenant, rule);
        ApprovalRuleGuards.EnsureCanSetMandatory(_tenant, request.IsMandatory);

        // An amount threshold only makes sense for actions that expose an amount.
        if (request.AmountThreshold.HasValue && _registry.Find(rule.ActionKey)?.SupportsAmountThreshold != true)
            throw new BadRequestException("This action does not support an amount threshold.");

        rule.Name = request.Name.Trim();
        rule.ApproverRoles = request.ApproverRoles.OrderByDescending(r => (int)r).ToList();
        rule.IsActive = request.IsActive;
        rule.IsMandatory = request.IsMandatory;
        rule.AmountThreshold = request.AmountThreshold;

        _db.ApprovalRuleAudits.Add(new ApprovalRuleAudit
        {
            TenantId = rule.TenantId,
            CompanyId = rule.CompanyId,
            RuleId = rule.Id,
            RuleName = rule.Name,
            ChangeType = "Updated",
            ChangedByUserId = _tenant.UserId,
            ChangedByEmail = _tenant.Email,
            Detail = $"Rule '{rule.Name}' updated (active={rule.IsActive}, steps={rule.ApproverRoles.Count})."
        });

        await _db.SaveChangesAsync(cancellationToken);

        return ApiResponse<ApprovalRuleDto>.Ok(
            rule.ToDto(ApprovalRuleGuards.IsReadOnlyTo(_tenant, rule)), "Approval rule updated.");
    }
}
