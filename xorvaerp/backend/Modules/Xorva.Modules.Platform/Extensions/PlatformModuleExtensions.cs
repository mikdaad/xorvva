using Microsoft.Extensions.DependencyInjection;

namespace Xorva.Modules.Platform.Extensions;

/// <summary>
/// DI registration for the Platform module — the dynamic-entity engine that lets Admins
/// define their own sub-modules and forms (EntityDefinition / FieldDefinition / CustomRecord).
/// </summary>
public static class PlatformModuleExtensions
{
    public static IServiceCollection AddPlatformModule(this IServiceCollection services)
    {
        services.AddMediatR(cfg => cfg.RegisterServicesFromAssembly(typeof(PlatformModuleExtensions).Assembly));
        return services;
    }
}
