using System.Text.Json;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Platform.Common;
using Xorva.Modules.Platform.DTOs;
using Xorva.Modules.Platform.Entities;

namespace Xorva.Modules.Platform.Commands.CreateCustomRecord;

/// <summary>Creates one data row for a custom sub-module. Validated against its field definitions.</summary>
public sealed record CreateCustomRecordCommand : IRequest<ApiResponse<CustomRecordDto>>
{
    public Guid EntityDefinitionId { get; init; }
    public Guid? CompanyId { get; init; }
    /// <summary>For an attached tab (e.g. an Employee tab), the parent record's id.</summary>
    public Guid? ParentId { get; init; }
    public Dictionary<string, JsonElement> Data { get; init; } = new();
}

public sealed class CreateCustomRecordHandler
    : IRequestHandler<CreateCustomRecordCommand, ApiResponse<CustomRecordDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public CreateCustomRecordHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<CustomRecordDto>> Handle(CreateCustomRecordCommand request, CancellationToken ct)
    {
        var def = await _db.Set<EntityDefinition>()
            .Include(e => e.Fields)
            .FirstOrDefaultAsync(e => e.Id == request.EntityDefinitionId, ct)
            ?? throw new NotFoundException("Sub-module", request.EntityDefinitionId);

        var companyId = request.CompanyId ?? _tenant.CompanyId;
        if (companyId == Guid.Empty) throw new BadRequestException("Select a company for this record.");

        var json = PlatformSupport.BuildRecordJson(def.Fields.OrderBy(f => f.SortOrder).ToList(), request.Data);

        var record = new CustomRecord
        {
            TenantId = _tenant.TenantId,
            CompanyId = companyId,
            EntityDefinitionId = def.Id,
            ParentId = request.ParentId,
            Data = json,
        };

        _db.Set<CustomRecord>().Add(record);
        await _db.SaveChangesAsync(ct);

        return ApiResponse<CustomRecordDto>.Ok(CustomRecordDto.From(record), $"Added a {def.Label}.");
    }
}
