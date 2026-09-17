using System.Text.Json;
using Xorva.Modules.HR.Entities;
using Xorva.Modules.HR.Enums;

namespace Xorva.Modules.HR.DTOs;

/// <summary>An admin-designed employee-record tab (section) and its fields.</summary>
public sealed record EmployeeTabDto(
    Guid Id,
    string Key,
    string Label,
    bool IsList,
    string? Icon,
    int SortOrder,
    IReadOnlyList<EmployeeTabFieldDto> Fields)
{
    public static EmployeeTabDto From(EmployeeTab t) => new(
        t.Id, t.Key, t.Label, t.IsList, t.Icon, t.SortOrder,
        t.Fields.OrderBy(f => f.SortOrder).Select(EmployeeTabFieldDto.From).ToList());
}

/// <summary>One field within an employee tab.</summary>
public sealed record EmployeeTabFieldDto(
    Guid Id,
    string Key,
    string Label,
    HrFieldType Type,
    bool IsRequired,
    int SortOrder,
    IReadOnlyList<string>? Options,
    bool ShowInList,
    bool IsFilterable)
{
    public static EmployeeTabFieldDto From(EmployeeTabField f) => new(
        f.Id, f.Key, f.Label, f.Type, f.IsRequired, f.SortOrder,
        string.IsNullOrWhiteSpace(f.Options) ? null : JsonSerializer.Deserialize<List<string>>(f.Options!),
        f.ShowInList, f.IsFilterable);
}

/// <summary>One saved row of employee-tab data. <see cref="Data"/> is the parsed JSON object.</summary>
public sealed record EmployeeTabRecordDto(
    Guid Id,
    Guid EmployeeTabId,
    Guid EmployeeId,
    JsonElement Data,
    DateTime CreatedAt,
    DateTime? UpdatedAt)
{
    public static EmployeeTabRecordDto From(EmployeeTabRecord r) => new(
        r.Id, r.EmployeeTabId, r.EmployeeId, JsonSerializer.Deserialize<JsonElement>(r.Data), r.CreatedAt, r.UpdatedAt);
}
