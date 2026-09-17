using Xorva.Modules.Accounting.Sales.Entities;

namespace Xorva.Modules.Accounting.DTOs;

public record CreditNoteLineDto
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

public record CreditNoteDto
{
    public Guid Id { get; init; }
    public string Number { get; init; } = string.Empty;
    public Guid ContactId { get; init; }
    public string? ContactName { get; init; }
    public Guid? InvoiceId { get; init; }
    public DateTime Date { get; init; }
    public string Status { get; init; } = string.Empty;
    public string Currency { get; init; } = "AED";
    public decimal SubTotal { get; init; }
    public decimal TaxTotal { get; init; }
    public decimal Total { get; init; }
    public Guid? JournalEntryId { get; init; }
    public string? Reason { get; init; }
    public List<CreditNoteLineDto> Lines { get; init; } = [];
}

public record CreditNoteSummaryDto
{
    public Guid Id { get; init; }
    public string Number { get; init; } = string.Empty;
    public Guid ContactId { get; init; }
    public string? ContactName { get; init; }
    public DateTime Date { get; init; }
    public string Status { get; init; } = string.Empty;
    public decimal Total { get; init; }
}

public static class CreditNoteMappers
{
    public static CreditNoteDto ToDto(this CreditNote c, string? contactName = null) => new()
    {
        Id = c.Id, Number = c.Number, ContactId = c.ContactId, ContactName = contactName, InvoiceId = c.InvoiceId,
        Date = c.Date, Status = c.Status.ToString(), Currency = c.Currency,
        SubTotal = c.SubTotal, TaxTotal = c.TaxTotal, Total = c.Total, JournalEntryId = c.JournalEntryId, Reason = c.Reason,
        Lines = [.. c.Lines.Select(l => new CreditNoteLineDto
        {
            Id = l.Id, Description = l.Description, Quantity = l.Quantity, UnitPrice = l.UnitPrice,
            AccountId = l.AccountId, TaxRateId = l.TaxRateId, TaxRatePercent = l.TaxRatePercent,
            LineAmount = l.LineAmount, LineTax = l.LineTax,
        })],
    };

    public static CreditNoteSummaryDto ToSummaryDto(this CreditNote c, string? contactName = null) => new()
    {
        Id = c.Id, Number = c.Number, ContactId = c.ContactId, ContactName = contactName,
        Date = c.Date, Status = c.Status.ToString(), Total = c.Total,
    };
}
