using Xorva.Modules.Accounting.Purchases.Entities;

namespace Xorva.Modules.Accounting.DTOs;

public record DebitNoteLineDto
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

public record DebitNoteDto
{
    public Guid Id { get; init; }
    public string Number { get; init; } = string.Empty;
    public Guid ContactId { get; init; }
    public string? ContactName { get; init; }
    public Guid? BillId { get; init; }
    public DateTime Date { get; init; }
    public string Status { get; init; } = string.Empty;
    public string Currency { get; init; } = "AED";
    public decimal SubTotal { get; init; }
    public decimal TaxTotal { get; init; }
    public decimal Total { get; init; }
    public Guid? JournalEntryId { get; init; }
    public string? Reason { get; init; }
    public List<DebitNoteLineDto> Lines { get; init; } = [];
}

public record DebitNoteSummaryDto
{
    public Guid Id { get; init; }
    public string Number { get; init; } = string.Empty;
    public Guid ContactId { get; init; }
    public string? ContactName { get; init; }
    public DateTime Date { get; init; }
    public string Status { get; init; } = string.Empty;
    public decimal Total { get; init; }
}

public static class DebitNoteMappers
{
    public static DebitNoteDto ToDto(this DebitNote d, string? contactName = null) => new()
    {
        Id = d.Id, Number = d.Number, ContactId = d.ContactId, ContactName = contactName, BillId = d.BillId,
        Date = d.Date, Status = d.Status.ToString(), Currency = d.Currency,
        SubTotal = d.SubTotal, TaxTotal = d.TaxTotal, Total = d.Total, JournalEntryId = d.JournalEntryId, Reason = d.Reason,
        Lines = [.. d.Lines.Select(l => new DebitNoteLineDto
        {
            Id = l.Id, Description = l.Description, Quantity = l.Quantity, UnitPrice = l.UnitPrice,
            AccountId = l.AccountId, TaxRateId = l.TaxRateId, TaxRatePercent = l.TaxRatePercent,
            LineAmount = l.LineAmount, LineTax = l.LineTax,
        })],
    };

    public static DebitNoteSummaryDto ToSummaryDto(this DebitNote d, string? contactName = null) => new()
    {
        Id = d.Id, Number = d.Number, ContactId = d.ContactId, ContactName = contactName,
        Date = d.Date, Status = d.Status.ToString(), Total = d.Total,
    };
}
