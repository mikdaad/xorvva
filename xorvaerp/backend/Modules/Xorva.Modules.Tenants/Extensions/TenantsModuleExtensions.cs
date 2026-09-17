using Microsoft.Extensions.DependencyInjection;
using Xorva.Core.Approvals;
using Xorva.Modules.Tenants.Commands.CreateBranch;

namespace Xorva.Modules.Tenants.Extensions;

/// <summary>
/// DI registration for the Tenants module.
/// Registers MediatR handlers and declares this module's approvable actions.
/// </summary>
public static class TenantsModuleExtensions
{
    public static IServiceCollection AddTenantsModule(this IServiceCollection services)
    {
        services.AddMediatR(cfg => cfg.RegisterServicesFromAssembly(typeof(TenantsModuleExtensions).Assembly));

        // Foundation action: branch creation can require approval.
        services.AddSingleton(new ApprovableActionDescriptor(
            Module: "Organization",
            ActionKey: CreateBranchCommand.ActionKey,
            DisplayName: "Create Branch",
            CommandType: typeof(CreateBranchCommand),
            RequiresModuleActivation: false));

        return services;
    }
}
