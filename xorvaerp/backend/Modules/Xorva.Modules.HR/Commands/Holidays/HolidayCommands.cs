using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.HR.Common;
using Xorva.Modules.HR.DTOs;
using Xorva.Modules.HR.Entities;

namespace Xorva.Modules.HR.Commands.Holidays;

// ─── Create ─────────────────────────────────────────────────────

public record CreateHolidayCommand : IRequest<ApiResponse<HolidayDto>>
{
    public Guid? CompanyId { get; init; }
    public string Name { get; init; } = string.Empty;
    public DateOnly Date { get; init; }
}

public class CreateHolidayValidator : AbstractValidator<CreateHolidayCommand>
{
    public CreateHolidayValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Date).NotEmpty();
    }
}

public class CreateHolidayCommandHandler : IRequestHandler<CreateHolidayCommand, ApiResponse<HolidayDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public CreateHolidayCommandHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<HolidayDto>> Handle(CreateHolidayCommand request, CancellationToken ct)
    {
        var companyId = HrGuard.ResolveCompanyId(_tenant, request.CompanyId);
        await HrGuard.EnsureHrActiveAsync(_db, companyId, ct);

        var holiday = new Holiday
        {
            TenantId = _tenant.TenantId,
            CompanyId = companyId,
            Name = request.Name.Trim(),
            Date = request.Date
        };
        _db.Set<Holiday>().Add(holiday);
        await _db.SaveChangesAsync(ct);
        return ApiResponse<HolidayDto>.Ok(holiday.ToDto(), "Holiday added.");
    }
}

// ─── Delete ─────────────────────────────────────────────────────

public record DeleteHolidayCommand(Guid Id) : IRequest<ApiResponse>;

public class DeleteHolidayCommandHandler : IRequestHandler<DeleteHolidayCommand, ApiResponse>
{
    private readonly IXorvaDbContext _db;
    public DeleteHolidayCommandHandler(IXorvaDbContext db) => _db = db;

    public async Task<ApiResponse> Handle(DeleteHolidayCommand request, CancellationToken ct)
    {
        var holiday = await _db.Set<Holiday>().FirstOrDefaultAsync(h => h.Id == request.Id, ct)
            ?? throw new NotFoundException("Holiday", request.Id);
        _db.Set<Holiday>().Remove(holiday);
        await _db.SaveChangesAsync(ct);
        return ApiResponse.Ok("Holiday removed.");
    }
}

// ─── List ───────────────────────────────────────────────────────

public record ListHolidaysQuery(int? Year) : IRequest<ApiResponse<List<HolidayDto>>>;

public class ListHolidaysQueryHandler : IRequestHandler<ListHolidaysQuery, ApiResponse<List<HolidayDto>>>
{
    private readonly IXorvaDbContext _db;
    public ListHolidaysQueryHandler(IXorvaDbContext db) => _db = db;

    public async Task<ApiResponse<List<HolidayDto>>> Handle(ListHolidaysQuery request, CancellationToken ct)
    {
        var query = _db.Set<Holiday>().Where(h => h.IsActive);
        if (request.Year.HasValue)
            query = query.Where(h => h.Date.Year == request.Year.Value);

        var list = await query.OrderBy(h => h.Date).ToListAsync(ct);
        return ApiResponse<List<HolidayDto>>.Ok(list.Select(h => h.ToDto()).ToList());
    }
}
