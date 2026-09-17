using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Interfaces;
using Xorva.Infrastructure.Data;
using Xorva.Infrastructure.Modules;
using Xorva.Modules.Tenants.DTOs;

namespace Xorva.Modules.Tenants.Queries.GetTenantSubscription;

/// <summary>The tenant's module subscription plus the subscribable catalog (for the marketplace).</summary>
public sealed record GetTenantSubscriptionQuery : IRequest<ApiResponse<TenantSubscriptionDto>>;

public sealed class GetTenantSubscriptionHandler
    : IRequestHandler<GetTenantSubscriptionQuery, ApiResponse<TenantSubscriptionDto>>
{
    private readonly XorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;
    private readonly ModuleRegistry _modules;

    public GetTenantSubscriptionHandler(XorvaDbContext db, ICurrentTenantService tenant, ModuleRegistry modules)
    {
        _db = db;
        _tenant = tenant;
        _modules = modules;
    }

    public async Task<ApiResponse<TenantSubscriptionDto>> Handle(GetTenantSubscriptionQuery request, CancellationToken ct)
    {
        var subscription = await _db.TenantSubscriptions.FirstOrDefaultAsync(ct);

        string plan;
        HashSet<string> subscribed;
        if (subscription is not null)
        {
            plan = subscription.PlanKey;
            subscribed = [.. subscription.SubscribedModules];
        }
        else
        {
            // No row yet (tenant predates subscriptions): derive the effective set from what
            // the tenant's companies already use, so the marketplace still reflects reality.
            plan = "custom";
            var used = await _db.Companies.SelectMany(c => c.ActiveModules).Distinct().ToListAsync(ct);
            subscribed = [.. _modules.ExpandWithDependencies(used).Where(k => !_modules.IsCore(k))];
        }

        var available = _modules.Subscribable
            .Select(m => new ModuleCatalogEntryDto(
                m.Key, m.DisplayName, m.Description, m.DependsOn, subscribed.Contains(m.Key)))
            .ToList();

        var dto = new TenantSubscriptionDto(plan, subscribed.OrderBy(k => k).ToList(), available);
        return ApiResponse<TenantSubscriptionDto>.Ok(dto);
    }
}
