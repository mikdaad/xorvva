using System.Reflection;
using Microsoft.Extensions.DependencyInjection;
using Xorva.Core.Constants;
using Xorva.Core.Modules;

namespace Xorva.Modules.Accounting.Extensions;

/// <summary>Accounting business module — self-registration via the <see cref="IModule"/> kernel.</summary>
public sealed class AccountingModule : IModule
{
    public string Key => ModuleCatalog.Accounting;
    public string DisplayName => "Accounting & Finance";
    public string Description => "Double-entry ledger, invoicing, bills, VAT, financial reports and e-invoicing.";
    public string[] DependsOn => [];
    public bool IsCore => false;
    public int Order => 40;
    public Assembly Assembly => typeof(AccountingModule).Assembly;
    public void RegisterServices(IServiceCollection services) => services.AddAccountingModule();
}
