using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.HR.Common;
using Xorva.Modules.HR.DTOs;
using Xorva.Modules.HR.Entities;

namespace Xorva.Modules.HR.Commands.CreateDesignation;

public record CreateDesignationCommand : IRequest<ApiResponse<DesignationDto>>
{
    public Guid? CompanyId { get; init; }
    public string Title { get; init; } = string.Empty;
    public string? Code { get; init; }
    public string? Category { get; init; }
    public string? Description { get; init; }
}

public class CreateDesignationValidator : AbstractValidator<CreateDesignationCommand>
{
    public CreateDesignationValidator()
    {
        RuleFor(x => x.Title).NotEmpty().WithMessage("Title is required.").MaximumLength(100);
        RuleFor(x => x.Code).MaximumLength(20);
        RuleFor(x => x.Category).MaximumLength(60);
        RuleFor(x => x.Description).MaximumLength(500);
    }
}

public class CreateDesignationCommandHandler : IRequestHandler<CreateDesignationCommand, ApiResponse<DesignationDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public CreateDesignationCommandHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<DesignationDto>> Handle(CreateDesignationCommand request, CancellationToken ct)
    {
        var companyId = HrGuard.ResolveCompanyId(_tenant, request.CompanyId);
        await HrGuard.EnsureHrActiveAsync(_db, companyId, ct);

        var title = request.Title.Trim();
        var clash = await _db.Set<Designation>().AnyAsync(d => d.CompanyId == companyId && d.Title == title, ct);
        if (clash)
            throw new ConflictException("A designation with this title already exists.");

        var designation = new Designation
        {
            TenantId = _tenant.TenantId,
            CompanyId = companyId,
            Title = title,
            Code = request.Code?.Trim().ToUpper(),
            Category = request.Category?.Trim(),
            Description = request.Description?.Trim()
        };

        _db.Set<Designation>().Add(designation);
        await _db.SaveChangesAsync(ct);
        return ApiResponse<DesignationDto>.Ok(designation.ToDto(), "Designation created.");
    }
}
