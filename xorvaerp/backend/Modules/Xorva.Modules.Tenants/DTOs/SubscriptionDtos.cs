namespace Xorva.Modules.Tenants.DTOs;

/// <summary>One subscribable module in the marketplace view, with the tenant's status.</summary>
public sealed record ModuleCatalogEntryDto(
    string Key,
    string DisplayName,
    string Description,
    string[] DependsOn,
    bool IsSubscribed);

/// <summary>The tenant's module subscription + the full subscribable catalog for the marketplace.</summary>
public sealed record TenantSubscriptionDto(
    string PlanKey,
    IReadOnlyList<string> SubscribedModules,
    IReadOnlyList<ModuleCatalogEntryDto> AvailableModules);
