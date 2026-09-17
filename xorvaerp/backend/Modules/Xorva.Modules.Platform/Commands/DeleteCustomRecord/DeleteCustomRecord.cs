using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Platform.Entities;

namespace Xorva.Modules.Platform.Commands.DeleteCustomRecord;

/// <summary>Deletes one custom-sub-module row.</summary>
public sealed record DeleteCustomRecordCommand(Guid Id) : IRequest<ApiResponse>;

public sealed class DeleteCustomRecordHandler : IRequestHandler<DeleteCustomRecordCommand, ApiResponse>
{
    private readonly IXorvaDbContext _db;

    public DeleteCustomRecordHandler(IXorvaDbContext db) => _db = db;

    public async Task<ApiResponse> Handle(DeleteCustomRecordCommand request, CancellationToken ct)
    {
        var record = await _db.Set<CustomRecord>()
            .FirstOrDefaultAsync(r => r.Id == request.Id, ct)
            ?? throw new NotFoundException("Record", request.Id);

        _db.Set<CustomRecord>().Remove(record);
        await _db.SaveChangesAsync(ct);

        return ApiResponse.Ok("Record deleted.");
    }
}
