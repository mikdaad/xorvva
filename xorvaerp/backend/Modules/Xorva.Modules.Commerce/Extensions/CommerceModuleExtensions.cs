using Microsoft.Extensions.DependencyInjection;
using Xorva.Core.Approvals;
using Xorva.Modules.Accounting.Purchases.Commands.PostBill;
using Xorva.Modules.Accounting.Purchases.Commands.RecordSupplierPayment;
using Xorva.Modules.Accounting.Sales.Commands.PostInvoice;
using Xorva.Modules.Accounting.Sales.Commands.RecordCustomerPayment;

namespace Xorva.Modules.Commerce.Extensions;

/// <summary>
/// DI registration for the Commerce module — customers/suppliers, invoicing, bills and
/// their reports. Registers its MediatR handlers and the approvable money actions that
/// post to the ledger (invoices, bills, payments). Commerce depends on Accounting for the
/// ledger (IJournalPoster), chart, tax and settings.
/// </summary>
public static class CommerceModuleExtensions
{
    public static IServiceCollection AddCommerceModule(this IServiceCollection services)
    {
        services.AddMediatR(cfg => cfg.RegisterServicesFromAssembly(typeof(CommerceModuleExtensions).Assembly));

        // Money actions expose an amount, so a rule for them may carry an amount threshold.
        services.AddSingleton(new ApprovableActionDescriptor(
            "Accounting", PostInvoiceCommand.ActionKey, "Post Sales Invoice",
            typeof(PostInvoiceCommand), RequiresModuleActivation: true, SupportsAmountThreshold: true));
        services.AddSingleton(new ApprovableActionDescriptor(
            "Accounting", PostBillCommand.ActionKey, "Post Supplier Bill",
            typeof(PostBillCommand), RequiresModuleActivation: true, SupportsAmountThreshold: true));
        services.AddSingleton(new ApprovableActionDescriptor(
            "Accounting", RecordCustomerPaymentCommand.ActionKey, "Record Customer Payment",
            typeof(RecordCustomerPaymentCommand), RequiresModuleActivation: true, SupportsAmountThreshold: true));
        services.AddSingleton(new ApprovableActionDescriptor(
            "Accounting", RecordSupplierPaymentCommand.ActionKey, "Record Supplier Payment",
            typeof(RecordSupplierPaymentCommand), RequiresModuleActivation: true, SupportsAmountThreshold: true));

        return services;
    }
}
