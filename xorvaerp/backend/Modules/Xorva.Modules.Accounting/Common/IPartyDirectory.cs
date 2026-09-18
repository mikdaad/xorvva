using Xorva.Modules.Accounting.Enums;

namespace Xorva.Modules.Accounting.Common;

/// <summary>
/// Read-only view of customers / suppliers / items that the Accounting module needs for voucher
/// entry and AI extraction. Those masters are owned by the Commerce module (Contacts, Products),
/// which Accounting must NOT reference — so Accounting declares this port and Commerce registers
/// the adapter (<c>PartyDirectory</c>) in <c>AddCommerceModule</c>. Same pattern as
/// <c>IJournalPoster</c>, in the other direction.
/// </summary>
public interface IPartyDirectory
{
    Task<PartyInfo?> FindPartyAsync(Guid companyId, Guid contactId, CancellationToken ct);
    Task<IReadOnlyDictionary<Guid, string>> PartyNamesAsync(IEnumerable<Guid> contactIds, CancellationToken ct);
    Task<IReadOnlyList<PartyInfo>> ListPartiesAsync(Guid companyId, ContactType? type, int take, CancellationToken ct);
    Task<IReadOnlyList<ItemInfo>> FindItemsAsync(Guid companyId, IEnumerable<Guid> productIds, CancellationToken ct);
    Task<IReadOnlyList<ItemInfo>> ListItemsAsync(Guid companyId, int take, CancellationToken ct);
}

public sealed record PartyInfo(
    Guid Id, string Name, ContactType ContactType, bool IsActive, string? TaxNumber,
    Guid? ControlAccountId, Guid? DefaultTaxRateId, int PaymentTermDays);

public sealed record ItemInfo(
    Guid Id, string Name, bool IsActive,
    Guid? SalesAccountId, Guid? TaxRateId, Guid? PurchaseAccountId, Guid? PurchaseTaxRateId, decimal SalesPrice, decimal? PurchasePrice);
