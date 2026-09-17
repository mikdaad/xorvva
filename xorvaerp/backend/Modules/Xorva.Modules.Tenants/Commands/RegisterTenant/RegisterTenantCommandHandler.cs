using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Constants;
using Xorva.Core.Entities;
using Xorva.Core.Enums;
using Xorva.Core.Exceptions;
using Xorva.Infrastructure.Data;
using Xorva.Infrastructure.Services;
using Xorva.Modules.Tenants.DTOs;

namespace Xorva.Modules.Tenants.Commands.RegisterTenant;

/// <summary>
/// Creates Tenant + first Company + SuperAdmin user in ONE SaveChanges call —
/// a single database transaction. Either the whole organization exists
/// afterwards, or nothing does. No partial signups.
///
/// The response contains no tokens: the frontend performs a normal login next.
/// This keeps the Tenants module fully decoupled from the Auth module.
/// </summary>
public class RegisterTenantCommandHandler : IRequestHandler<RegisterTenantCommand, ApiResponse<TenantSignupResultDto>>
{
    private readonly XorvaDbContext _db;
    private readonly PasswordHasher _passwordHasher;

    public RegisterTenantCommandHandler(XorvaDbContext db, PasswordHasher passwordHasher)
    {
        _db = db;
        _passwordHasher = passwordHasher;
    }

    public async Task<ApiResponse<TenantSignupResultDto>> Handle(
        RegisterTenantCommand request, CancellationToken cancellationToken)
    {
        var email = request.Email.ToLower().Trim();

        // Email is unique platform-wide (login resolves by email alone)
        var emailExists = await _db.Users
            .IgnoreQueryFilters()
            .AnyAsync(u => u.Email == email, cancellationToken);

        if (emailExists)
            throw new ConflictException("An account with this email address already exists.");

        var tenant = new Tenant
        {
            Name = request.TenantName.Trim(),
            ContactEmail = email
        };

        var company = new Company
        {
            TenantId = tenant.Id,
            Name = request.CompanyName.Trim(),
            // Phase 1 ships HR — every new company starts with it active.
            ActiveModules = [ModuleCatalog.HR]
        };

        var superAdmin = new ApplicationUser
        {
            Email = email,
            PasswordHash = _passwordHasher.Hash(request.Password),
            FirstName = request.FirstName.Trim(),
            LastName = request.LastName.Trim(),
            Role = SystemRole.SuperAdmin,
            TenantId = tenant.Id,
            CompanyId = null, // CEO is tenant-wide, not tied to one company
            IsActive = true
        };

        // Organisation-level subscription: the tenant starts subscribed to whatever its
        // first company activates (HR in Phase 1). Companies can only use subscribed modules.
        var subscription = new TenantSubscription
        {
            TenantId = tenant.Id,
            SubscribedModules = company.ActiveModules.ToList()
        };

        _db.Tenants.Add(tenant);
        _db.Companies.Add(company);
        _db.Users.Add(superAdmin);
        _db.TenantSubscriptions.Add(subscription);

        // Single SaveChanges = single transaction = atomic signup
        await _db.SaveChangesAsync(cancellationToken);

        return ApiResponse<TenantSignupResultDto>.Ok(new TenantSignupResultDto
        {
            TenantId = tenant.Id,
            TenantName = tenant.Name,
            CompanyId = company.Id,
            CompanyName = company.Name,
            AdminEmail = superAdmin.Email
        }, "Organization created successfully. You can now sign in.");
    }
}
