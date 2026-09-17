using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.HR.Entities;

namespace Xorva.Modules.HR.Commands.DeleteDesignation;

public record DeleteDesignationCommand(Guid Id) : IRequest<ApiResponse>;

public class DeleteDesignationCommandHandler : IRequestHandler<DeleteDesignationCommand, ApiResponse>
{
    private readonly IXorvaDbContext _db;

    public DeleteDesignationCommandHandler(IXorvaDbContext db)
    {
        _db = db;
    }

    public async Task<ApiResponse> Handle(DeleteDesignationCommand request, CancellationToken ct)
    {
        var designation = await _db.Set<Designation>().FirstOrDefaultAsync(d => d.Id == request.Id, ct)
            ?? throw new NotFoundException("Designation", request.Id);

        var inUse = await _db.Set<Employee>()
            .AnyAsync(e => e.DesignationId == designation.Id && e.IsActive, ct);
        if (inUse)
            throw new ConflictException("Cannot delete a designation assigned to active employees.");

        designation.IsActive = false;
        await _db.SaveChangesAsync(ct);
        return ApiResponse.Ok("Designation deleted.");
    }
}
