using FluentValidation;

namespace Xorva.Modules.Tenants.Commands.CreateBranch;

public class CreateBranchValidator : AbstractValidator<CreateBranchCommand>
{
    public CreateBranchValidator()
    {
        RuleFor(x => x.CompanyId)
            .NotEmpty().WithMessage("CompanyId is required.");

        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("Branch name is required.")
            .MaximumLength(200).WithMessage("Branch name must not exceed 200 characters.");

        RuleFor(x => x.Address).MaximumLength(500);
        RuleFor(x => x.City).MaximumLength(100);
        RuleFor(x => x.Country).MaximumLength(100);
    }
}
