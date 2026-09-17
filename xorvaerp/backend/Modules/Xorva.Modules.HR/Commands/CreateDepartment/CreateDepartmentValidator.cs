using FluentValidation;

namespace Xorva.Modules.HR.Commands.CreateDepartment;

public class CreateDepartmentValidator : AbstractValidator<CreateDepartmentCommand>
{
    public CreateDepartmentValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Department name is required.").MaximumLength(100);
        RuleFor(x => x.Code).NotEmpty().WithMessage("Department code is required.").MaximumLength(20);
        RuleFor(x => x.Description).MaximumLength(500);
    }
}
