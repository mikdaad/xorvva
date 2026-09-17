using FluentValidation;

namespace Xorva.Modules.Tenants.Commands.UpdateCompanySettings;

public class UpdateCompanySettingsValidator : AbstractValidator<UpdateCompanySettingsCommand>
{
    public UpdateCompanySettingsValidator()
    {
        RuleFor(x => x.CompanyId)
            .NotEmpty().WithMessage("CompanyId is required.");

        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("Company name is required.")
            .MaximumLength(200).WithMessage("Company name must not exceed 200 characters.");

        RuleFor(x => x.Currency)
            .NotEmpty().WithMessage("Currency is required.")
            .Length(3).WithMessage("Currency must be a 3-letter ISO 4217 code (e.g. AED, USD).");

        RuleFor(x => x.Timezone)
            .NotEmpty().WithMessage("Timezone is required.")
            .MaximumLength(64).WithMessage("Timezone must be a valid IANA id (e.g. Asia/Dubai).");
    }
}
