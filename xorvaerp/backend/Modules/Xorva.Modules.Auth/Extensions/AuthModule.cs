using System.Reflection;
using Microsoft.Extensions.DependencyInjection;
using Xorva.Core.Modules;

namespace Xorva.Modules.Auth.Extensions;

/// <summary>Auth platform module — self-registration via the <see cref="IModule"/> kernel.</summary>
public sealed class AuthModule : IModule
{
    public string Key => "Auth";
    public string DisplayName => "Authentication & Users";
    public string Description => "Login, JWT sessions with refresh-token rotation, user accounts and roles.";
    public string[] DependsOn => [];
    public bool IsCore => true;
    public int Order => 0;
    public Assembly Assembly => typeof(AuthModule).Assembly;
    public void RegisterServices(IServiceCollection services) => services.AddAuthModule();
}
