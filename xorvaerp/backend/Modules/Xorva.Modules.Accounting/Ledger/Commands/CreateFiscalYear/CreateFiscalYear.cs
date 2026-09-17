using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Accounting.Common;
using Xorva.Modules.Accounting.DTOs;
using Xorva.Modules.Accounting.Ledger.Entities;

namespace Xorva.Modules.Accounting.Ledger.Commands.CreateFiscalYear;

/// <summary>Creates a fiscal year (Jan–Dec) with its twelve monthly periods.</summary>
public record CreateFiscalYearCommand : IRequest<ApiResponse<FiscalYearDto>>
{
    public Guid? CompanyId { get; init; }
    public int Year { get; init; }
}

public class CreateFiscalYearValidator : AbstractValidator<CreateFiscalYearCommand>
{
    public CreateFiscalYearValidator()
    {
        RuleFor(x => x.Year).InclusiveBetween(2000, 2100);
    }
}

public class CreateFiscalYearHandler : IRequestHandler<CreateFiscalYearCommand, ApiResponse<FiscalYearDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public CreateFiscalYearHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<FiscalYearDto>> Handle(CreateFiscalYearCommand request, CancellationToken ct)
    {
        var companyId = AccountingGuard.ResolveCompanyId(_tenant, request.CompanyId);
        await AccountingGuard.EnsureAccountingActiveAsync(_db, companyId, ct);

        var name = $"FY{request.Year}";
        if (await _db.Set<FiscalYear>().AnyAsync(y => y.CompanyId == companyId && y.Name == name, ct))
            throw new ConflictException($"Fiscal year {name} already exists.");

        var start = DateTime.SpecifyKind(new DateTime(request.Year, 1, 1), DateTimeKind.Utc);
        var end = DateTime.SpecifyKind(new DateTime(request.Year, 12, 31), DateTimeKind.Utc);

        var year = new FiscalYear
        {
            TenantId = _tenant.TenantId,
            CompanyId = companyId,
            Name = name,
            StartDate = start,
            EndDate = end,
        };
        _db.Set<FiscalYear>().Add(year);

        var periods = new List<FiscalPeriod>();
        for (var m = 1; m <= 12; m++)
        {
            var ps = DateTime.SpecifyKind(new DateTime(request.Year, m, 1), DateTimeKind.Utc);
            var pe = DateTime.SpecifyKind(new DateTime(request.Year, m, DateTime.DaysInMonth(request.Year, m)), DateTimeKind.Utc);
            var period = new FiscalPeriod
            {
                TenantId = _tenant.TenantId,
                CompanyId = companyId,
                FiscalYearId = year.Id,
                Name = ps.ToString("MMM yyyy"),
                StartDate = ps,
                EndDate = pe,
            };
            periods.Add(period);
            _db.Set<FiscalPeriod>().Add(period);
        }

        await _db.SaveChangesAsync(ct);
        return ApiResponse<FiscalYearDto>.Ok(year.ToDto(periods), $"{name} created with 12 periods.");
    }
}
