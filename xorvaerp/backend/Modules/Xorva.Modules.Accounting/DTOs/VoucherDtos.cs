using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Vouchers.Common;
using Xorva.Modules.Accounting.Vouchers.Entities;

namespace Xorva.Modules.Accounting.DTOs;

/// <summary>One of the F4–F9 voucher families, for the entry screen's type picker.</summary>
public record VoucherTypeDto
{
    public VoucherType Type { get; init; }
    public string Shortcut { get; init; } = string.Empty;
    public string Label { get; init; } = string.Empty;
    public string Description { get; init; } = string.Empty;
    public VoucherMode Mode { get; init; }
    public bool RequiresParty { get; init; }
    public TradeDirection? Direction { get; init; }
    public string Prefix { get; init; } = string.Empty;
}

public record VoucherLineDto
{
    public Guid Id { get; init; }
    public int LineNumber { get; init; }
    public Guid AccountId { get; init; }
    public string? AccountCode { get; init; }
    public string? AccountName { get; init; }
    public Guid? ProductId { get; init; }
    public string? Description { get; init; }
    public string DrCr { get; init; } = "DR";
    public decimal Quantity { get; init; }
    public decimal UnitPrice { get; init; }
    public decimal DiscountPct { get; init; }
    public decimal LineAmount { get; init; }
    public Guid? TaxRateId { get; init; }
    public decimal TaxRatePercent { get; init; }
    public decimal TaxAmount { get; init; }
    public decimal LineTotal { get; init; }
    public decimal BaseLineTotal { get; init; }
    public Guid? CostCentreId { get; init; }
    public string? CostCentreName { get; init; }
}

public record VoucherDto
{
    public Guid Id { get; init; }
    public Guid CompanyId { get; init; }
    public VoucherType VoucherType { get; init; }
    public string VoucherNumber { get; init; } = string.Empty;
    public VoucherStatus Status { get; init; }
    public Guid? ContactId { get; init; }
    public string? ContactName { get; init; }
    public DateOnly VoucherDate { get; init; }
    public DateOnly? DueDate { get; init; }
    public DateOnly? SupplyDate { get; init; }
    public string Currency { get; init; } = "AED";
    public decimal ExchangeRate { get; init; }
    public decimal SubTotal { get; init; }
    public decimal DiscountTotal { get; init; }
    public decimal TaxTotal { get; init; }
    public decimal TotalAmount { get; init; }
    public decimal BaseTotalAmount { get; init; }
    public decimal AmountPaid { get; init; }
    public decimal? AmountDue { get; init; }
    public string? Reference { get; init; }
    public string? Narration { get; init; }
    public string? PlaceOfSupply { get; init; }
    public string? BuyerTrn { get; init; }
    public string? SellerTrn { get; init; }
    public Guid? JournalEntryId { get; init; }
    public string? EntryNumber { get; init; }
    public DateTime? PostedAt { get; init; }
    public Guid? ReversedById { get; init; }
    public Guid? ReversalOfId { get; init; }
    public string? ReversalReason { get; init; }
    public DateTime CreatedAt { get; init; }
    public List<VoucherLineDto> Lines { get; init; } = [];
}

/// <summary>Row of the transaction register (accounting.get_transaction_register).</summary>
public record VoucherRegisterRowDto
{
    public Guid Id { get; init; }
    public Guid CompanyId { get; init; }
    public DateOnly VoucherDate { get; init; }
    public string VoucherNumber { get; init; } = string.Empty;
    public VoucherType VoucherType { get; init; }
    public VoucherStatus Status { get; init; }
    public string? ContactName { get; init; }
    public string? Reference { get; init; }
    public string? Narration { get; init; }
    public string Currency { get; init; } = "AED";
    public decimal TotalAmount { get; init; }
    public decimal BaseTotalAmount { get; init; }
    public decimal? AmountDue { get; init; }
    public Guid? JournalEntryId { get; init; }
    public string? EntryNumber { get; init; }
    public string? CreatedByName { get; init; }
    public DateTime CreatedAt { get; init; }
}

