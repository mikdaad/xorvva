using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Enums;
using Xorva.Core.Interfaces;
using Xorva.Infrastructure.Data;
using Xorva.Modules.Auth.DTOs;

namespace Xorva.Modules.Auth.Queries.GetUsersByRole;

/// <summary>
/// Returns paginated user list scoped by the caller's role:
/// - SystemAdmin: sees all users across all tenants
/// - SuperAdmin: sees all users in their tenant (all companies)
/// - CompanyAdmin: sees only users in their company
/// - Manager: sees only users in their department
/// - Employee: cannot list users (blocked at controller level)
/// </summary>
public class GetUsersByRoleQueryHandler : IRequestHandler<GetUsersByRoleQuery, ApiResponse<PagedResult<UserDto>>>
{
    private readonly XorvaDbContext _db;
    private readonly ICurrentTenantService _tenantService;

    public GetUsersByRoleQueryHandler(XorvaDbContext db, ICurrentTenantService tenantService)
    {
        _db = db;
        _tenantService = tenantService;
    }

    public async Task<ApiResponse<PagedResult<UserDto>>> Handle(
        GetUsersByRoleQuery request, CancellationToken cancellationToken)
    {
        var query = _db.Users.IgnoreQueryFilters().AsQueryable();

        // ─── Role-based scoping ─────────────────────────────────
        switch (_tenantService.Role)
        {
            case SystemRole.SystemAdmin:
                // Can see everything — no filter
                break;

            case SystemRole.SuperAdmin:
                // See all users in their tenant
                query = query.Where(u => u.TenantId == _tenantService.TenantId);
                break;

            case SystemRole.CompanyAdmin:
                // See only users in their company
                query = query.Where(u => u.TenantId == _tenantService.TenantId &&
                                        u.CompanyId == _tenantService.CompanyId);
                break;

            case SystemRole.Manager:
                // A Manager manages Employees only, within their company.
                query = query.Where(u => u.TenantId == _tenantService.TenantId &&
                                        u.CompanyId == _tenantService.CompanyId &&
                                        u.Role == SystemRole.Employee);
                break;

            default:
                // Employee or unknown — return empty
                return ApiResponse<PagedResult<UserDto>>.Ok(
                    PagedResult<UserDto>.Create([], 0, request.Page, request.PageSize));
        }

        // ─── Optional role filter ───────────────────────────────
        if (request.Role.HasValue)
        {
            query = query.Where(u => u.Role == request.Role.Value);
        }

        // ─── Search by name or email ────────────────────────────
        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var search = request.Search.ToLower().Trim();
            query = query.Where(u =>
                u.Email.ToLower().Contains(search) ||
                u.FirstName.ToLower().Contains(search) ||
                u.LastName.ToLower().Contains(search));
        }

        // ─── Pagination ─────────────────────────────────────────
        var totalCount = await query.CountAsync(cancellationToken);
        var users = await query
            .OrderBy(u => u.FirstName).ThenBy(u => u.LastName)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(u => u.ToDto())
            .ToListAsync(cancellationToken);

        return ApiResponse<PagedResult<UserDto>>.Ok(
            PagedResult<UserDto>.Create(users, totalCount, request.Page, request.PageSize));
    }
}
