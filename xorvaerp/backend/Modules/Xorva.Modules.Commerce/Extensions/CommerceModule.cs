using System.Reflection;
using Microsoft.Extensions.DependencyInjection;
using Xorva.Core.Modules;

namespace Xorva.Modules.Commerce.Extensions;

/// <summary>
/// The CRM &amp; Sales module — customers/suppliers (CRM), sales (invoices, credit notes,
/// customer payments) and purchasing (bills, debit notes, supplier payments), plus their
/// aged reports and e-invoicing.
///
/// It runs STANDALONE (no hard dependency): you can record customers, invoices and bills
/// without the Accounting module. It SOFT-LINKS to Accounting — when a company also has
/// Accounting active, posting an invoice/bill automatically writes the double-entry journal;
/// without it, the document is recorded but not posted to the ledger.
/// </summary>
public sealed class CommerceModule : IModule
{
    public string Key => "Sales";
    public string DisplayName => "CRM & Sales";
    public string Description => "Customers & suppliers, invoicing, bills, payments, aged reports and e-invoicing. Posts to the ledger when Accounting is also active.";
    public string[] DependsOn => [];
    public bool IsCore => false;
    public int Order => 45;
    public Assembly Assembly => typeof(CommerceModule).Assembly;
    public void RegisterServices(IServiceCollection services) => services.AddCommerceModule();
}
