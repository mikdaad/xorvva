using MediatR;
using Microsoft.EntityFrameworkCore;
using Xorva.Core.Common;
using Xorva.Core.Interfaces;
using Xorva.Modules.Platform.DTOs;
using Xorva.Modules.Platform.Entities;

namespace Xorva.Modules.Platform.Queries.ListEntityDefinitions;

/// <summary>Lists the tenant's custom sub-modules, optionally filtered to one parent module.</summary>
public sealed record ListEntityDefinitionsQuery(string? ModuleKey = null, string? AttachTo = null, bool IncludeInactive = false)
    : IRequest<ApiResponse<IReadOnlyList<EntityDefinitionDto>>>;

public sealed class ListEntityDefinitionsHandler
    : IRequestHandler<ListEntityDefinitionsQuery, ApiResponse<IReadOnlyList<EntityDefinitionDto>>>
{
    private readonly IXorvaDbContext _db;

    public ListEntityDefinitionsHandler(IXorvaDbContext db) => _db = db;

    public async Task<ApiResponse<IReadOnlyList<EntityDefinitionDto>>> Handle(
        ListEntityDefinitionsQuery request, CancellationToken ct)
    {
        var q = _db.Set<EntityDefinition>().Include(e => e.Fields).AsQueryable();

        if (!request.IncludeInactive) q = q.Where(e => e.IsActive);
        if (!string.IsNullOrWhiteSpace(request.ModuleKey)) q = q.Where(e => e.ModuleKey == request.ModuleKey);

        // Attached tabs (e.g. Employee) are separate from standalone sub-modules: a request
        // for a parent type returns only its tabs; the default listing returns only standalone.
        if (!string.IsNullOrWhiteSpace(request.AttachTo)) q = q.Where(e => e.AttachTo == request.AttachTo);
        else q = q.Where(e => e.AttachTo == null);

        var defs = await q.OrderBy(e => e.PluralLabel).ToListAsync(ct);
        return ApiResponse<IReadOnlyList<EntityDefinitionDto>>.Ok(defs.Select(EntityDefinitionDto.From).ToList());
    }
}
