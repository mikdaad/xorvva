using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Assets.Entities;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Ledger.Entities;

namespace Xorva.Modules.Accounting.Assets.Commands.CreateFixedAsset;

public record CreateFixedAssetCommand : IRequest<ApiResponse<FixedAssetDto>>
{
    public Guid? CompanyId { get; init; }
    public string Name { get; init; } = string.Empty;
    public string? Code { get; init; }
    public string? Category { get; init; }
    public DateTime AcquisitionDate { get; init; }
    public decimal Cost { get; init; }
    public decimal SalvageValue { get; init; }
    public int UsefulLifeMonths { get; init; }
    public Guid AssetAccountId { get; init; }
    public Guid AccumulatedDepreciationAccountId { get; init; }
    public Guid DepreciationExpenseAccountId { get; init; }
}

public class CreateFixedAssetValidator : AbstractValidator<CreateFixedAssetCommand>
{
    public CreateFixedAssetValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Asset name is required.").MaximumLength(150);
        RuleFor(x => x.Cost).GreaterThan(0);
        RuleFor(x => x.SalvageValue).GreaterThanOrEqualTo(0).LessThan(x => x.Cost).WithMessage("Salvage value must be below cost.");
        RuleFor(x => x.UsefulLifeMonths).InclusiveBetween(1, 1200);
        RuleFor(x => x.AssetAccountId).NotEmpty();
        RuleFor(x => x.AccumulatedDepreciationAccountId).NotEmpty();
        RuleFor(x => x.DepreciationExpenseAccountId).NotEmpty();
    }
}

public class CreateFixedAssetHandler : IRequestHandler<CreateFixedAssetCommand, ApiResponse<FixedAssetDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public CreateFixedAssetHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<FixedAssetDto>> Handle(CreateFixedAssetCommand request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        await AccountingGuard.EnsureAccountingActiveAsync(_db, companyId, ct);

        var ids = new[] { request.AssetAccountId, request.AccumulatedDepreciationAccountId, request.DepreciationExpenseAccountId };
        var valid = await _db.Set<Account>().CountAsync(a => a.CompanyId == companyId && ids.Contains(a.Id), ct);
        if (valid != ids.Distinct().Count())
            throw new BadRequestException("One or more selected accounts do not exist in this company's chart.");

        var asset = new FixedAsset
        {
            TenantId = _tenant.TenantId,
            CompanyId = companyId,
            Name = request.Name.Trim(),
            Code = request.Code?.Trim(),
            Category = request.Category?.Trim(),
            AcquisitionDate = DateTime.SpecifyKind(request.AcquisitionDate.Date, DateTimeKind.Utc),
            Cost = Math.Round(request.Cost, 2),
            SalvageValue = Math.Round(request.SalvageValue, 2),
            UsefulLifeMonths = request.UsefulLifeMonths,
            AccumulatedDepreciation = 0m,
            AssetAccountId = request.AssetAccountId,
            AccumulatedDepreciationAccountId = request.AccumulatedDepreciationAccountId,
            DepreciationExpenseAccountId = request.DepreciationExpenseAccountId,
        };

        _db.Set<FixedAsset>().Add(asset);
        await _db.SaveChangesAsync(ct);
        return ApiResponse<FixedAssetDto>.Ok(asset.ToDto(), "Fixed asset registered.");
    }
}
