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
using Xorva.Modules.Accounting.Purchases.Entities;

namespace Xorva.Modules.Accounting.Purchases.Commands.RecordSupplierPayment;

public record BillAllocationInput
{
    public Guid BillId { get; init; }
    public decimal Amount { get; init; }
}

public record RecordSupplierPaymentCommand : IRequest<ApiResponse<SupplierPaymentDto>>, IAmountApprovableAction
{
    public Guid? CompanyId { get; init; }
    public Guid ContactId { get; init; }
    public DateTime Date { get; init; }
    public Guid BankAccountId { get; init; }
    public PaymentMethod Method { get; init; }
    public string? Reference { get; init; }
    /// <summary>Payment currency (ISO 4217). Must match the currency of the bills it settles.</summary>
    public string? Currency { get; init; }
    /// <summary>Optional explicit base-per-foreign rate on the payment date; else resolved from the rate table.</summary>
    public decimal? ExchangeRate { get; init; }
    public List<BillAllocationInput> Allocations { get; init; } = [];

    public const string ActionKey = "Accounting.RecordSupplierPayment";
    public string ApprovalActionKey => ActionKey;
    public string ApprovalSummary => $"Supplier payment: AED {Allocations.Sum(a => a.Amount):0.00}";
    public Guid? ApprovalCompanyId => CompanyId;

    // The allocated total is on the command — no lookup needed.
    public Task<decimal> ResolveApprovalAmountAsync(IXorvaDbContext db, CancellationToken ct) =>
        Task.FromResult(Allocations.Sum(a => a.Amount));
}

public class RecordSupplierPaymentValidator : AbstractValidator<RecordSupplierPaymentCommand>
{
    public RecordSupplierPaymentValidator()
    {
        RuleFor(x => x.ContactId).NotEmpty().WithMessage("Choose a supplier.");
        RuleFor(x => x.BankAccountId).NotEmpty().WithMessage("Choose the bank account you paid from.");
        RuleFor(x => x.Date).NotEmpty();
        RuleFor(x => x.Allocations).NotEmpty().WithMessage("Allocate the payment to at least one bill.");
        RuleForEach(x => x.Allocations).ChildRules(a => a.RuleFor(x => x.Amount).GreaterThan(0));
    }
}

public class RecordSupplierPaymentHandler : IRequestHandler<RecordSupplierPaymentCommand, ApiResponse<SupplierPaymentDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;
    private readonly IJournalPoster _poster;

    public RecordSupplierPaymentHandler(IXorvaDbContext db, ICurrentTenantService tenant, IJournalPoster poster)
    {
        _db = db;
        _tenant = tenant;
        _poster = poster;
    }

    public async Task<ApiResponse<SupplierPaymentDto>> Handle(RecordSupplierPaymentCommand request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        await AccountingGuard.EnsureSalesActiveAsync(_db, companyId, ct);

        var settings = await _db.Set<AccountingSettings>().FirstOrDefaultAsync(s => s.CompanyId == companyId, ct)
            ?? throw new BadRequestException("Accounting is not set up for this company.");
        var contact = await _db.Set<Contact>().FirstOrDefaultAsync(c => c.Id == request.ContactId && c.CompanyId == companyId, ct)
            ?? throw new NotFoundException("Contact", request.ContactId);
        var bank = await _db.Set<BankAccount>().FirstOrDefaultAsync(b => b.Id == request.BankAccountId && b.CompanyId == companyId, ct)
            ?? throw new NotFoundException("Bank account", request.BankAccountId);

        var billIds = request.Allocations.Select(a => a.BillId).ToList();
        var bills = await _db.Set<Bill>().Where(b => b.CompanyId == companyId && billIds.Contains(b.Id)).ToDictionaryAsync(b => b.Id, ct);

        var date = DateTime.SpecifyKind(request.Date.Date, DateTimeKind.Utc);
        var currency = ExchangeRateResolver.Normalize(request.Currency, settings.BaseCurrency);
        var rate = await ExchangeRateResolver.ResolveAsync(_db, companyId, currency, settings.BaseCurrency, date, request.ExchangeRate, ct);

        var total = 0m;          // transaction currency
        var baseApTotal = 0m;    // base carrying value of the AP being relieved
        foreach (var alloc in request.Allocations)
        {
            if (!bills.TryGetValue(alloc.BillId, out var bill)) throw new NotFoundException("Bill", alloc.BillId);
            if (bill.Status is not (DocumentStatus.Posted or DocumentStatus.PartiallyPaid))
                throw new BadRequestException($"Bill {bill.Number} is not open for payment.");
            if (bill.ContactId != contact.Id)
                throw new BadRequestException($"Bill {bill.Number} belongs to a different supplier.");
            if (!string.Equals(bill.Currency, currency, StringComparison.OrdinalIgnoreCase))
                throw new BadRequestException($"Bill {bill.Number} is in {bill.Currency}; the payment must be in the same currency.");
            var amount = Math.Round(alloc.Amount, 2);
            if (amount > bill.BalanceDue)
                throw new BadRequestException($"Allocation to {bill.Number} exceeds its balance due ({bill.BalanceDue:0.00}).");
            total += amount;
            baseApTotal += Math.Round(amount * bill.ExchangeRate, 2);
        }
        total = Math.Round(total, 2);
        baseApTotal = Math.Round(baseApTotal, 2);
        var baseCash = Math.Round(total * rate, 2);   // base value actually paid out

        // Journal (base currency): DR Payable (carrying value) / CR Bank (cash paid) /
        // ± realized FX on the difference. For a base-currency payment the two are equal → no FX line.
        var lines = new List<JournalLineDraft>
        {
            new() { AccountId = settings.PayableAccountId, Debit = baseApTotal, ContactId = contact.Id },
            new() { AccountId = bank.AccountId, Credit = baseCash },
        };
        var fxGain = Math.Round(baseApTotal - baseCash, 2);   // settled a bigger liability with less cash → gain
        if (fxGain > 0m) lines.Add(new JournalLineDraft { SystemAccount = SystemAccount.FxGainLoss, Credit = fxGain, Description = "Realized FX gain" });
        else if (fxGain < 0m) lines.Add(new JournalLineDraft { SystemAccount = SystemAccount.FxGainLoss, Debit = -fxGain, Description = "Realized FX loss" });

        var journalId = await _poster.PostAsync(new JournalDraft
        {
            CompanyId = companyId,
            Date = date,
            Description = rate == 1m ? $"Payment to {contact.Name}" : $"Payment to {contact.Name} ({currency} @ {rate})",
            SourceType = JournalSourceType.SupplierPayment,
            Lines = lines,
        }, ct);

        var payment = new SupplierPayment
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
            var bill = bills[alloc.BillId];
            bill.AmountPaid = Math.Round(bill.AmountPaid + amount, 2);
            bill.BalanceDue = Math.Round(bill.Total - bill.AmountPaid, 2);
            bill.Status = bill.BalanceDue <= 0m ? DocumentStatus.Paid : DocumentStatus.PartiallyPaid;

            payment.Allocations.Add(new BillPaymentAllocation
            {
                TenantId = _tenant.TenantId,
                CompanyId = companyId,
                SupplierPaymentId = payment.Id,
                BillId = bill.Id,
                Amount = amount,
            });
        }

        contact.OutstandingBalance = Math.Round(contact.OutstandingBalance - baseApTotal, 2);

        _db.Set<SupplierPayment>().Add(payment);
        await _db.SaveChangesAsync(ct);
        return ApiResponse<SupplierPaymentDto>.Ok(payment.ToDto(contact.Name), "Supplier payment recorded.");
    }
}
