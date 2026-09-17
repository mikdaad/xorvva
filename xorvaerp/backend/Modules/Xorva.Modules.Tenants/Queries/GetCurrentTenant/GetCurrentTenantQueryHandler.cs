using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Infrastructure.Data;
using Xorva.Modules.Tenants.DTOs;

namespace Xorva.Modules.Tenants.Queries.GetCurrentTenant;

public class GetCurrentTenantQueryHandler : IRequestHandler<GetCurrentTenantQuery, ApiResponse<TenantDto>>
{
    private readonly XorvaDbContext _db;

    public GetCurrentTenantQueryHandler(XorvaDbContext db)
    {
        _db = db;
    }

    public async Task<ApiResponse<TenantDto>> Handle(GetCurrentTenantQuery request, CancellationToken cancellationToken)
    {
        // Query filter: Id == current TenantId → at most one row, always the caller's own
        var tenant = await _db.Tenants
            .Select(t => new TenantDto
            {
                Id = t.Id,
                Name = t.Name,
                ContactEmail = t.ContactEmail,
                IsActive = t.IsActive,
                CreatedAt = t.CreatedAt,
                CompanyCount = t.Companies.Count,
                OnboardedAt = t.OnboardedAt
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (tenant is null)
            throw new NotFoundException("No tenant context. SystemAdmin accounts are not attached to a tenant.");

        return ApiResponse<TenantDto>.Ok(tenant);
    }
}
