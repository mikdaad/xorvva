using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.Currency.Entities;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Ledger.Entities;

namespace Xorva.Modules.Accounting.Currency.Commands.UpsertExchangeRate;

/// <summary>Adds or updates the rate for a (currency, date) pair. One row per currency+date.</summary>
public record UpsertExchangeRateCommand : IRequest<ApiResponse<ExchangeRateDto>>
{
    public Guid? CompanyId { get; init; }
    public string CurrencyCode { get; init; } = string.Empty;
    public DateTime RateDate { get; init; }
    public decimal Rate { get; init; }
}

public class UpsertExchangeRateValidator : AbstractValidator<UpsertExchangeRateCommand>
{
    public UpsertExchangeRateValidator()
    {
        RuleFor(x => x.CurrencyCode).NotEmpty().Length(3).WithMessage("Use the 3-letter ISO currency code (e.g. USD).");
        RuleFor(x => x.RateDate).NotEmpty();
        RuleFor(x => x.Rate).GreaterThan(0).WithMessage("Rate must be greater than zero.");
    }
}

public class UpsertExchangeRateHandler : IRequestHandler<UpsertExchangeRateCommand, ApiResponse<ExchangeRateDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public UpsertExchangeRateHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<ExchangeRateDto>> Handle(UpsertExchangeRateCommand request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        await AccountingGuard.EnsureAccountingActiveAsync(_db, companyId, ct);

        var currency = request.CurrencyCode.Trim().ToUpperInvariant();
        var settings = await _db.Set<AccountingSettings>().FirstOrDefaultAsync(s => s.CompanyId == companyId, ct)
            ?? throw new BadRequestException("Create the chart of accounts first (no accounting settings).");
        if (string.Equals(currency, settings.BaseCurrency, StringComparison.OrdinalIgnoreCase))
            throw new BadRequestException($"{currency} is the base currency — its rate is always 1.");

        var date = DateTime.SpecifyKind(request.RateDate.Date, DateTimeKind.Utc);
        var rate = Math.Round(request.Rate, 6);

        var existing = await _db.Set<ExchangeRate>()
            .FirstOrDefaultAsync(r => r.CompanyId == companyId && r.CurrencyCode == currency && r.RateDate == date, ct);

        if (existing is not null)
        {
            existing.Rate = rate;
        }
        else
        {
            existing = new ExchangeRate
            {
                TenantId = _tenant.TenantId,
                CompanyId = companyId,
                CurrencyCode = currency,
                RateDate = date,
                Rate = rate,
            };
            _db.Set<ExchangeRate>().Add(existing);
        }

        await _db.SaveChangesAsync(ct);
        return ApiResponse<ExchangeRateDto>.Ok(existing.ToDto(), "Exchange rate saved.");
    }
}
