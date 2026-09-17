using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using Xorva.Core.Common;
using Xorva.Core.Interfaces;
using Xorva.Modules.Platform.Common;
using Xorva.Modules.Platform.DTOs;
using Xorva.Modules.Platform.Entities;
using Xorva.Modules.Platform.Enums;

namespace Xorva.Modules.Platform.Commands.CreateEntityDefinition;

/// <summary>A field to create on the new sub-module. Its machine key is derived from the label.</summary>
public sealed record FieldInput(
    string Label,
    FieldType Type = FieldType.Text,
    bool IsRequired = false,
    List<string>? Options = null,
    string? Placeholder = null);

/// <summary>
/// Defines a new custom sub-module (an <see cref="EntityDefinition"/>) with its fields.
/// This is the "no-code" designer action — Admin / SuperAdmin only.
/// </summary>
public sealed record CreateEntityDefinitionCommand : IRequest<ApiResponse<EntityDefinitionDto>>
{
    public string Label { get; init; } = string.Empty;
    public string? PluralLabel { get; init; }
    public string ModuleKey { get; init; } = "Platform";
    /// <summary>When set (e.g. "Employee"), the sub-module becomes a tab attached to that parent type.</summary>
    public string? AttachTo { get; init; }
    public string? Icon { get; init; }
    public string? Description { get; init; }
    public List<FieldInput> Fields { get; init; } = [];
}

public sealed class CreateEntityDefinitionValidator : AbstractValidator<CreateEntityDefinitionCommand>
{
    public CreateEntityDefinitionValidator()
    {
        RuleFor(x => x.Label).NotEmpty().MaximumLength(80).WithMessage("Give the sub-module a name.");
        RuleFor(x => x.ModuleKey).NotEmpty().MaximumLength(40);
        RuleFor(x => x.Fields).NotEmpty().WithMessage("Add at least one field.");
        RuleForEach(x => x.Fields).ChildRules(f =>
            f.RuleFor(i => i.Label).NotEmpty().MaximumLength(80).WithMessage("Every field needs a label."));
    }
}

public sealed class CreateEntityDefinitionHandler
    : IRequestHandler<CreateEntityDefinitionCommand, ApiResponse<EntityDefinitionDto>>
{
    private readonly IXorvaDbContext _db;
    private readonly ICurrentTenantService _tenant;

    public CreateEntityDefinitionHandler(IXorvaDbContext db, ICurrentTenantService tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ApiResponse<EntityDefinitionDto>> Handle(
        CreateEntityDefinitionCommand request, CancellationToken ct)
    {
        var label = request.Label.Trim();
        var baseKey = PlatformSupport.Slugify(label);

        // Ensure the key is unique within the tenant.
        var existing = await _db.Set<EntityDefinition>()
            .Where(e => e.Key.StartsWith(baseKey))
            .Select(e => e.Key)
            .ToListAsync(ct);
        var key = baseKey;
        for (var n = 2; existing.Contains(key); n++) key = $"{baseKey}_{n}";

        var def = new EntityDefinition
        {
            TenantId = _tenant.TenantId,
            Key = key,
            Label = label,
            PluralLabel = string.IsNullOrWhiteSpace(request.PluralLabel) ? label : request.PluralLabel.Trim(),
            ModuleKey = request.ModuleKey.Trim(),
            AttachTo = string.IsNullOrWhiteSpace(request.AttachTo) ? null : request.AttachTo.Trim(),
            Icon = request.Icon?.Trim(),
            Description = request.Description?.Trim(),
            IsActive = true,
        };

        var order = 0;
        var usedKeys = new HashSet<string>();
        foreach (var fi in request.Fields)
        {
            var fk = PlatformSupport.Slugify(fi.Label);
            for (var n = 2; !usedKeys.Add(fk); n++) fk = $"{PlatformSupport.Slugify(fi.Label)}_{n}";

            def.Fields.Add(new FieldDefinition
            {
                TenantId = _tenant.TenantId,
                Key = fk,
                Label = fi.Label.Trim(),
                Type = fi.Type,
                IsRequired = fi.IsRequired,
                SortOrder = order++,
                Options = fi.Options is { Count: > 0 } ? JsonSerializer.Serialize(fi.Options) : null,
                Placeholder = fi.Placeholder?.Trim(),
            });
        }

        _db.Set<EntityDefinition>().Add(def);
        await _db.SaveChangesAsync(ct);

        return ApiResponse<EntityDefinitionDto>.Ok(
            EntityDefinitionDto.From(def), $"Created the '{def.PluralLabel}' sub-module.");
    }
}
