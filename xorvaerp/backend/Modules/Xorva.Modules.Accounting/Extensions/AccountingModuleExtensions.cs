using Microsoft.Extensions.DependencyInjection;
using Xorva.Core.Approvals;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Ledger.Commands.CreateManualJournal;
using Xorva.Modules.Accounting.Vouchers.Commands.ReverseVoucher;
using Xorva.Modules.Accounting.Vouchers.Commands.SaveAndPostVoucher;

namespace Xorva.Modules.Accounting.Extensions;

/// <summary>
/// DI registration for the Accounting module — the pure ledger/finance core.
/// Registers MediatR handlers, the <c>IJournalPoster</c> engine (consumed by HR payroll
/// and the Commerce module without referencing Accounting internals), and its own
/// approvable action (manual journals). Sales/purchase money actions now live in the
/// Commerce module.
/// </summary>
public static class AccountingModuleExtensions
{
    public static IServiceCollection AddAccountingModule(this IServiceCollection services)
    {
        services.AddMediatR(cfg => cfg.RegisterServicesFromAssembly(typeof(AccountingModuleExtensions).Assembly));

        // The double-entry engine — resolvable as the Core IJournalPoster contract, so HR
        // payroll and Commerce (invoices/bills) can post journals without referencing Accounting.
        services.AddScoped<IJournalPoster, JournalPoster>();

        // Manual journals may carry an amount threshold for approval.
        services.AddSingleton(new ApprovableActionDescriptor(
            "Accounting", CreateManualJournalCommand.ActionKey, "Post Manual Journal",
            typeof(CreateManualJournalCommand), RequiresModuleActivation: true, SupportsAmountThreshold: true));

        // Tally-style voucher entry (F4–F9) and its reversal — ported from TrueLedge.
        services.AddSingleton(new ApprovableActionDescriptor(
            "Accounting", SaveAndPostVoucherCommand.ActionKey, "Post Voucher",
            typeof(SaveAndPostVoucherCommand), RequiresModuleActivation: true, SupportsAmountThreshold: true));
        services.AddSingleton(new ApprovableActionDescriptor(
            "Accounting", ReverseVoucherCommand.ActionKey, "Reverse Voucher",
            typeof(ReverseVoucherCommand), RequiresModuleActivation: true, SupportsAmountThreshold: true));

        return services;
    }
}
