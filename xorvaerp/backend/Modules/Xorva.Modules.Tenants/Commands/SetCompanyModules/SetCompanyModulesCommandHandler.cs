using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Infrastructure.Data;
using Xorva.Infrastructure.Modules;
using Xorva.Modules.Tenants.Common;
using Xorva.Modules.Tenants.DTOs;

namespace Xorva.Modules.Tenants.Commands.SetCompanyModules;

public class SetCompanyModulesCommandHandler
    : IRequestHandler<SetCompanyModulesCommand, ApiResponse<CompanyDto>>
{
    private readonly XorvaDbContext _db;
    private readonly ModuleRegistry _modules;

    public SetCompanyModulesCommandHandler(XorvaDbContext db, ModuleRegistry modules)
    {
        _db = db;
        _modules = modules;
    }

    public async Task<ApiResponse<CompanyDto>> Handle(
        SetCompanyModulesCommand request, CancellationToken cancellationToken)
    {
        // Controller enforces SuperAdmin; tenant query filter scopes to caller's tenant
        var company = await _db.Companies
            .FirstOrDefaultAsync(c => c.Id == request.CompanyId, cancellationToken);

        if (company is null)
            throw new NotFoundException("Company", request.CompanyId);

        // Validate against installed modules + expand dependencies (Commerce -> Accounting).
        var modules = TenantEntitlements.NormalizeCompanyModules(_modules, request.Modules);
        if (modules.Count == 0)
            throw new BadRequestException("At least one module must be active.");

        company.ActiveModules = modules;
        // The tenant must subscribe to whatever its companies use — auto-subscribe on use.
        await TenantEntitlements.EnsureSubscribedAsync(_db, company.TenantId, modules, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);

        return ApiResponse<CompanyDto>.Ok(company.ToDto(), "Company modules updated.");
    }
}
