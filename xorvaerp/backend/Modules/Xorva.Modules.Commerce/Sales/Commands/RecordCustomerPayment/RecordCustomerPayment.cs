using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Approvals;
using Xorva.Core.Common;
using Xorva.Core.Enums;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Banking.Entities;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Contacts.Entities;
using Xorva.Modules.Accounting.Currency.Common;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Ledger.Entities;
using Xorva.Modules.Accounting.Sales.Entities;

namespace Xorva.Modules.Accounting.Sales.Commands.RecordCustomerPayment;

public record PaymentAllocationInput
{
    public Guid InvoiceId { get; init; }
    public decimal Amount { get; init; }
}

public record RecordCustomerPaymentCommand : IRequest<ApiResponse<CustomerPaymentDto>>, IAmountApprovableAction
{
    public Guid? CompanyId { get; init; }
    public Guid ContactId { get; init; }
    public DateTime Date { get; init; }
    public Guid BankAccountId { get; init; }
    public PaymentMethod Method { get; init; }
    public string? Reference { get; init; }
    /// <summary>Payment currency (ISO 4217). Must match the currency of the invoices it settles.</summary>
    public string? Currency { get; init; }
    /// <summary>Optional explicit base-per-foreign rate on the payment date; else resolved from the rate table.</summary>
    public decimal? ExchangeRate { get; init; }
    public List<PaymentAllocationInput> Allocations { get; init; } = [];

    public const string ActionKey = "Accounting.RecordPayment";
    public string ApprovalActionKey => ActionKey;
    public string ApprovalSummary => $"Customer payment: AED {Allocations.Sum(a => a.Amount):0.00}";
    public Guid? ApprovalCompanyId => CompanyId;

    // The allocated total is on the command — no lookup needed.
    public Task<decimal> ResolveApprovalAmountAsync(IXorvaDbContext db, CancellationToken ct) =>
        Task.FromResult(Allocations.Sum(a => a.Amount));
}

public class RecordCustomerPaymentValidator : AbstractValidator<RecordCustomerPaymentCommand>
{
    public RecordCustomerPaymentValidator()
    {
        RuleFor(x => x.ContactId).NotEmpty().WithMessage("Choose a customer.");
        RuleFor(x => x.BankAccountId).NotEmpty().WithMessage("Choose the bank account that received the money.");
        RuleFor(x => x.Date).NotEmpty();
        RuleFor(x => x.Allocations).NotEmpty().WithMessage("Allocate the payment to at least one invoice.");
        RuleForEach(x => x.Allocations).ChildRules(a =>
            a.RuleFor(x => x.Amount).GreaterThan(0).WithMessage("Allocation amount must be positive."));
    }
}

