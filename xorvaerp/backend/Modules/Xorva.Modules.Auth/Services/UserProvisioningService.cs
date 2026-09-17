using Microsoft.EntityFrameworkCore;
using Xorva.Core.Entities;
using Xorva.Core.Enums;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Infrastructure.Data;
using Xorva.Infrastructure.Services;

namespace Xorva.Modules.Auth.Services;

/// <summary>
/// The one place a login gets created. Enforces (1) role hierarchy — a caller may only
/// create lower-privilege users, (2) tenant/company scoping — non-system callers are pinned
/// to their own tenant, a CompanyAdmin to their own company, and (3) platform-wide email
/// uniqueness. Both RegisterUser and CreateEmployee (grant access) route through here.
/// </summary>
public class UserProvisioningService : IUserProvisioningService
{
    private readonly XorvaDbContext _db;
    private readonly PasswordHasher _passwordHasher;
    private readonly ICurrentTenantService _tenant;

    public UserProvisioningService(XorvaDbContext db, PasswordHasher passwordHasher, ICurrentTenantService tenant)
    {
        _db = db;
        _passwordHasher = passwordHasher;
        _tenant = tenant;
    }

    public async Task<ApplicationUser> ProvisionAsync(ProvisionLoginRequest request, CancellationToken ct)
    {
        // ─── Role hierarchy ─────────────────────────────────────
        // SystemAdmin(0) > SuperAdmin(1) > CompanyAdmin(2) > Manager(3) > Employee(4).
        // A caller may only create a role with a HIGHER numeric value (lower privilege).
        if (request.Role <= _tenant.Role)
            throw new ForbiddenException(
                $"You cannot create a user with role '{request.Role}'. " +
                $"Your role '{_tenant.Role}' can only create users with lower privilege.");

        // ─── Tenant/company scoping ─────────────────────────────
        var tenantId = request.TenantId;
        var companyId = request.CompanyId;

        if (_tenant.Role != SystemRole.SystemAdmin)
        {
            tenantId = _tenant.TenantId == Guid.Empty ? null : _tenant.TenantId;
            // CompanyAdmin and Manager can only create users inside their OWN company —
            // never place a user in another company (the SuperAdmin/CEO picks the company).
            if (_tenant.Role is SystemRole.CompanyAdmin or SystemRole.Manager)
                companyId = _tenant.CompanyId == Guid.Empty ? null : _tenant.CompanyId;
        }

        // A non-system caller can only target a company inside their own tenant
        // (the tenant filter makes a foreign company invisible → treated as "not found").
        if (companyId.HasValue && _tenant.Role != SystemRole.SystemAdmin)
        {
            var companyInTenant = await _db.Companies.AnyAsync(c => c.Id == companyId.Value, ct);
            if (!companyInTenant)
                throw new BadRequestException("The specified company does not exist in your organization.");
        }

        // A company-scoped role MUST belong to a company — otherwise the user is orphaned
        // (can't see or manage anything). SuperAdmin/SystemAdmin legitimately span companies.
        var companyScoped = request.Role is SystemRole.CompanyAdmin or SystemRole.Manager or SystemRole.Employee;
        if (companyScoped && !companyId.HasValue)
            throw new BadRequestException(
                "Select a company for this user — a Company Admin, Manager, or Employee must belong to a company.");

        // ─── Email uniqueness (platform-wide — login resolves by email alone) ───
        var email = request.Email.ToLower().Trim();
        var emailExists = await _db.Users.IgnoreQueryFilters().AnyAsync(u => u.Email == email, ct);
        if (emailExists)
            throw new ConflictException("An account with this email address already exists.");

        var user = new ApplicationUser
        {
            Email = email,
            PasswordHash = _passwordHasher.Hash(request.Password),
            FirstName = request.FirstName.Trim(),
            LastName = request.LastName.Trim(),
            Role = request.Role,
            TenantId = tenantId,
            CompanyId = companyId,
            DepartmentId = request.DepartmentId,
            IsActive = true
        };

        _db.Users.Add(user);
        await _db.SaveChangesAsync(ct);
        return user;
    }
}
