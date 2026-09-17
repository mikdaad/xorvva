using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Entities;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Infrastructure.Data;
using Xorva.Modules.Approvals.Common;

namespace Xorva.Modules.Approvals.Commands.DeleteRule;

public class DeleteRuleCommandHandler : IRequestHandler<DeleteRuleCommand, ApiResponse>
{
    private readonly XorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public DeleteRuleCommandHandler(XorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse> Handle(DeleteRuleCommand request, CancellationToken cancellationToken)
    {
        var rule = await _db.ApprovalRules
            .FirstOrDefaultAsync(r => r.Id == request.RuleId, cancellationToken)
            ?? throw new NotFoundException("Approval rule", request.RuleId);

        ApprovalRuleGuards.EnsureCanModify(_tenant, rule);

        _db.ApprovalRules.Remove(rule);
        _db.ApprovalRuleAudits.Add(new ApprovalRuleAudit
        {
            TenantId = rule.TenantId,
            CompanyId = rule.CompanyId,
            RuleId = rule.Id,
            RuleName = rule.Name,
            ChangeType = "Deleted",
            ChangedByUserId = _tenant.UserId,
            ChangedByEmail = _tenant.Email,
            Detail = $"Rule '{rule.Name}' deleted. Future '{rule.ActionKey}' actions proceed without approval."
        });

        await _db.SaveChangesAsync(cancellationToken);
        return ApiResponse.Ok("Approval rule deleted.");
    }
}
