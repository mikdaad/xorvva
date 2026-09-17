using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Sales.Entities;

namespace Xorva.Modules.Accounting.DTOs;

public record InvoiceLineDto
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

public record InvoiceDto
{
    public Guid Id { get; init; }
    public string Number { get; init; } = string.Empty;
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
    public List<InvoiceLineDto> Lines { get; init; } = [];
}

public record InvoiceSummaryDto
{
    public Guid Id { get; init; }
    public string Number { get; init; } = string.Empty;
    public Guid ContactId { get; init; }
    public string? ContactName { get; init; }
    public DateTime Date { get; init; }
    public DateTime DueDate { get; init; }
    public string Status { get; init; } = string.Empty;
    public string Currency { get; init; } = "AED";
    public decimal Total { get; init; }
    public decimal BalanceDue { get; init; }
}

public record PaymentAllocationDto
{
    public Guid InvoiceId { get; init; }
    public decimal Amount { get; init; }
}

public record CustomerPaymentDto
{
    public Guid Id { get; init; }
    public string Number { get; init; } = string.Empty;
    public Guid ContactId { get; init; }
    public string? ContactName { get; init; }
    public DateTime Date { get; init; }
    public decimal Amount { get; init; }
    public string Currency { get; init; } = "AED";
    public decimal ExchangeRate { get; init; } = 1m;
    public Guid BankAccountId { get; init; }
    public string Method { get; init; } = string.Empty;
    public Guid? JournalEntryId { get; init; }
    public string? Reference { get; init; }
    public List<PaymentAllocationDto> Allocations { get; init; } = [];
}

public static class SalesMappers
{
    public static CustomerPaymentDto ToDto(this CustomerPayment p, string? contactName = null) => new()
    {
        Id = p.Id,
        Number = p.Number,
        ContactId = p.ContactId,
        ContactName = contactName,
        Date = p.Date,
        Amount = p.Amount,
        Currency = p.Currency,
        ExchangeRate = p.ExchangeRate,
        BankAccountId = p.BankAccountId,
        Method = p.Method.ToString(),
        JournalEntryId = p.JournalEntryId,
        Reference = p.Reference,
        Allocations = [.. p.Allocations.Select(a => new PaymentAllocationDto { InvoiceId = a.InvoiceId, Amount = a.Amount })],
    };

    public static InvoiceDto ToDto(this Invoice i, string? contactName = null) => new()
    {
        Id = i.Id,
        Number = i.Number,
        ContactId = i.ContactId,
        ContactName = contactName,
        Date = i.Date,
        DueDate = i.DueDate,
        Status = i.Status.ToString(),
        Currency = i.Currency,
        ExchangeRate = i.ExchangeRate,
        SubTotal = i.SubTotal,
        TaxTotal = i.TaxTotal,
        Total = i.Total,
        AmountPaid = i.AmountPaid,
        BalanceDue = i.BalanceDue,
        BaseTotal = i.BaseTotal,
        JournalEntryId = i.JournalEntryId,
        Notes = i.Notes,
        Lines = [.. i.Lines.Select(l => new InvoiceLineDto
        {
            Id = l.Id,
            Description = l.Description,
            Quantity = l.Quantity,
            UnitPrice = l.UnitPrice,
            AccountId = l.AccountId,
            TaxRateId = l.TaxRateId,
            TaxRatePercent = l.TaxRatePercent,
            LineAmount = l.LineAmount,
            LineTax = l.LineTax,
        })],
    };

    public static InvoiceSummaryDto ToSummaryDto(this Invoice i, string? contactName = null) => new()
    {
        Id = i.Id,
        Number = i.Number,
        ContactId = i.ContactId,
        ContactName = contactName,
        Date = i.Date,
        DueDate = i.DueDate,
        Status = i.Status.ToString(),
        Currency = i.Currency,
        Total = i.Total,
        BalanceDue = i.BalanceDue,
    };
}
