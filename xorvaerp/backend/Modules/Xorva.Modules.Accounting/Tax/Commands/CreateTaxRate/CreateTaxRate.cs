using FluentValidation;
using MediatR;
using Xorva.Core.Common;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Enums;
using Xorva.Modules.Accounting.Ledger.Entities;
using Xorva.Modules.Accounting.Tax.Entities;
using Microsoft.EntityFrameworkCore;

namespace Xorva.Modules.Accounting.Tax.Commands.CreateTaxRate;

public record CreateTaxRateCommand : IRequest<ApiResponse<TaxRateDto>>
{
    public Guid? CompanyId { get; init; }
    public string Name { get; init; } = string.Empty;
    public decimal Rate { get; init; }
    public TaxAppliesTo AppliesTo { get; init; }
}

public class CreateTaxRateValidator : AbstractValidator<CreateTaxRateCommand>
{
    public CreateTaxRateValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Tax name is required.").MaximumLength(60);
        RuleFor(x => x.Rate).InclusiveBetween(0, 100);
    }
}

public class CreateTaxRateHandler : IRequestHandler<CreateTaxRateCommand, ApiResponse<TaxRateDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public CreateTaxRateHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<TaxRateDto>> Handle(CreateTaxRateCommand request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        await AccountingGuard.EnsureAccountingActiveAsync(_db, companyId, ct);

        var settings = await _db.Set<AccountingSettings>().FirstOrDefaultAsync(s => s.CompanyId == companyId, ct);

        var tax = new TaxRate
        {
            TenantId = _tenant.TenantId,
            CompanyId = companyId,
            Name = request.Name.Trim(),
            Rate = Math.Round(request.Rate, 2),
            AppliesTo = request.AppliesTo,
            OutputAccountId = settings?.VatOutputAccountId,
            InputAccountId = settings?.VatInputAccountId,
            IsActive = true,
        };

        _db.Set<TaxRate>().Add(tax);
        await _db.SaveChangesAsync(ct);
        return ApiResponse<TaxRateDto>.Ok(tax.ToDto(), "Tax rate created.");
    }
}
