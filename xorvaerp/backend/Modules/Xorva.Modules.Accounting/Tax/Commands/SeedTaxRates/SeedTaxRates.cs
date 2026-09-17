using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Ledger.Entities;
using Xorva.Modules.Accounting.Tax.Entities;

namespace Xorva.Modules.Accounting.Tax.Commands.SeedTaxRates;

/// <summary>Seeds the UAE default tax rates (5% Standard, 0% Zero-rated, Exempt), wired to the VAT accounts.</summary>
public record SeedTaxRatesCommand : IRequest<ApiResponse<int>>
{
    public Guid? CompanyId { get; init; }
}

public class SeedTaxRatesHandler : IRequestHandler<SeedTaxRatesCommand, ApiResponse<int>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public SeedTaxRatesHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<int>> Handle(SeedTaxRatesCommand request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        await AccountingGuard.EnsureAccountingActiveAsync(_db, companyId, ct);

        if (await _db.Set<TaxRate>().AnyAsync(t => t.CompanyId == companyId, ct))
            throw new ConflictException("Tax rates already exist for this company.");

        var settings = await _db.Set<AccountingSettings>().FirstOrDefaultAsync(s => s.CompanyId == companyId, ct)
            ?? throw new BadRequestException("Create the chart of accounts first (no accounting settings).");

        TaxRate Rate(string name, decimal rate) => new()
        {
            TenantId = _tenant.TenantId,
            CompanyId = companyId,
            Name = name,
            Rate = rate,
            AppliesTo = TaxAppliesTo.Both,
            OutputAccountId = settings.VatOutputAccountId,
            InputAccountId = settings.VatInputAccountId,
            IsActive = true,
        };

        var rates = new[]
        {
            Rate("VAT 5% (Standard)", 5m),
            Rate("Zero-rated (0%)", 0m),
            Rate("Exempt", 0m),
        };

        _db.Set<TaxRate>().AddRange(rates);
        await _db.SaveChangesAsync(ct);
        return ApiResponse<int>.Ok(rates.Length, $"Seeded {rates.Length} tax rates.");
    }
}
