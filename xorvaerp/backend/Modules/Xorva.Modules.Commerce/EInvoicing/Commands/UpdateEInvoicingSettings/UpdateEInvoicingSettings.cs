using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Entities;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Ledger.Entities;

namespace Xorva.Modules.Accounting.EInvoicing.Commands.UpdateEInvoicingSettings;

/// <summary>Updates the seller tax identity used to generate e-invoices.</summary>
public record UpdateEInvoicingSettingsCommand : IRequest<ApiResponse<EInvoicingSettingsDto>>
{
    public Guid? CompanyId { get; init; }
    public string? LegalName { get; init; }
    public string? TaxRegistrationNumber { get; init; }
    public string? AddressLine { get; init; }
    public string? City { get; init; }
    public string CountryCode { get; init; } = "AE";
}

public class UpdateEInvoicingSettingsValidator : AbstractValidator<UpdateEInvoicingSettingsCommand>
{
    public UpdateEInvoicingSettingsValidator()
    {
        RuleFor(x => x.CountryCode)
            .NotEmpty().WithMessage("Country code is required.")
            .Length(2).WithMessage("Use the 2-letter ISO country code (e.g. AE).");
        RuleFor(x => x.LegalName).MaximumLength(200);
        RuleFor(x => x.TaxRegistrationNumber).MaximumLength(30);
        RuleFor(x => x.AddressLine).MaximumLength(200);
        RuleFor(x => x.City).MaximumLength(100);
    }
}

public class UpdateEInvoicingSettingsHandler
    : IRequestHandler<UpdateEInvoicingSettingsCommand, ApiResponse<EInvoicingSettingsDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public UpdateEInvoicingSettingsHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<EInvoicingSettingsDto>> Handle(UpdateEInvoicingSettingsCommand request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);

        var settings = await _db.Set<AccountingSettings>().FirstOrDefaultAsync(s => s.CompanyId == companyId, ct)
            ?? throw new BadRequestException("Accounting is not set up for this company.");

        settings.LegalName = request.LegalName?.Trim();
        settings.TaxRegistrationNumber = request.TaxRegistrationNumber?.Trim();
        settings.AddressLine = request.AddressLine?.Trim();
        settings.City = request.City?.Trim();
        settings.CountryCode = request.CountryCode.Trim().ToUpperInvariant();

        await _db.SaveChangesAsync(ct);

        var companyName = await _db.Set<Company>().Where(c => c.Id == companyId)
            .Select(c => c.Name).FirstOrDefaultAsync(ct) ?? string.Empty;

        return ApiResponse<EInvoicingSettingsDto>.Ok(new EInvoicingSettingsDto
        {
            LegalName = settings.LegalName,
            TaxRegistrationNumber = settings.TaxRegistrationNumber,
            AddressLine = settings.AddressLine,
            City = settings.City,
            CountryCode = settings.CountryCode,
            CompanyName = companyName,
        }, "E-invoicing settings saved.");
    }
}
