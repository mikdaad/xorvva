using Xorva.Core.Entities;
using Xorva.Modules.Platform.Enums;

namespace Xorva.Modules.Platform.Entities;

/// <summary>
/// One field on an <see cref="EntityDefinition"/>. The full set of a definition's fields
/// drives both the data-entry form and the list columns on the frontend, and the
/// server-side validation of every <see cref="CustomRecord"/>.
/// </summary>
public class FieldDefinition : TenantEntity
{
    /// <summary>The owning custom sub-module.</summary>
    public Guid EntityDefinitionId { get; set; }

    /// <summary>Machine key stored as a JSON property on the record's Data (e.g. "course_name").</summary>
    public string Key { get; set; } = string.Empty;

    /// <summary>Display label shown on the form + column header.</summary>
    public string Label { get; set; } = string.Empty;

    /// <summary>Input type — drives rendering + validation.</summary>
    public FieldType Type { get; set; } = FieldType.Text;

    /// <summary>When true, a record cannot be saved without a value for this field.</summary>
    public bool IsRequired { get; set; }

    /// <summary>Display / form order (ascending).</summary>
    public int SortOrder { get; set; }

    /// <summary>Choices for a <see cref="FieldType.Select"/> field, stored as a JSON string array.</summary>
    public string? Options { get; set; }

    /// <summary>Optional placeholder / helper text for the input.</summary>
    public string? Placeholder { get; set; }

    public EntityDefinition EntityDefinition { get; set; } = null!;
}
