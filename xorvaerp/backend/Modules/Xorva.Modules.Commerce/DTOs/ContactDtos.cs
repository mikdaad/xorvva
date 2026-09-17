using Xorva.Modules.Accounting.Contacts.Entities;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Sales.Entities;

// Kept in the Accounting.DTOs namespace (physically in the Commerce assembly) so existing
// call sites — contact.ToDto(), product.ToDto() — resolve unchanged. The mapper class is
// renamed to avoid a type-name clash with Accounting's MasterDataMappers across assemblies.
namespace Xorva.Modules.Accounting.DTOs;

public record ContactDto
{
    public Guid Id { get; init; }
    public string Code { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public ContactType ContactType { get; init; }
    public string? TaxNumber { get; init; }
    public string? Email { get; init; }
    public string? Phone { get; init; }
    public int PaymentTermDays { get; init; }
    public decimal OutstandingBalance { get; init; }
    public bool IsActive { get; init; }
}

public record ProductDto
{
    public Guid Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public string? Code { get; init; }
    public decimal SalesPrice { get; init; }
    public Guid? SalesAccountId { get; init; }
    public Guid? TaxRateId { get; init; }
    public string? Description { get; init; }
    public bool IsActive { get; init; }
}

public static class CommerceMasterDataMappers
{
    public static ContactDto ToDto(this Contact c) => new()
    {
        Id = c.Id,
        Code = c.Code,
        Name = c.Name,
        ContactType = c.ContactType,
        TaxNumber = c.TaxNumber,
        Email = c.Email,
        Phone = c.Phone,
        PaymentTermDays = c.PaymentTermDays,
        OutstandingBalance = c.OutstandingBalance,
        IsActive = c.IsActive,
    };

    public static ProductDto ToDto(this Product p) => new()
    {
        Id = p.Id,
        Name = p.Name,
        Code = p.Code,
        SalesPrice = p.SalesPrice,
        SalesAccountId = p.SalesAccountId,
        TaxRateId = p.TaxRateId,
        Description = p.Description,
        IsActive = p.IsActive,
    };
}
