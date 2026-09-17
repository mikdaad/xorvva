using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.HR.Common;
using Xorva.Modules.HR.DTOs;
using Xorva.Modules.HR.Entities;

namespace Xorva.Modules.HR.Commands.LeaveTypes;

// ─── Create ─────────────────────────────────────────────────────

public record CreateLeaveTypeCommand : IRequest<ApiResponse<LeaveTypeDto>>
{
    public Guid? CompanyId { get; init; }
    public string Name { get; init; } = string.Empty;
    public string Code { get; init; } = string.Empty;
    public decimal DefaultDays { get; init; }
    public bool IsPaid { get; init; } = true;
    public bool IsCarryForward { get; init; }
    public decimal MaxCarryForward { get; init; }
    public bool RequiresAttachment { get; init; }
    public string? Description { get; init; }
}

public class CreateLeaveTypeValidator : AbstractValidator<CreateLeaveTypeCommand>
{
    public CreateLeaveTypeValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Code).NotEmpty().MaximumLength(20);
        RuleFor(x => x.DefaultDays).GreaterThanOrEqualTo(0);
    }
}

public class CreateLeaveTypeCommandHandler : IRequestHandler<CreateLeaveTypeCommand, ApiResponse<LeaveTypeDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public CreateLeaveTypeCommandHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<LeaveTypeDto>> Handle(CreateLeaveTypeCommand request, CancellationToken ct)
    {
        var companyId = HrGuard.ResolveCompanyId(_tenant, request.CompanyId);
        await HrGuard.EnsureHrActiveAsync(_db, companyId, ct);

        var code = request.Code.Trim().ToUpper();
        if (await _db.Set<LeaveType>().AnyAsync(t => t.CompanyId == companyId && t.Code == code, ct))
            throw new ConflictException("A leave type with this code already exists.");

        var type = new LeaveType
        {
            TenantId = _tenant.TenantId,
            CompanyId = companyId,
            Name = request.Name.Trim(),
            Code = code,
            DefaultDays = request.DefaultDays,
            IsPaid = request.IsPaid,
            IsCarryForward = request.IsCarryForward,
            MaxCarryForward = request.MaxCarryForward,
            RequiresAttachment = request.RequiresAttachment,
            Description = request.Description?.Trim()
        };
        _db.Set<LeaveType>().Add(type);
        await _db.SaveChangesAsync(ct);
        return ApiResponse<LeaveTypeDto>.Ok(type.ToDto(), "Leave type created.");
    }
}

// ─── Update ─────────────────────────────────────────────────────

public record UpdateLeaveTypeCommand : IRequest<ApiResponse<LeaveTypeDto>>
{
    public Guid Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public decimal DefaultDays { get; init; }
    public bool IsPaid { get; init; }
    public bool IsCarryForward { get; init; }
    public decimal MaxCarryForward { get; init; }
    public bool RequiresAttachment { get; init; }
    public bool IsActive { get; init; } = true;
    public string? Description { get; init; }
}

public class UpdateLeaveTypeCommandHandler : IRequestHandler<UpdateLeaveTypeCommand, ApiResponse<LeaveTypeDto>>
{
    private readonly IXorvaDbContext _db;
    public UpdateLeaveTypeCommandHandler(IXorvaDbContext db) => _db = db;

    public async Task<ApiResponse<LeaveTypeDto>> Handle(UpdateLeaveTypeCommand request, CancellationToken ct)
    {
        var type = await _db.Set<LeaveType>().FirstOrDefaultAsync(t => t.Id == request.Id, ct)
            ?? throw new NotFoundException("Leave type", request.Id);

        type.Name = request.Name.Trim();
        type.DefaultDays = request.DefaultDays;
        type.IsPaid = request.IsPaid;
        type.IsCarryForward = request.IsCarryForward;
        type.MaxCarryForward = request.MaxCarryForward;
        type.RequiresAttachment = request.RequiresAttachment;
        type.IsActive = request.IsActive;
        type.Description = request.Description?.Trim();
        await _db.SaveChangesAsync(ct);
        return ApiResponse<LeaveTypeDto>.Ok(type.ToDto(), "Leave type updated.");
    }
}

// ─── Delete ─────────────────────────────────────────────────────

public record DeleteLeaveTypeCommand(Guid Id) : IRequest<ApiResponse>;

public class DeleteLeaveTypeCommandHandler : IRequestHandler<DeleteLeaveTypeCommand, ApiResponse>
{
    private readonly IXorvaDbContext _db;
    public DeleteLeaveTypeCommandHandler(IXorvaDbContext db) => _db = db;

    public async Task<ApiResponse> Handle(DeleteLeaveTypeCommand request, CancellationToken ct)
    {
        var type = await _db.Set<LeaveType>().FirstOrDefaultAsync(t => t.Id == request.Id, ct)
            ?? throw new NotFoundException("Leave type", request.Id);
        type.IsActive = false;
        await _db.SaveChangesAsync(ct);
        return ApiResponse.Ok("Leave type deleted.");
    }
}

// ─── List ───────────────────────────────────────────────────────

public record ListLeaveTypesQuery(bool IncludeInactive) : IRequest<ApiResponse<List<LeaveTypeDto>>>;

public class ListLeaveTypesQueryHandler : IRequestHandler<ListLeaveTypesQuery, ApiResponse<List<LeaveTypeDto>>>
{
    private readonly IXorvaDbContext _db;
    public ListLeaveTypesQueryHandler(IXorvaDbContext db) => _db = db;

    public async Task<ApiResponse<List<LeaveTypeDto>>> Handle(ListLeaveTypesQuery request, CancellationToken ct)
    {
        var query = _db.Set<LeaveType>().AsQueryable();
        if (!request.IncludeInactive)
            query = query.Where(t => t.IsActive);
        var list = await query.OrderBy(t => t.SortOrder).ThenBy(t => t.Name).ToListAsync(ct);
        return ApiResponse<List<LeaveTypeDto>>.Ok(list.Select(t => t.ToDto()).ToList());
    }
}
