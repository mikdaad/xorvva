using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;
using Xorva.Core.Interfaces;
using Xorva.Modules.Platform.DTOs;
using Xorva.Modules.Platform.Entities;

namespace Xorva.Modules.Platform.Queries.GetEntityDefinition;

/// <summary>Gets one custom sub-module with its fields (drives the dynamic form + list).</summary>
public sealed record GetEntityDefinitionQuery(Guid Id) : IRequest<ApiResponse<EntityDefinitionDto>>;

public sealed class GetEntityDefinitionHandler
    : IRequestHandler<GetEntityDefinitionQuery, ApiResponse<EntityDefinitionDto>>
{
    private readonly IXorvaDbContext _db;

    public GetEntityDefinitionHandler(IXorvaDbContext db) => _db = db;

    public async Task<ApiResponse<EntityDefinitionDto>> Handle(GetEntityDefinitionQuery request, CancellationToken ct)
    {
        var def = await _db.Set<EntityDefinition>()
            .Include(e => e.Fields)
            .FirstOrDefaultAsync(e => e.Id == request.Id, ct)
            ?? throw new NotFoundException("Sub-module", request.Id);

        return ApiResponse<EntityDefinitionDto>.Ok(EntityDefinitionDto.From(def));
    }
}
