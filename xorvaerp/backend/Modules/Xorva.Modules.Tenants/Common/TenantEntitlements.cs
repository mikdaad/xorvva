using Microsoft.EntityFrameworkCore;
using Xorva.Core.Entities;
using Xorva.Core.Exceptions;
using Xorva.Infrastructure.Data;
using Xorva.Infrastructure.Modules;

namespace Xorva.Modules.Tenants.Common;

/// <summary>
/// Shared rules for module entitlement: validating module keys against the installed set,
/// expanding dependencies (enabling Commerce pulls in Accounting), and keeping the tenant
/// subscription in step with what its companies actually use.
/// </summary>
public static class TenantEntitlements
{
    /// <summary>
    /// Validates the requested module keys against the registry and returns the normalized set
    /// a company should store in <c>ActiveModules</c> — dependencies expanded, core modules
    /// dropped (they are always on), duplicates removed. Throws on an unknown key.
    /// </summary>
    public static List<string> NormalizeCompanyModules(ModuleRegistry registry, IEnumerable<string>? requested)
    {
        var keys = (requested ?? [])
            .Where(k => !string.IsNullOrWhiteSpace(k))
            .Select(k => k.Trim())
            .Distinct()
            .ToList();

        var unknown = keys.Where(k => !registry.Exists(k)).ToList();
        if (unknown.Count > 0)
            throw new BadRequestException(
                $"Unknown module(s): {string.Join(", ", unknown)}. " +
                $"Available: {string.Join(", ", registry.Subscribable.Select(m => m.Key))}.");

        return registry.ExpandWithDependencies(keys)
            .Where(k => !registry.IsCore(k))
            .OrderBy(k => k)
            .ToList();
    }

    /// <summary>
    /// Ensures the tenant's subscription covers the given modules (auto-subscribe on use),
    /// creating the subscription row if it does not exist yet. Returns the (tracked) row.
    /// </summary>
    public static async Task<TenantSubscription> EnsureSubscribedAsync(
        XorvaDbContext db, Guid tenantId, IEnumerable<string> moduleKeys, CancellationToken ct)
    {
        var subscription = await db.TenantSubscriptions.FirstOrDefaultAsync(s => s.TenantId == tenantId, ct);
        if (subscription is null)
        {
            subscription = new TenantSubscription { TenantId = tenantId, SubscribedModules = [] };
            db.TenantSubscriptions.Add(subscription);
        }

        var merged = new SortedSet<string>(subscription.SubscribedModules);
        var changed = moduleKeys.Aggregate(false, (acc, k) => merged.Add(k) || acc);
        if (changed) subscription.SubscribedModules = merged.ToList();

        return subscription;
    }
}
