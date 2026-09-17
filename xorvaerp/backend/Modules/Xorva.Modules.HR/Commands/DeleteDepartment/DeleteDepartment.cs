using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.HR.Entities;

namespace Xorva.Modules.HR.Commands.DeleteDepartment;

/// <summary>Soft-delete: blocked while the department still has active employees.</summary>
public record DeleteDepartmentCommand(Guid Id) : IRequest<ApiResponse>;

public class DeleteDepartmentCommandHandler : IRequestHandler<DeleteDepartmentCommand, ApiResponse>
{
    private readonly IXorvaDbContext _db;

    public DeleteDepartmentCommandHandler(IXorvaDbContext db)
    {
        _db = db;
    }

    public async Task<ApiResponse> Handle(DeleteDepartmentCommand request, CancellationToken ct)
    {
        var dept = await _db.Set<Department>().FirstOrDefaultAsync(d => d.Id == request.Id, ct)
            ?? throw new NotFoundException("Department", request.Id);

        var hasEmployees = await _db.Set<Employee>()
            .AnyAsync(e => e.DepartmentId == dept.Id && e.IsActive, ct);
        if (hasEmployees)
            throw new ConflictException("Cannot delete a department with active employees. Reassign them first.");

        dept.IsActive = false; // soft-delete
        await _db.SaveChangesAsync(ct);
        return ApiResponse.Ok("Department deleted.");
    }
}
