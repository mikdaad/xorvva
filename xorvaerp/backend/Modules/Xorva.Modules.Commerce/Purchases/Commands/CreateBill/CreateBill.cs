using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Contacts.Entities;
using Xorva.Modules.Accounting.Currency.Common;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Ledger.Entities;
using Xorva.Modules.Accounting.Purchases.Entities;
using Xorva.Modules.Accounting.Tax.Entities;

namespace Xorva.Modules.Accounting.Purchases.Commands.CreateBill;

public record BillLineInput
{
    public string Description { get; init; } = string.Empty;
    public decimal Quantity { get; init; } = 1;
    public decimal UnitPrice { get; init; }
    public Guid? AccountId { get; init; }   // expense account (defaults to company Purchase account)
    public Guid? TaxRateId { get; init; }
}

public record CreateBillCommand : IRequest<ApiResponse<BillDto>>
{
    public Guid? CompanyId { get; init; }
    public Guid ContactId { get; init; }
    public DateTime Date { get; init; }
    public DateTime? DueDate { get; init; }
    public string? SupplierReference { get; init; }
    public string? Notes { get; init; }
    /// <summary>Transaction currency (ISO 4217). Defaults to the company base currency.</summary>
    public string? Currency { get; init; }
    /// <summary>Optional explicit base-per-foreign rate; when omitted, resolved from the rate table.</summary>
    public decimal? ExchangeRate { get; init; }
    public List<BillLineInput> Lines { get; init; } = [];
}

public class CreateBillValidator : AbstractValidator<CreateBillCommand>
{
    public CreateBillValidator()
    {
        RuleFor(x => x.ContactId).NotEmpty().WithMessage("Choose a supplier.");
        RuleFor(x => x.Date).NotEmpty().WithMessage("Bill date is required.");
        RuleFor(x => x.Lines).NotEmpty().WithMessage("Add at least one line.");
        RuleForEach(x => x.Lines).ChildRules(l =>
        {
            l.RuleFor(x => x.Description).NotEmpty().WithMessage("Line description is required.").MaximumLength(300);
            l.RuleFor(x => x.Quantity).GreaterThan(0);
            l.RuleFor(x => x.UnitPrice).GreaterThanOrEqualTo(0);
        });
    }
}

public class CreateBillHandler : IRequestHandler<CreateBillCommand, ApiResponse<BillDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public CreateBillHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<BillDto>> Handle(CreateBillCommand request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        await AccountingGuard.EnsureSalesActiveAsync(_db, companyId, ct);

        var contact = await _db.Set<Contact>().FirstOrDefaultAsync(c => c.Id == request.ContactId && c.CompanyId == companyId, ct)
            ?? throw new NotFoundException("Contact", request.ContactId);

        var settings = await _db.Set<AccountingSettings>().FirstOrDefaultAsync(s => s.CompanyId == companyId, ct)
            ?? throw new BadRequestException("Create the chart of accounts first (no accounting settings).");

        var taxRates = await _db.Set<TaxRate>().Where(t => t.CompanyId == companyId).ToDictionaryAsync(t => t.Id, ct);

        var date = DateTime.SpecifyKind(request.Date.Date, DateTimeKind.Utc);
        var currency = ExchangeRateResolver.Normalize(request.Currency, settings.BaseCurrency);
        var rate = await ExchangeRateResolver.ResolveAsync(_db, companyId, currency, settings.BaseCurrency, date, request.ExchangeRate, ct);

        var bill = new Bill
        {
            TenantId = _tenant.TenantId,
            CompanyId = companyId,
            Number = NumberSequence.Next(settings, DocumentSequence.Bill, date),
            SupplierReference = request.SupplierReference?.Trim(),
            ContactId = contact.Id,
            Date = date,
            DueDate = request.DueDate is { } dd ? DateTime.SpecifyKind(dd.Date, DateTimeKind.Utc) : date.AddDays(contact.PaymentTermDays),
            Status = Enums.DocumentStatus.Draft,
            Currency = currency,
            ExchangeRate = rate,
            Notes = request.Notes?.Trim(),
        };

        foreach (var input in request.Lines)
        {
            var taxPercent = input.TaxRateId is { } trid && taxRates.TryGetValue(trid, out var tr) ? tr.Rate : 0m;
            var lineAmount = Math.Round(input.Quantity * input.UnitPrice, 2);
            bill.Lines.Add(new BillLine
            {
                TenantId = _tenant.TenantId,
                CompanyId = companyId,
                BillId = bill.Id,
                Description = input.Description.Trim(),
                Quantity = input.Quantity,
                UnitPrice = Math.Round(input.UnitPrice, 2),
                AccountId = input.AccountId ?? settings.PurchaseAccountId,
                TaxRateId = input.TaxRateId,
                TaxRatePercent = taxPercent,
                LineAmount = lineAmount,
                LineTax = Math.Round(lineAmount * taxPercent / 100m, 2),
            });
        }

        bill.SubTotal = Math.Round(bill.Lines.Sum(l => l.LineAmount), 2);
        bill.TaxTotal = Math.Round(bill.Lines.Sum(l => l.LineTax), 2);
        bill.Total = bill.SubTotal + bill.TaxTotal;
        bill.BalanceDue = bill.Total;

        _db.Set<Bill>().Add(bill);
        await _db.SaveChangesAsync(ct);
        return ApiResponse<BillDto>.Ok(bill.ToDto(contact.Name), "Bill created (draft).");
    }
}
