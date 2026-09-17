using FluentValidation;

namespace Xorva.Modules.Tenants.Commands.CreateCompany;

public class CreateCompanyValidator : AbstractValidator<CreateCompanyCommand>
{
    public CreateCompanyValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("Company name is required.")
            .MaximumLength(200).WithMessage("Company name must not exceed 200 characters.");

        RuleFor(x => x.Currency)
            .Length(3).WithMessage("Currency must be a 3-letter ISO 4217 code (e.g. AED, USD).")
            .When(x => !string.IsNullOrEmpty(x.Currency));

        RuleFor(x => x.Timezone)
            .MaximumLength(64).WithMessage("Timezone must be a valid IANA id (e.g. Asia/Dubai).")
            .When(x => !string.IsNullOrEmpty(x.Timezone));
    }
}
