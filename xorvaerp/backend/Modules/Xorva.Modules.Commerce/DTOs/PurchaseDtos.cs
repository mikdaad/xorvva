using Xorva.Modules.Accounting.Purchases.Entities;

namespace Xorva.Modules.Accounting.DTOs;

public record BillLineDto
{
    public Guid Id { get; init; }
    public string Description { get; init; } = string.Empty;
    public decimal Quantity { get; init; }
    public decimal UnitPrice { get; init; }
    public Guid AccountId { get; init; }
    public Guid? TaxRateId { get; init; }
    public decimal TaxRatePercent { get; init; }
    public decimal LineAmount { get; init; }
    public decimal LineTax { get; init; }
}

public record BillDto
{
    public Guid Id { get; init; }
    public string Number { get; init; } = string.Empty;
    public string? SupplierReference { get; init; }
    public Guid ContactId { get; init; }
    public string? ContactName { get; init; }
    public DateTime Date { get; init; }
    public DateTime DueDate { get; init; }
    public string Status { get; init; } = string.Empty;
    public string Currency { get; init; } = "AED";
    public decimal ExchangeRate { get; init; } = 1m;
    public decimal SubTotal { get; init; }
    public decimal TaxTotal { get; init; }
    public decimal Total { get; init; }
    public decimal AmountPaid { get; init; }
    public decimal BalanceDue { get; init; }
    public decimal BaseTotal { get; init; }
    public Guid? JournalEntryId { get; init; }
    public string? Notes { get; init; }
    public List<BillLineDto> Lines { get; init; } = [];
}

public record BillSummaryDto
{
    public Guid Id { get; init; }
    public string Number { get; init; } = string.Empty;
    public string? SupplierReference { get; init; }
    public Guid ContactId { get; init; }
    public string? ContactName { get; init; }
    public DateTime Date { get; init; }
    public DateTime DueDate { get; init; }
    public string Status { get; init; } = string.Empty;
    public string Currency { get; init; } = "AED";
    public decimal Total { get; init; }
    public decimal BalanceDue { get; init; }
}

public record SupplierPaymentDto
{
    public Guid Id { get; init; }
    public string Number { get; init; } = string.Empty;
    public Guid ContactId { get; init; }
    public string? ContactName { get; init; }
    public DateTime Date { get; init; }
    public decimal Amount { get; init; }
    public string Currency { get; init; } = "AED";
    public decimal ExchangeRate { get; init; } = 1m;
    public string Method { get; init; } = string.Empty;
    public string? Reference { get; init; }
}

public static class PurchaseMappers
{
    public static BillDto ToDto(this Bill b, string? contactName = null) => new()
    {
        Id = b.Id,
        Number = b.Number,
        SupplierReference = b.SupplierReference,
        ContactId = b.ContactId,
        ContactName = contactName,
        Date = b.Date,
        DueDate = b.DueDate,
        Status = b.Status.ToString(),
        Currency = b.Currency,
        ExchangeRate = b.ExchangeRate,
        SubTotal = b.SubTotal,
        TaxTotal = b.TaxTotal,
        Total = b.Total,
        AmountPaid = b.AmountPaid,
        BalanceDue = b.BalanceDue,
        BaseTotal = b.BaseTotal,
        JournalEntryId = b.JournalEntryId,
        Notes = b.Notes,
        Lines = [.. b.Lines.Select(l => new BillLineDto
        {
            Id = l.Id, Description = l.Description, Quantity = l.Quantity, UnitPrice = l.UnitPrice,
            AccountId = l.AccountId, TaxRateId = l.TaxRateId, TaxRatePercent = l.TaxRatePercent,
            LineAmount = l.LineAmount, LineTax = l.LineTax,
        })],
    };

    public static BillSummaryDto ToSummaryDto(this Bill b, string? contactName = null) => new()
    {
        Id = b.Id, Number = b.Number, SupplierReference = b.SupplierReference,
        ContactId = b.ContactId, ContactName = contactName, Date = b.Date, DueDate = b.DueDate,
        Status = b.Status.ToString(), Currency = b.Currency, Total = b.Total, BalanceDue = b.BalanceDue,
    };

    public static SupplierPaymentDto ToDto(this SupplierPayment p, string? contactName = null) => new()
    {
        Id = p.Id, Number = p.Number, ContactId = p.ContactId, ContactName = contactName,
        Date = p.Date, Amount = p.Amount, Currency = p.Currency, ExchangeRate = p.ExchangeRate,
        Method = p.Method.ToString(), Reference = p.Reference,
    };
}
