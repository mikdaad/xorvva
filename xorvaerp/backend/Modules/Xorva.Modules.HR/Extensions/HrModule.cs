using System.Reflection;
using Microsoft.Extensions.DependencyInjection;
using Xorva.Core.Constants;
using Xorva.Core.Modules;

namespace Xorva.Modules.HR.Extensions;

/// <summary>HR business module — self-registration via the <see cref="IModule"/> kernel.</summary>
public sealed class HrModule : IModule
{
    public string Key => ModuleCatalog.HR;
    public string DisplayName => "Human Resources";
    public string Description => "Employees, departments, designations, leave, holidays and payroll.";
    public string[] DependsOn => [];
    public bool IsCore => false;
    public int Order => 30;
    public Assembly Assembly => typeof(HrModule).Assembly;
    public void RegisterServices(IServiceCollection services) => services.AddHRModule();
}
