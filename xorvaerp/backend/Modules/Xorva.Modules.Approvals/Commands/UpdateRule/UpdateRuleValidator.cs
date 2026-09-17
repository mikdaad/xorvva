using FluentValidation;
using Xorva.Core.Enums;

namespace Xorva.Modules.Approvals.Commands.UpdateRule;

public class UpdateRuleValidator : AbstractValidator<UpdateRuleCommand>
{
    private static readonly SystemRole[] Allowed =
        [SystemRole.Manager, SystemRole.CompanyAdmin, SystemRole.SuperAdmin];

    public UpdateRuleValidator()
    {
        RuleFor(x => x.RuleId).NotEmpty();

        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("Rule name is required.")
            .MaximumLength(200);

        RuleFor(x => x.ApproverRoles)
            .NotEmpty().WithMessage("Select 1 to 3 approver roles.")
            .Must(r => r.Count is >= 1 and <= 3).WithMessage("Between 1 and 3 approver steps are allowed.")
            .Must(r => r.Count == r.Distinct().Count()).WithMessage("Approver roles must be distinct.")
            .Must(r => r.All(role => Allowed.Contains(role)))
                .WithMessage("Approvers must be Manager, CompanyAdmin, or CEO.");

        RuleFor(x => x.AmountThreshold)
            .GreaterThan(0).When(x => x.AmountThreshold.HasValue)
            .WithMessage("Amount threshold must be greater than zero.");
    }
}
