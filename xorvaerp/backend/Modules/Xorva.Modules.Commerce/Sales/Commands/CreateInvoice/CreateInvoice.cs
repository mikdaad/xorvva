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
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Ledger.Entities;
using Xorva.Modules.Accounting.Sales.Entities;
using Xorva.Modules.Accounting.Tax.Entities;

namespace Xorva.Modules.Accounting.Sales.Commands.CreateInvoice;

public record InvoiceLineInput
{
    public string Description { get; init; } = string.Empty;
    public decimal Quantity { get; init; } = 1;
    public decimal UnitPrice { get; init; }
    public Guid? AccountId { get; init; }   // revenue account (defaults to company Sales account)
    public Guid? TaxRateId { get; init; }
}

public record CreateInvoiceCommand : IRequest<ApiResponse<InvoiceDto>>
{
    public Guid? CompanyId { get; init; }
    public Guid ContactId { get; init; }
    public DateTime Date { get; init; }
    public DateTime? DueDate { get; init; }
    public string? Notes { get; init; }
    /// <summary>Transaction currency (ISO 4217). Defaults to the company base currency.</summary>
    public string? Currency { get; init; }
    /// <summary>Optional explicit base-per-foreign rate; when omitted, resolved from the rate table.</summary>
    public decimal? ExchangeRate { get; init; }
    public List<InvoiceLineInput> Lines { get; init; } = [];
}

public class CreateInvoiceValidator : AbstractValidator<CreateInvoiceCommand>
{
    public CreateInvoiceValidator()
    {
        RuleFor(x => x.ContactId).NotEmpty().WithMessage("Choose a customer.");
        RuleFor(x => x.Date).NotEmpty().WithMessage("Invoice date is required.");
        RuleFor(x => x.Lines).NotEmpty().WithMessage("Add at least one line.");
        RuleForEach(x => x.Lines).ChildRules(l =>
        {
            l.RuleFor(x => x.Description).NotEmpty().WithMessage("Line description is required.").MaximumLength(300);
            l.RuleFor(x => x.Quantity).GreaterThan(0);
            l.RuleFor(x => x.UnitPrice).GreaterThanOrEqualTo(0);
        });
    }
}

public class CreateInvoiceHandler : IRequestHandler<CreateInvoiceCommand, ApiResponse<InvoiceDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public CreateInvoiceHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<InvoiceDto>> Handle(CreateInvoiceCommand request, CancellationToken ct)
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

        var invoice = new Invoice
        {
            TenantId = _tenant.TenantId,
            CompanyId = companyId,
            Number = NumberSequence.Next(settings, DocumentSequence.Invoice, date),
            ContactId = contact.Id,
            Date = date,
            DueDate = request.DueDate is { } dd
                ? DateTime.SpecifyKind(dd.Date, DateTimeKind.Utc)
                : date.AddDays(contact.PaymentTermDays),
            Status = DocumentStatus.Draft,
            Currency = currency,
            ExchangeRate = rate,
            Notes = request.Notes?.Trim(),
        };

        foreach (var input in request.Lines)
        {
            var taxPercent = input.TaxRateId is { } trid && taxRates.TryGetValue(trid, out var tr) ? tr.Rate : 0m;
            var lineAmount = Math.Round(input.Quantity * input.UnitPrice, 2);
            var lineTax = Math.Round(lineAmount * taxPercent / 100m, 2);

            invoice.Lines.Add(new InvoiceLine
            {
                TenantId = _tenant.TenantId,
                CompanyId = companyId,
                InvoiceId = invoice.Id,
                Description = input.Description.Trim(),
                Quantity = input.Quantity,
                UnitPrice = Math.Round(input.UnitPrice, 2),
                AccountId = input.AccountId ?? settings.SalesAccountId,
                TaxRateId = input.TaxRateId,
                TaxRatePercent = taxPercent,
                LineAmount = lineAmount,
                LineTax = lineTax,
            });
        }

        invoice.SubTotal = Math.Round(invoice.Lines.Sum(l => l.LineAmount), 2);
        invoice.TaxTotal = Math.Round(invoice.Lines.Sum(l => l.LineTax), 2);
        invoice.Total = invoice.SubTotal + invoice.TaxTotal;
        invoice.BalanceDue = invoice.Total;

        _db.Set<Invoice>().Add(invoice);
        await _db.SaveChangesAsync(ct);

        return ApiResponse<InvoiceDto>.Ok(invoice.ToDto(contact.Name), "Invoice created (draft).");
    }
}
