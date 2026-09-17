using System.Reflection;
using Microsoft.Extensions.DependencyInjection;
using Xorva.Core.Modules;

namespace Xorva.Modules.Platform.Extensions;

/// <summary>
/// Platform module manifest — the dynamic-entity engine. Registered through the module
/// kernel like any other module. Always-on (core): every tenant can design custom
/// sub-modules; the parent module each custom sub-module appears under is its own concern.
/// </summary>
public sealed class PlatformModule : IModule
{
    public string Key => "Platform";
    public string DisplayName => "Platform Studio";
    public string Description => "Admin-defined custom sub-modules and dynamic forms (no-code).";
    public string[] DependsOn => [];
    public bool IsCore => true;
    public int Order => 25;
    public Assembly Assembly => typeof(PlatformModule).Assembly;
    public void RegisterServices(IServiceCollection services) => services.AddPlatformModule();
}
