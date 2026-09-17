using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Constants;
using Xorva.Core.Entities;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Infrastructure.Data;
using Xorva.Infrastructure.Modules;
using Xorva.Modules.Tenants.Common;
using Xorva.Modules.Tenants.DTOs;

namespace Xorva.Modules.Tenants.Commands.CreateCompany;

public class CreateCompanyCommandHandler : IRequestHandler<CreateCompanyCommand, ApiResponse<CompanyDto>>
{
    private readonly XorvaDbContext _db;
    private readonly ICurrentTenantService _tenantService;
    private readonly ModuleRegistry _modules;

    public CreateCompanyCommandHandler(XorvaDbContext db, ICurrentTenantService tenantService, ModuleRegistry modules)
    {
        _db = db;
        _tenantService = tenantService;
        _modules = modules;
    }

    public async Task<ApiResponse<CompanyDto>> Handle(CreateCompanyCommand request, CancellationToken cancellationToken)
    {
        var name = request.Name.Trim();

        // Company names unique within the tenant (query filter scopes to caller's tenant)
        var nameExists = await _db.Companies.AnyAsync(c => c.Name == name, cancellationToken);
        if (nameExists)
            throw new ConflictException($"A company named '{name}' already exists in your organization.");

        // Validate against installed modules + expand dependencies (Commerce -> Accounting).
        var modules = TenantEntitlements.NormalizeCompanyModules(_modules, request.ActiveModules);
        if (modules.Count == 0) modules = [ModuleCatalog.HR];

        var company = new Company
        {
            TenantId = _tenantService.TenantId,
            Name = name,
            Currency = request.Currency?.Trim().ToUpper() ?? "AED",
            Timezone = request.Timezone?.Trim() ?? "Asia/Dubai",
            ActiveModules = modules
        };

        _db.Companies.Add(company);
        // A company may only use modules its tenant subscribes to — auto-subscribe on use.
        await TenantEntitlements.EnsureSubscribedAsync(_db, _tenantService.TenantId, modules, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);

        return ApiResponse<CompanyDto>.Ok(company.ToDto(), "Company created successfully.");
    }
}
