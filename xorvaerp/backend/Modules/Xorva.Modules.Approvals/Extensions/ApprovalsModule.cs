using System.Reflection;
using Microsoft.Extensions.DependencyInjection;
using Xorva.Core.Modules;

namespace Xorva.Modules.Approvals.Extensions;

/// <summary>Approvals platform module — self-registration via the <see cref="IModule"/> kernel.</summary>
public sealed class ApprovalsModule : IModule
{
    public string Key => "Approvals";
    public string DisplayName => "Approval Engine";
    public string Description => "Rule-based, threshold-aware approval workflows that intercept actions across modules.";
    public string[] DependsOn => ["Auth", "Tenants"];
    public bool IsCore => true;
    public int Order => 20;
    public Assembly Assembly => typeof(ApprovalsModule).Assembly;
    public void RegisterServices(IServiceCollection services) => services.AddApprovalsModule();
}
