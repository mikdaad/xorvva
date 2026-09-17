using Xorva.Modules.Accounting.Banking.Entities;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Tax.Entities;

namespace Xorva.Modules.Accounting.DTOs;

public record BankAccountDto
{
    public Guid Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public Guid AccountId { get; init; }
    public string? BankName { get; init; }
    public string? AccountNumber { get; init; }
    public string? Iban { get; init; }
    public bool IsActive { get; init; }
}

public record TaxRateDto
{
    public Guid Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public decimal Rate { get; init; }
    public TaxAppliesTo AppliesTo { get; init; }
    public Guid? OutputAccountId { get; init; }
    public Guid? InputAccountId { get; init; }
    public bool IsActive { get; init; }
}

public static class MasterDataMappers
{
    public static TaxRateDto ToDto(this TaxRate t) => new()
    {
        Id = t.Id,
        Name = t.Name,
        Rate = t.Rate,
        AppliesTo = t.AppliesTo,
        OutputAccountId = t.OutputAccountId,
        InputAccountId = t.InputAccountId,
        IsActive = t.IsActive,
    };

    public static BankAccountDto ToDto(this BankAccount b) => new()
    {
        Id = b.Id,
        Name = b.Name,
        AccountId = b.AccountId,
        BankName = b.BankName,
        AccountNumber = b.AccountNumber,
        Iban = b.Iban,
        IsActive = b.IsActive,
    };
}