public class RecordCustomerPaymentHandler : IRequestHandler<RecordCustomerPaymentCommand, ApiResponse<CustomerPaymentDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;
    private readonly IJournalPoster _poster;

    public RecordCustomerPaymentHandler(IXorvaDbContext db, ICurrentTenantService tenant, IJournalPoster poster)
    {
        _db = db;
        _tenant = tenant;
        _poster = poster;
    }

    public async Task<ApiResponse<CustomerPaymentDto>> Handle(RecordCustomerPaymentCommand request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        await AccountingGuard.EnsureSalesActiveAsync(_db, companyId, ct);

        var settings = await _db.Set<AccountingSettings>().FirstOrDefaultAsync(s => s.CompanyId == companyId, ct)
            ?? throw new BadRequestException("Accounting is not set up for this company.");

        var contact = await _db.Set<Contact>().FirstOrDefaultAsync(c => c.Id == request.ContactId && c.CompanyId == companyId, ct)
            ?? throw new NotFoundException("Contact", request.ContactId);

        var bank = await _db.Set<BankAccount>().FirstOrDefaultAsync(b => b.Id == request.BankAccountId && b.CompanyId == companyId, ct)
            ?? throw new NotFoundException("Bank account", request.BankAccountId);

        var invoiceIds = request.Allocations.Select(a => a.InvoiceId).ToList();
        var invoices = await _db.Set<Invoice>()
            .Where(i => i.CompanyId == companyId && invoiceIds.Contains(i.Id))
            .ToDictionaryAsync(i => i.Id, ct);

        var date = DateTime.SpecifyKind(request.Date.Date, DateTimeKind.Utc);
        var currency = ExchangeRateResolver.Normalize(request.Currency, settings.BaseCurrency);
        var rate = await ExchangeRateResolver.ResolveAsync(_db, companyId, currency, settings.BaseCurrency, date, request.ExchangeRate, ct);

        var total = 0m;          // transaction currency
        var baseArTotal = 0m;    // base carrying value of the AR being relieved
        foreach (var alloc in request.Allocations)
        {
            if (!invoices.TryGetValue(alloc.InvoiceId, out var inv))
                throw new NotFoundException("Invoice", alloc.InvoiceId);
            if (inv.Status is not (DocumentStatus.Posted or DocumentStatus.PartiallyPaid))
                throw new BadRequestException($"Invoice {inv.Number} is not open for payment.");
            if (inv.ContactId != contact.Id)
                throw new BadRequestException($"Invoice {inv.Number} belongs to a different customer.");
            if (!string.Equals(inv.Currency, currency, StringComparison.OrdinalIgnoreCase))
                throw new BadRequestException($"Invoice {inv.Number} is in {inv.Currency}; the payment must be in the same currency.");
            var amount = Math.Round(alloc.Amount, 2);
            if (amount > inv.BalanceDue)
                throw new BadRequestException($"Allocation to {inv.Number} exceeds its balance due ({inv.BalanceDue:0.00}).");
            total += amount;
            baseArTotal += Math.Round(amount * inv.ExchangeRate, 2);
        }
        total = Math.Round(total, 2);
        baseArTotal = Math.Round(baseArTotal, 2);
        var baseCash = Math.Round(total * rate, 2);   // base value actually received

        // Journal (base currency): DR Bank (cash received) / CR Receivable (carrying value) /
        // ± realized FX on the difference. For a base-currency payment the two are equal → no FX line.
        var lines = new List<JournalLineDraft>
        {
            new() { AccountId = bank.AccountId, Debit = baseCash },
            new() { AccountId = settings.ReceivableAccountId, Credit = baseArTotal, ContactId = contact.Id },
        };
        var fxGain = Math.Round(baseCash - baseArTotal, 2);
        if (fxGain > 0m) lines.Add(new JournalLineDraft { SystemAccount = SystemAccount.FxGainLoss, Credit = fxGain, Description = "Realized FX gain" });
        else if (fxGain < 0m) lines.Add(new JournalLineDraft { SystemAccount = SystemAccount.FxGainLoss, Debit = -fxGain, Description = "Realized FX loss" });

        var journalId = await _poster.PostAsync(new JournalDraft
        {
            CompanyId = companyId,
            Date = date,
            Description = rate == 1m ? $"Payment from {contact.Name}" : $"Payment from {contact.Name} ({currency} @ {rate})",
            SourceType = JournalSourceType.CustomerPayment,
            Lines = lines,
        }, ct);

        var payment = new CustomerPayment
        {
            TenantId = _tenant.TenantId,
            CompanyId = companyId,
            Number = NumberSequence.Next(settings, DocumentSequence.Payment, date),
            ContactId = contact.Id,
            Date = date,
            Amount = total,
            Currency = currency,
            ExchangeRate = rate,
            BankAccountId = bank.Id,
            Method = request.Method,
            JournalEntryId = journalId,
            Reference = request.Reference?.Trim(),
        };

        foreach (var alloc in request.Allocations)
        {
            var amount = Math.Round(alloc.Amount, 2);
            var inv = invoices[alloc.InvoiceId];
            inv.AmountPaid = Math.Round(inv.AmountPaid + amount, 2);
            inv.BalanceDue = Math.Round(inv.Total - inv.AmountPaid, 2);
            inv.Status = inv.BalanceDue <= 0m ? DocumentStatus.Paid : DocumentStatus.PartiallyPaid;

            payment.Allocations.Add(new PaymentAllocation
            {
                TenantId = _tenant.TenantId,
                CompanyId = companyId,
                CustomerPaymentId = payment.Id,
                InvoiceId = inv.Id,
                Amount = amount,
            });
        }

        contact.OutstandingBalance = Math.Round(contact.OutstandingBalance - baseArTotal, 2);

        _db.Set<CustomerPayment>().Add(payment);
        await _db.SaveChangesAsync(ct);

        return ApiResponse<CustomerPaymentDto>.Ok(payment.ToDto(contact.Name), "Payment recorded.");
    }
}