public record VoucherRegisterDto
{
    public List<VoucherRegisterRowDto> Rows { get; init; } = [];
    public long TotalCount { get; init; }
    /// <summary>Sum of BaseTotalAmount across the whole filtered window (not just this page).</summary>
    public decimal TotalBaseAmount { get; init; }
    public int Limit { get; init; }
    public int Offset { get; init; }
}

public static class VoucherMappers
{
    public static VoucherTypeDto ToDto(this VoucherTypeConfig c) => new()
    {
        Type = c.Type, Shortcut = c.Shortcut, Label = c.Label, Description = c.Description,
        Mode = c.Mode, RequiresParty = c.RequiresParty, Direction = c.Direction, Prefix = c.Prefix,
    };

    public static VoucherLineDto ToDto(this VoucherLine l, string? accountCode = null, string? accountName = null, string? costCentreName = null) => new()
    {
        Id = l.Id, LineNumber = l.LineNumber, AccountId = l.AccountId, AccountCode = accountCode, AccountName = accountName,
        ProductId = l.ProductId, Description = l.Description, DrCr = l.DrCr,
        Quantity = l.Quantity, UnitPrice = l.UnitPrice, DiscountPct = l.DiscountPct, LineAmount = l.LineAmount,
        TaxRateId = l.TaxRateId, TaxRatePercent = l.TaxRatePercent, TaxAmount = l.TaxAmount, LineTotal = l.LineTotal,
        BaseLineTotal = l.BaseLineTotal, CostCentreId = l.CostCentreId, CostCentreName = costCentreName,
    };

    public static VoucherDto ToDto(this Voucher v, IEnumerable<VoucherLineDto> lines, string? contactName = null, string? entryNumber = null) => new()
    {
        Id = v.Id, CompanyId = v.CompanyId, VoucherType = v.VoucherType, VoucherNumber = v.VoucherNumber, Status = v.Status,
        ContactId = v.ContactId, ContactName = contactName, VoucherDate = v.VoucherDate, DueDate = v.DueDate, SupplyDate = v.SupplyDate,
        Currency = v.Currency, ExchangeRate = v.ExchangeRate,
        SubTotal = v.SubTotal, DiscountTotal = v.DiscountTotal, TaxTotal = v.TaxTotal, TotalAmount = v.TotalAmount,
        BaseTotalAmount = v.BaseTotalAmount, AmountPaid = v.AmountPaid, AmountDue = v.AmountDue,
        Reference = v.Reference, Narration = v.Narration, PlaceOfSupply = v.PlaceOfSupply, BuyerTrn = v.BuyerTrn, SellerTrn = v.SellerTrn,
        JournalEntryId = v.JournalEntryId, EntryNumber = entryNumber, PostedAt = v.PostedAt,
        ReversedById = v.ReversedById, ReversalOfId = v.ReversalOfId, ReversalReason = v.ReversalReason,
        CreatedAt = v.CreatedAt,
        Lines = [.. lines.OrderBy(l => l.LineNumber)],
    };

    public static VoucherRegisterRowDto ToDto(this RpcRegisterRow r) => new()
    {
        Id = r.Id, CompanyId = r.CompanyId, VoucherDate = r.VoucherDate, VoucherNumber = r.VoucherNumber,
        VoucherType = Enum.Parse<VoucherType>(r.VoucherType), Status = Enum.Parse<VoucherStatus>(r.Status),
        ContactName = r.ContactName, Reference = r.Reference, Narration = r.Narration, Currency = r.Currency,
        TotalAmount = r.TotalAmount, BaseTotalAmount = r.BaseTotalAmount, AmountDue = r.AmountDue,
        JournalEntryId = r.JournalEntryId, EntryNumber = r.EntryNumber, CreatedByName = r.CreatedByName, CreatedAt = r.CreatedAt,
    };
}
