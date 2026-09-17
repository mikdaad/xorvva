using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.HR.Common;
using Xorva.Modules.HR.Entities;

namespace Xorva.Modules.HR.Commands.DeleteEmployee;

/// <summary>Permanently deletes an employee and all their HR data + linked login. CompanyAdmin+.</summary>
public sealed record DeleteEmployeeCommand(Guid Id) : IRequest<ApiResponse<bool>>;

public sealed class DeleteEmployeeCommandHandler : IRequestHandler<DeleteEmployeeCommand, ApiResponse<bool>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public DeleteEmployeeCommandHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db; _tenant = tenant;
    }

    public async Task<ApiResponse<bool>> Handle(DeleteEmployeeCommand request, CancellationToken ct)
    {
        var employee = await _db.Set<Employee>().FirstOrDefaultAsync(e => e.Id == request.Id, ct)
            ?? throw new NotFoundException("Employee", request.Id);
        await HrGuard.EnsureCanManageEmployeeAsync(_db, _tenant, employee, ct);

        var name = $"{employee.FirstName} {employee.LastName}";
        await EmployeeDeletion.HardDeleteAsync(_db, employee, ct);
        await _db.SaveChangesAsync(ct);

        return ApiResponse<bool>.Ok(true, $"{name} was permanently removed.");
    }
}
