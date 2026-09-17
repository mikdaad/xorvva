using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Infrastructure.Data;
using Xorva.Modules.Tenants.DTOs;

namespace Xorva.Modules.Tenants.Commands.UpdateCompanySettings;

public class UpdateCompanySettingsCommandHandler
    : IRequestHandler<UpdateCompanySettingsCommand, ApiResponse<CompanyDto>>
{
    private readonly XorvaDbContext _db;
    private readonly ICurrentTenantService _tenantService;

    public UpdateCompanySettingsCommandHandler(XorvaDbContext db, ICurrentTenantService tenantService)
    {
        _db = db;
        _tenantService = tenantService;
    }

    public async Task<ApiResponse<CompanyDto>> Handle(
        UpdateCompanySettingsCommand request, CancellationToken cancellationToken)
    {
        // Tenant query filter applies — a company from another tenant is simply "not found"
        var company = await _db.Companies
            .FirstOrDefaultAsync(c => c.Id == request.CompanyId, cancellationToken);

        if (company is null)
            throw new NotFoundException("Company", request.CompanyId);

        // CompanyAdmin may only touch their own company
        if (!_tenantService.HasCrossCompanyAccess && company.Id != _tenantService.CompanyId)
            throw new ForbiddenException("You can only update your own company's settings.");

        company.Name = request.Name.Trim();
        company.Currency = request.Currency.Trim().ToUpper();
        company.Timezone = request.Timezone.Trim();

        await _db.SaveChangesAsync(cancellationToken);

        return ApiResponse<CompanyDto>.Ok(company.ToDto(), "Company settings updated.");
    }
}
