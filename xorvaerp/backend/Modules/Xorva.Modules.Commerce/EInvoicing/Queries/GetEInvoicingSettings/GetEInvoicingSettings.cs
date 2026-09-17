using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Entities;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Ledger.Entities;

namespace Xorva.Modules.Accounting.EInvoicing.Queries.GetEInvoicingSettings;

/// <summary>Reads the seller's e-invoicing identity for the active company.</summary>
public record GetEInvoicingSettingsQuery : IRequest<ApiResponse<EInvoicingSettingsDto>>
{
    public Guid? CompanyId { get; init; }
}

public class GetEInvoicingSettingsHandler
    : IRequestHandler<GetEInvoicingSettingsQuery, ApiResponse<EInvoicingSettingsDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public GetEInvoicingSettingsHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<EInvoicingSettingsDto>> Handle(GetEInvoicingSettingsQuery request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);

        var settings = await _db.Set<AccountingSettings>().FirstOrDefaultAsync(s => s.CompanyId == companyId, ct)
            ?? throw new BadRequestException("Accounting is not set up for this company.");

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
        });
    }
}
