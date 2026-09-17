using Microsoft.Extensions.DependencyInjection;

namespace Xorva.Modules.Approvals.Extensions;

/// <summary>
/// DI registration for the Approvals module (rule CRUD, inbox, history handlers).
/// This module does NOT register approvable actions — each business module declares
/// its own, keeping the "modules never reference each other" rule intact.
/// </summary>
public static class ApprovalsModuleExtensions
{
    public static IServiceCollection AddApprovalsModule(this IServiceCollection services)
    {
        services.AddMediatR(cfg => cfg.RegisterServicesFromAssembly(typeof(ApprovalsModuleExtensions).Assembly));
        return services;
    }
}
