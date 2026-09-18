using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.CostCentres.Entities;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Ledger.Entities;

namespace Xorva.Modules.Accounting.CostCentres.Commands.UpsertCostCentre;

/// <summary>
/// Create (Id null) or update a cost centre inside a dimension. <c>Level</c> is derived by the
/// <c>trg_cost_centres_level</c> trigger from <see cref="ParentId"/>; this handler mirrors the same
/// rules (same company + dimension, no self-parent, parent must be a group) so SQLite tests behave alike.
/// </summary>
public record UpsertCostCentreCommand : IRequest<ApiResponse<CostCentreDto>>
{
    public Guid? Id { get; init; }
    public Guid? CompanyId { get; init; }
    public Guid DimensionId { get; init; }
    public string Code { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public Guid? ParentId { get; init; }
    public bool IsGroup { get; init; }
    public bool IsActive { get; init; } = true;
    public decimal? Budget { get; init; }
    public DateOnly? StartDate { get; init; }
    public DateOnly? EndDate { get; init; }
}

public class UpsertCostCentreValidator : AbstractValidator<UpsertCostCentreCommand>
{
    public UpsertCostCentreValidator()
    {
        RuleFor(x => x.DimensionId).NotEmpty();
        RuleFor(x => x.Code).NotEmpty().MaximumLength(30);
        RuleFor(x => x.Name).NotEmpty().MaximumLength(150);
        RuleFor(x => x.Budget).GreaterThanOrEqualTo(0m).When(x => x.Budget.HasValue);
        RuleFor(x => x).Must(x => x.StartDate is null || x.EndDate is null || x.EndDate >= x.StartDate)
            .WithMessage("End date must be on or after the start date.");
    }
}

public class UpsertCostCentreHandler : IRequestHandler<UpsertCostCentreCommand, ApiResponse<CostCentreDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public UpsertCostCentreHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<CostCentreDto>> Handle(UpsertCostCentreCommand request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        await AccountingGuard.EnsureAccountingActiveAsync(_db, companyId, ct);

        var dimension = await _db.Set<CostCentreDimension>()
            .FirstOrDefaultAsync(d => d.Id == request.DimensionId && d.CompanyId == companyId, ct)
            ?? throw new NotFoundException("Cost centre dimension", request.DimensionId);

        var code = request.Code.Trim().ToUpperInvariant();
        var duplicate = await _db.Set<CostCentre>()
            .AnyAsync(c => c.CompanyId == companyId && c.DimensionId == dimension.Id && c.Code == code && c.Id != request.Id, ct);
        if (duplicate) throw new ConflictException($"Cost centre '{code}' already exists in {dimension.Name}.");

        short level = 1;
        if (request.ParentId is { } parentId)
        {
            if (parentId == request.Id) throw new BadRequestException("A cost centre cannot be its own parent.");
            var parent = await _db.Set<CostCentre>().FirstOrDefaultAsync(c => c.Id == parentId && c.CompanyId == companyId, ct)
                ?? throw new NotFoundException("Parent cost centre", parentId);
            if (parent.DimensionId != dimension.Id) throw new BadRequestException("Parent cost centre must belong to the same dimension.");
            if (!parent.IsGroup) throw new BadRequestException($"'{parent.Name}' is not a group — only groups can have children.");
            level = (short)(parent.Level + 1);
        }

        CostCentre cc;
        if (request.Id is { } id)
        {
            cc = await _db.Set<CostCentre>().FirstOrDefaultAsync(c => c.Id == id && c.CompanyId == companyId, ct)
                ?? throw new NotFoundException("Cost centre", id);
            if (cc.DimensionId != dimension.Id) throw new BadRequestException("A cost centre cannot move between dimensions.");
            if (cc.IsGroup && !request.IsGroup && await _db.Set<CostCentre>().AnyAsync(c => c.ParentId == cc.Id, ct))
                throw new BadRequestException($"'{cc.Name}' still has children and cannot become a posting cost centre.");
            if (!cc.IsGroup && request.IsGroup && await _db.Set<JournalLine>().AnyAsync(l => l.CostCentreId == cc.Id, ct))
                throw new BadRequestException($"'{cc.Name}' has journal lines and cannot be converted to a group.");
        }
        else
        {
            cc = new CostCentre { TenantId = _tenant.TenantId, CompanyId = companyId, DimensionId = dimension.Id };
            _db.Set<CostCentre>().Add(cc);
        }

        cc.Code = code;
        cc.Name = request.Name.Trim();
        cc.ParentId = request.ParentId;
        cc.Level = level;
        cc.IsGroup = request.IsGroup;
        cc.IsActive = request.IsActive;
        cc.Budget = request.Budget;
        cc.StartDate = request.StartDate;
        cc.EndDate = request.EndDate;
        await _db.SaveChangesAsync(ct);

        return ApiResponse<CostCentreDto>.Ok(cc.ToDto(dimension.Name), request.Id is null ? "Cost centre created." : "Cost centre updated.");
    }
}
