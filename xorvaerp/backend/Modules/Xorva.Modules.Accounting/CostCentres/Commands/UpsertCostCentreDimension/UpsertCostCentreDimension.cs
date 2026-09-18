using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.CostCentres.Entities;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Enums;

namespace Xorva.Modules.Accounting.CostCentres.Commands.UpsertCostCentreDimension;

/// <summary>Create (Id null) or update a cost-centre dimension — Project / Department / Location / …</summary>
public record UpsertCostCentreDimensionCommand : IRequest<ApiResponse<CostCentreDimensionDto>>
{
    public Guid? Id { get; init; }
    public Guid? CompanyId { get; init; }
    public CostCentreDimensionType DimensionType { get; init; } = CostCentreDimensionType.Custom;
    public string Name { get; init; } = string.Empty;
    public string Code { get; init; } = string.Empty;
    public string? Description { get; init; }
    public bool IsMandatory { get; init; }
    public bool IsActive { get; init; } = true;
    public int SortOrder { get; init; }
}

public class UpsertCostCentreDimensionValidator : AbstractValidator<UpsertCostCentreDimensionCommand>
{
    public UpsertCostCentreDimensionValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Code).NotEmpty().MaximumLength(20).Matches("^[A-Za-z0-9_-]+$").WithMessage("Code may contain letters, digits, '-' and '_' only.");
        RuleFor(x => x.Description).MaximumLength(500);
        RuleFor(x => x.DimensionType).IsInEnum();
    }
}

public class UpsertCostCentreDimensionHandler : IRequestHandler<UpsertCostCentreDimensionCommand, ApiResponse<CostCentreDimensionDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public UpsertCostCentreDimensionHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<CostCentreDimensionDto>> Handle(UpsertCostCentreDimensionCommand request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        await AccountingGuard.EnsureAccountingActiveAsync(_db, companyId, ct);
        var code = request.Code.Trim().ToUpperInvariant();

        var duplicate = await _db.Set<CostCentreDimension>()
            .AnyAsync(d => d.CompanyId == companyId && d.Code == code && d.Id != request.Id, ct);
        if (duplicate) throw new ConflictException($"A dimension with code '{code}' already exists.");

        CostCentreDimension dimension;
        if (request.Id is { } id)
        {
            dimension = await _db.Set<CostCentreDimension>().FirstOrDefaultAsync(d => d.Id == id && d.CompanyId == companyId, ct)
                ?? throw new NotFoundException("Cost centre dimension", id);
        }
        else
        {
            dimension = new CostCentreDimension { TenantId = _tenant.TenantId, CompanyId = companyId };
            _db.Set<CostCentreDimension>().Add(dimension);
        }

        dimension.DimensionType = request.DimensionType;
        dimension.Name = request.Name.Trim();
        dimension.Code = code;
        dimension.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        dimension.IsMandatory = request.IsMandatory;
        dimension.IsActive = request.IsActive;
        dimension.SortOrder = request.SortOrder;
        await _db.SaveChangesAsync(ct);

        var count = await _db.Set<CostCentre>().CountAsync(c => c.DimensionId == dimension.Id, ct);
        return ApiResponse<CostCentreDimensionDto>.Ok(dimension.ToDto(count), request.Id is null ? "Dimension created." : "Dimension updated.");
    }
}
