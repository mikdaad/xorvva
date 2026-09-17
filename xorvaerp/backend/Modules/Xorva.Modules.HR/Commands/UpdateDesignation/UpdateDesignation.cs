using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.HR.DTOs;
using Xorva.Modules.HR.Entities;

namespace Xorva.Modules.HR.Commands.UpdateDesignation;

public record UpdateDesignationCommand : IRequest<ApiResponse<DesignationDto>>
{
    public Guid Id { get; init; }
    public string Title { get; init; } = string.Empty;
    public string? Code { get; init; }
    public string? Category { get; init; }
    public string? Description { get; init; }
    public bool IsActive { get; init; } = true;
}

public class UpdateDesignationValidator : AbstractValidator<UpdateDesignationCommand>
{
    public UpdateDesignationValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Title).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Category).MaximumLength(60);
    }
}

public class UpdateDesignationCommandHandler : IRequestHandler<UpdateDesignationCommand, ApiResponse<DesignationDto>>
{
    private readonly IXorvaDbContext _db;

    public UpdateDesignationCommandHandler(IXorvaDbContext db)
    {
        _db = db;
    }

    public async Task<ApiResponse<DesignationDto>> Handle(UpdateDesignationCommand request, CancellationToken ct)
    {
        var designation = await _db.Set<Designation>().FirstOrDefaultAsync(d => d.Id == request.Id, ct)
            ?? throw new NotFoundException("Designation", request.Id);

        var title = request.Title.Trim();
        var clash = await _db.Set<Designation>()
            .AnyAsync(d => d.CompanyId == designation.CompanyId && d.Id != designation.Id && d.Title == title, ct);
        if (clash)
            throw new ConflictException("Another designation with this title already exists.");

        designation.Title = title;
        designation.Code = request.Code?.Trim().ToUpper();
        designation.Category = request.Category?.Trim();
        designation.Description = request.Description?.Trim();
        designation.IsActive = request.IsActive;
        await _db.SaveChangesAsync(ct);

        var count = await _db.Set<Employee>().CountAsync(e => e.DesignationId == designation.Id && e.IsActive, ct);
        return ApiResponse<DesignationDto>.Ok(designation.ToDto(count), "Designation updated.");
    }
}
