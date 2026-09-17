using System.Text.Json;
using Xorva.Modules.Platform.Entities;
using Xorva.Modules.Platform.Enums;

namespace Xorva.Modules.Platform.DTOs;

/// <summary>A custom sub-module and its fields (the design).</summary>
public sealed record EntityDefinitionDto(
    Guid Id,
    string Key,
    string Label,
    string PluralLabel,
    string ModuleKey,
    string? AttachTo,
    string? Icon,
    string? Description,
    bool IsActive,
    IReadOnlyList<FieldDefinitionDto> Fields)
{
    public static EntityDefinitionDto From(EntityDefinition e) => new(
        e.Id, e.Key, e.Label, e.PluralLabel, e.ModuleKey, e.AttachTo, e.Icon, e.Description, e.IsActive,
        e.Fields.OrderBy(f => f.SortOrder).Select(FieldDefinitionDto.From).ToList());
}

/// <summary>One field of a custom sub-module.</summary>
public sealed record FieldDefinitionDto(
    Guid Id,
    string Key,
    string Label,
    FieldType Type,
    bool IsRequired,
    int SortOrder,
    IReadOnlyList<string>? Options,
    string? Placeholder)
{
    public static FieldDefinitionDto From(FieldDefinition f) => new(
        f.Id, f.Key, f.Label, f.Type, f.IsRequired, f.SortOrder,
        string.IsNullOrWhiteSpace(f.Options) ? null : JsonSerializer.Deserialize<List<string>>(f.Options!),
        f.Placeholder);
}

/// <summary>One data row of a custom sub-module. <see cref="Data"/> is the parsed JSON object.</summary>
public sealed record CustomRecordDto(
    Guid Id,
    Guid EntityDefinitionId,
    Guid? ParentId,
    JsonElement Data,
    DateTime CreatedAt,
    DateTime? UpdatedAt)
{
    public static CustomRecordDto From(CustomRecord r) => new(
        r.Id, r.EntityDefinitionId, r.ParentId, JsonSerializer.Deserialize<JsonElement>(r.Data), r.CreatedAt, r.UpdatedAt);
}
