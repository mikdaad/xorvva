using FluentAssertions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.API.Behaviors;
using Xorva.Core.Approvals;
using Xorva.Core.Common;
using Xorva.Core.Constants;
using Xorva.Core.Entities;
using Xorva.Core.Enums;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Contacts.Commands.CreateContact;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Ledger.Commands.CreateManualJournal;
using Xorva.Modules.Accounting.Ledger.Commands.SeedChartOfAccounts;
using Xorva.Modules.Accounting.Sales.Commands.CreateInvoice;
using Xorva.Modules.Accounting.Sales.Commands.PostInvoice;
using Xorva.Modules.Accounting.Sales.Commands.RecordCustomerPayment;
using Xorva.Modules.Accounting.Tax.Commands.SeedTaxRates;
using Xorva.Modules.Accounting.Tax.Entities;
using Xorva.Tests.Unit.TestHelpers;

namespace Xorva.Tests.Unit.Accounting;

/// <summary>
/// E9 — approval amount thresholds. Proves the engine's new money gate: a rule with an
/// AmountThreshold only intercepts occurrences at or above it (smaller ones run straight
/// through), while a rule with no threshold keeps the legacy "always require" behavior.
/// Exercises the real <see cref="ApprovalCheckBehavior{TRequest,TResponse}"/>.
/// </summary>
public class AmountThresholdTests : AuthHandlerTestBase
{
    private readonly Company _company;
    private static readonly DateTime When = new(2026, 4, 1);

    public AmountThresholdTests()
    {
        var tenant = SeedTenant();
        _company = SeedCompany(tenant.Id, "Threshold Co");
        _company.ActiveModules = [ModuleCatalog.Sales, ModuleCatalog.Accounting];
        Db.SaveChanges();
        // Requester is a CompanyAdmin; the rule below asks for CEO (SuperAdmin) sign-off,
        // so an intercepted action genuinely queues (the requester can't auto-satisfy it).
        ActAs(SeedUser("thr@co.test", role: SystemRole.CompanyAdmin, tenantId: tenant.Id, companyId: _company.Id));
    }

    // ─── test doubles for the behavior's collaborators ──────────────
    private sealed class NoReplay : IApprovalExecutionContext
    {
        public bool IsReplaying => false;
        public Task<T> RunAsReplayAsync<T>(Func<Task<T>> action) => action();
    }

    private sealed class PlainProtector : IApprovalPayloadProtector
    {
        public string Protect(string plaintext) => plaintext;
        public string Unprotect(string ciphertext) => ciphertext;
    }

    // ─── helpers ────────────────────────────────────────────────────
    private async Task<(Guid ContactId, Guid Vat5)> Bootstrap()
    {
        await new SeedChartOfAccountsHandler(Db, TenantService)
            .Handle(new SeedChartOfAccountsCommand { Industry = "General" }, CancellationToken.None);
        await new SeedTaxRatesHandler(Db, TenantService)
            .Handle(new SeedTaxRatesCommand(), CancellationToken.None);
        var contact = await new CreateContactHandler(Db, TenantService).Handle(new CreateContactCommand
        {
            Code = "CUST-1", Name = "Blue Sky LLC", ContactType = ContactType.Customer, TaxNumber = "100000000000003",
        }, CancellationToken.None);
        var vat5 = Db.Set<TaxRate>().First(t => t.Rate == 5m).Id;
        return (contact.Data!.Id, vat5);
    }

    /// <summary>Creates a DRAFT invoice; total = unitPrice × 1.05 (5% VAT).</summary>
    private async Task<Guid> DraftInvoice(Guid contactId, Guid vat5, decimal unitPrice)
    {
        var created = await new CreateInvoiceHandler(Db, TenantService).Handle(new CreateInvoiceCommand
        {
            ContactId = contactId, Date = When,
            Lines = [new() { Description = "Item", Quantity = 1, UnitPrice = unitPrice, TaxRateId = vat5 }],
        }, CancellationToken.None);
        return created.Data!.Id;
    }

