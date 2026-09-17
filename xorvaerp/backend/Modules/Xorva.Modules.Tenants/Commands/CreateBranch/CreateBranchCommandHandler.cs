using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Entities;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Infrastructure.Data;
using Xorva.Modules.Tenants.DTOs;

namespace Xorva.Modules.Tenants.Commands.CreateBranch;

public class CreateBranchCommandHandler : IRequestHandler<CreateBranchCommand, ApiResponse<BranchDto>>
{
    private readonly XorvaDbContext _db;
    private readonly ICurrentTenantService _tenantService;

    public CreateBranchCommandHandler(XorvaDbContext db, ICurrentTenantService tenantService)
    {
        _db = db;
        _tenantService = tenantService;
    }

    public async Task<ApiResponse<BranchDto>> Handle(CreateBranchCommand request, CancellationToken cancellationToken)
    {
        // CompanyAdmin may only add branches to their own company
        if (!_tenantService.HasCrossCompanyAccess && request.CompanyId != _tenantService.CompanyId)
            throw new ForbiddenException("You can only add branches to your own company.");

        // Tenant filter applies — another tenant's company is "not found", never "forbidden"
        // (a 403 would leak that the id exists)
        var companyExists = await _db.Companies
            .AnyAsync(c => c.Id == request.CompanyId, cancellationToken);

        if (!companyExists)
            throw new NotFoundException("Company", request.CompanyId);

        var name = request.Name.Trim();
        var nameExists = await _db.Branches
            .AnyAsync(b => b.CompanyId == request.CompanyId && b.Name == name, cancellationToken);

        if (nameExists)
            throw new ConflictException($"A branch named '{name}' already exists in this company.");

        var branch = new Branch
        {
            TenantId = _tenantService.TenantId,
            CompanyId = request.CompanyId,
            Name = name,
            Address = request.Address?.Trim(),
            City = request.City?.Trim(),
            Country = request.Country?.Trim()
        };

        _db.Branches.Add(branch);
        await _db.SaveChangesAsync(cancellationToken);

        return ApiResponse<BranchDto>.Ok(branch.ToDto(), "Branch created successfully.");
    }
}
