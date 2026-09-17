using System.Reflection;
using Microsoft.Extensions.DependencyInjection;
using Xorva.Core.Modules;

namespace Xorva.Modules.Tenants.Extensions;

/// <summary>Tenants platform module — self-registration via the <see cref="IModule"/> kernel.</summary>
public sealed class TenantsModule : IModule
{
    public string Key => "Tenants";
    public string DisplayName => "Tenants & Companies";
    public string Description => "Tenant, company and branch structure, plus per-company module subscriptions.";
    public string[] DependsOn => ["Auth"];
    public bool IsCore => true;
    public int Order => 10;
    public Assembly Assembly => typeof(TenantsModule).Assembly;
    public void RegisterServices(IServiceCollection services) => services.AddTenantsModule();
}