    private void AddInvoiceRule(decimal? threshold)
    {
        Db.ApprovalRules.Add(new ApprovalRule
        {
            TenantId = TenantService.TenantId,
            CompanyId = _company.Id,
            Name = "Invoice gate",
            Module = "Accounting",
            ActionKey = PostInvoiceCommand.ActionKey,
            ApproverRoles = [SystemRole.SuperAdmin],
            IsActive = true,
            AmountThreshold = threshold,
        });
        Db.SaveChanges();
    }

    /// <summary>Runs the approval behavior over a PostInvoice command; reports whether it executed.</summary>
    private async Task<(bool Executed, ApiResponse<InvoiceDto> Result)> Intercept(PostInvoiceCommand cmd)
    {
        var behavior = new ApprovalCheckBehavior<PostInvoiceCommand, ApiResponse<InvoiceDto>>(
            Db, TenantService, new NoReplay(), new PlainProtector());
        var executed = false;
        RequestHandlerDelegate<ApiResponse<InvoiceDto>> next = _ =>
        {
            executed = true;
            return Task.FromResult(ApiResponse<InvoiceDto>.Ok(null!, "executed"));
        };
        var result = await behavior.Handle(cmd, next, CancellationToken.None);
        return (executed, result);
    }

    private int PendingCount() => Db.ApprovalRequests.IgnoreQueryFilters().Count();

    // ─── tests ──────────────────────────────────────────────────────

    [Fact]
    public async Task AtOrAboveThreshold_IsQueuedForApproval()
    {
        var (contactId, vat5) = await Bootstrap();
        AddInvoiceRule(5000m);
        var invId = await DraftInvoice(contactId, vat5, unitPrice: 10000m); // total 10,500

        var (executed, result) = await Intercept(new PostInvoiceCommand { Id = invId, CompanyId = _company.Id });

        executed.Should().BeFalse();               // did NOT run
        result.PendingApproval.Should().BeTrue();  // 202 queued
        PendingCount().Should().Be(1);
    }

    [Fact]
    public async Task BelowThreshold_RunsImmediately_NoApproval()
    {
        var (contactId, vat5) = await Bootstrap();
        AddInvoiceRule(5000m);
        var invId = await DraftInvoice(contactId, vat5, unitPrice: 100m); // total 105

        var (executed, result) = await Intercept(new PostInvoiceCommand { Id = invId, CompanyId = _company.Id });

        executed.Should().BeTrue();                 // ran straight through
        result.PendingApproval.Should().BeFalse();
        PendingCount().Should().Be(0);
    }

    [Fact]
    public async Task NoThreshold_KeepsLegacyBehavior_AlwaysQueues()
    {
        var (contactId, vat5) = await Bootstrap();
        AddInvoiceRule(threshold: null);
        var invId = await DraftInvoice(contactId, vat5, unitPrice: 1m); // tiny total

        var (executed, _) = await Intercept(new PostInvoiceCommand { Id = invId, CompanyId = _company.Id });

        executed.Should().BeFalse(); // null threshold → amount never consulted, always intercept
        PendingCount().Should().Be(1);
    }

    [Fact]
    public async Task Resolvers_ReportAmount_FromDocumentAndFromCommand()
    {
        var (contactId, vat5) = await Bootstrap();
        var invId = await DraftInvoice(contactId, vat5, unitPrice: 10000m); // total 10,500

        // Document-based: reads the invoice total from the DB.
        IAmountApprovableAction post = new PostInvoiceCommand { Id = invId };
        (await post.ResolveApprovalAmountAsync(Db, CancellationToken.None)).Should().Be(10500m);

        // Command-based: the allocated total (no lookup).
        IAmountApprovableAction pay = new RecordCustomerPaymentCommand
        {
            Allocations = [new() { Amount = 2500m }, new() { Amount = 500m }],
        };
        (await pay.ResolveApprovalAmountAsync(Db, CancellationToken.None)).Should().Be(3000m);

        // Command-based: a journal's debit total.
        IAmountApprovableAction mj = new CreateManualJournalCommand
        {
            Lines = [new() { Debit = 1200m }, new() { Credit = 1200m }],
        };
        (await mj.ResolveApprovalAmountAsync(Db, CancellationToken.None)).Should().Be(1200m);
    }
}
