using Microsoft.EntityFrameworkCore;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Contacts.Entities;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Sales.Entities;

namespace Xorva.Modules.Commerce.Contacts.Common;

/// <summary>Commerce's implementation of the Accounting <see cref="IPartyDirectory"/> port over Contacts and Products.</summary>
public sealed class PartyDirectory : IPartyDirectory
{
    private readonly IXorvaDbContext _db;
    public PartyDirectory(IXorvaDbContext db) => _db = db;

    public async Task<PartyInfo?> FindPartyAsync(Guid companyId, Guid contactId, CancellationToken ct) =>
        await _db.Set<Contact>().AsNoTracking()
            .Where(c => c.Id == contactId && c.CompanyId == companyId)
            .Select(c => new PartyInfo(c.Id, c.Name, c.ContactType, c.IsActive, c.TaxNumber, c.ControlAccountId, c.DefaultTaxRateId, c.PaymentTermDays))
            .FirstOrDefaultAsync(ct);

    public async Task<IReadOnlyDictionary<Guid, string>> PartyNamesAsync(IEnumerable<Guid> contactIds, CancellationToken ct)
    {
        var ids = contactIds.Distinct().ToList();
        if (ids.Count == 0) return new Dictionary<Guid, string>();
        return await _db.Set<Contact>().AsNoTracking().Where(c => ids.Contains(c.Id)).ToDictionaryAsync(c => c.Id, c => c.Name, ct);
    }

    public async Task<IReadOnlyList<PartyInfo>> ListPartiesAsync(Guid companyId, ContactType? type, int take, CancellationToken ct)
    {
        var q = _db.Set<Contact>().AsNoTracking().Where(c => c.CompanyId == companyId && c.IsActive);
        if (type is { } t) q = q.Where(c => c.ContactType == t || c.ContactType == ContactType.Both);
        return await q.OrderBy(c => c.Name).Take(take)
            .Select(c => new PartyInfo(c.Id, c.Name, c.ContactType, c.IsActive, c.TaxNumber, c.ControlAccountId, c.DefaultTaxRateId, c.PaymentTermDays))
            .ToListAsync(ct);
    }

    public async Task<IReadOnlyList<ItemInfo>> FindItemsAsync(Guid companyId, IEnumerable<Guid> productIds, CancellationToken ct)
    {
        var ids = productIds.Distinct().ToList();
        if (ids.Count == 0) return [];
        return await _db.Set<Product>().AsNoTracking()
            .Where(p => p.CompanyId == companyId && ids.Contains(p.Id))
            .Select(p => new ItemInfo(p.Id, p.Name, p.IsActive, p.SalesAccountId, p.TaxRateId, p.PurchaseAccountId, p.PurchaseTaxRateId, p.SalesPrice, p.PurchasePrice))
            .ToListAsync(ct);
    }

    public async Task<IReadOnlyList<ItemInfo>> ListItemsAsync(Guid companyId, int take, CancellationToken ct) =>
        await _db.Set<Product>().AsNoTracking()
            .Where(p => p.CompanyId == companyId && p.IsActive)
            .OrderBy(p => p.Name).Take(take)
            .Select(p => new ItemInfo(p.Id, p.Name, p.IsActive, p.SalesAccountId, p.TaxRateId, p.PurchaseAccountId, p.PurchaseTaxRateId, p.SalesPrice, p.PurchasePrice))
            .ToListAsync(ct);
}
