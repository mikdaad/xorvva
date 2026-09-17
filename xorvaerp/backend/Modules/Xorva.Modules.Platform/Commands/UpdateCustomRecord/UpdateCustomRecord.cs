using System.Text.Json;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Platform.Common;
using Xorva.Modules.Platform.DTOs;
using Xorva.Modules.Platform.Entities;

namespace Xorva.Modules.Platform.Commands.UpdateCustomRecord;

/// <summary>Replaces the values of one custom-sub-module row. Re-validated against its fields.</summary>
public sealed record UpdateCustomRecordCommand : IRequest<ApiResponse<CustomRecordDto>>
{
    public Guid Id { get; init; }
    public Dictionary<string, JsonElement> Data { get; init; } = new();
}

public sealed class UpdateCustomRecordHandler
    : IRequestHandler<UpdateCustomRecordCommand, ApiResponse<CustomRecordDto>>
{
    private readonly IXorvaDbContext _db;

    public UpdateCustomRecordHandler(IXorvaDbContext db) => _db = db;

    public async Task<ApiResponse<CustomRecordDto>> Handle(UpdateCustomRecordCommand request, CancellationToken ct)
    {
        var record = await _db.Set<CustomRecord>()
            .FirstOrDefaultAsync(r => r.Id == request.Id, ct)
            ?? throw new NotFoundException("Record", request.Id);

        var fields = await _db.Set<FieldDefinition>()
            .Where(f => f.EntityDefinitionId == record.EntityDefinitionId)
            .OrderBy(f => f.SortOrder)
            .ToListAsync(ct);

        record.Data = PlatformSupport.BuildRecordJson(fields, request.Data);
        await _db.SaveChangesAsync(ct);

        return ApiResponse<CustomRecordDto>.Ok(CustomRecordDto.From(record), "Record updated.");
    }
}
