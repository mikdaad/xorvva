using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Entities;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Infrastructure.Data;
using Xorva.Infrastructure.Modules;
using Xorva.Modules.Tenants.DTOs;

namespace Xorva.Modules.Tenants.Commands.SetTenantSubscriptionModules;

/// <summary>
/// Sets which subscribable modules the tenant pays for (the marketplace action, SuperAdmin
/// only). Dependencies are expanded; unsubscribing a module also removes it from every
/// company that was using it, so a company can never use an unsubscribed module.
/// </summary>
public sealed record SetTenantSubscriptionModulesCommand : IRequest<ApiResponse<TenantSubscriptionDto>>
{
    public List<string> Modules { get; init; } = [];
}

public sealed class SetTenantSubscriptionModulesHandler
    : IRequestHandler<SetTenantSubscriptionModulesCommand, ApiResponse<TenantSubscriptionDto>>
{
    private readonly XorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;
    private readonly ModuleRegistry _modules;

    public SetTenantSubscriptionModulesHandler(XorvaDbContext db, ICurrentTenantService tenant, ModuleRegistry modules)
    {
        _db = db;
        _tenant = tenant;
        _modules = modules;
    }

    public async Task<ApiResponse<TenantSubscriptionDto>> Handle(
        SetTenantSubscriptionModulesCommand request, CancellationToken ct)
    {
        var requested = request.Modules
            .Where(k => !string.IsNullOrWhiteSpace(k)).Select(k => k.Trim()).Distinct().ToList();

        // Only real, subscribable (non-core) modules may be subscribed to.
        var invalid = requested.Where(k => !_modules.Exists(k) || _modules.IsCore(k)).ToList();
        if (invalid.Count > 0)
            throw new BadRequestException(
                $"Cannot subscribe to: {string.Join(", ", invalid)}. " +
                $"Subscribable modules are: {string.Join(", ", _modules.Subscribable.Select(m => m.Key))}.");

        var subscribed = _modules.ExpandWithDependencies(requested)
            .Where(k => !_modules.IsCore(k))
            .OrderBy(k => k)
            .ToList();

        var subscription = await _db.TenantSubscriptions.FirstOrDefaultAsync(ct);
        var previouslySubscribed = subscription?.SubscribedModules.ToHashSet() ?? [];
        if (subscription is null)
        {
            subscription = new TenantSubscription { TenantId = _tenant.TenantId, SubscribedModules = subscribed };
            _db.TenantSubscriptions.Add(subscription);
        }
        else
        {
            subscription.SubscribedModules = subscribed;
        }

        // Keep companies in step with the subscription — SYMMETRICALLY, so the toggle both
        // ways is visible: remove any module the tenant no longer subscribes to, and turn ON
        // newly-subscribed modules across the tenant's companies (subscribing = activating).
        var allowed = subscribed.ToHashSet();
        var newlyAdded = subscribed.Where(k => !previouslySubscribed.Contains(k)).ToList();
        var companies = await _db.Companies.ToListAsync(ct);
        foreach (var company in companies)
        {
            var next = company.ActiveModules.Where(allowed.Contains).ToHashSet();
            foreach (var key in newlyAdded) next.Add(key);
            if (!next.SetEquals(company.ActiveModules))
                company.ActiveModules = next.OrderBy(k => k).ToList();
        }

        await _db.SaveChangesAsync(ct);

        var available = _modules.Subscribable
            .Select(m => new ModuleCatalogEntryDto(m.Key, m.DisplayName, m.Description, m.DependsOn, allowed.Contains(m.Key)))
            .ToList();
        return ApiResponse<TenantSubscriptionDto>.Ok(
            new TenantSubscriptionDto(subscription.PlanKey, subscribed, available),
            "Subscription updated.");
    }
}
