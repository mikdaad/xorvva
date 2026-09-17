using Microsoft.Extensions.DependencyInjection;
using Xorva.Core.Approvals;
using Xorva.Core.Interfaces;
using Xorva.Modules.Auth.Commands.RegisterUser;
using Xorva.Modules.Auth.Services;

namespace Xorva.Modules.Auth.Extensions;

/// <summary>
/// DI registration for the Auth module.
/// Registers MediatR handlers and declares this module's approvable actions.
/// </summary>
public static class AuthModuleExtensions
{
    public static IServiceCollection AddAuthModule(this IServiceCollection services)
    {
        // MediatR scans this assembly for IRequestHandler implementations
        services.AddMediatR(cfg => cfg.RegisterServicesFromAssembly(typeof(AuthModuleExtensions).Assembly));

        // The shared login-creation service (used by RegisterUser and by CreateEmployee's grant-access).
        services.AddScoped<IUserProvisioningService, UserProvisioningService>();

        // Declare approvable actions → they appear in the rule-builder dropdowns.
        services.AddSingleton(new ApprovableActionDescriptor(
            Module: "Users",
            ActionKey: RegisterUserCommand.ActionKey,
            DisplayName: "Add User / New Hire",
            CommandType: typeof(RegisterUserCommand),
            RequiresModuleActivation: false));

        return services;
    }
}
