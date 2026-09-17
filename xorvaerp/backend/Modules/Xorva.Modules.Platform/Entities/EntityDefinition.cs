using Xorva.Core.Entities;

namespace Xorva.Modules.Platform.Entities;

/// <summary>
/// A tenant-defined custom sub-module (e.g. "Training Records", "Vehicle Log") — the
/// metadata that lets an Admin add their own section WITHOUT a developer or a migration.
///
/// Tenant-scoped: a definition is designed once and shared across the tenant's companies;
/// the actual data rows (<see cref="CustomRecord"/>) are company-scoped. Rendered on the
/// frontend by the DynamicForm / DynamicList engine and surfaced in the sidebar under
/// <see cref="ModuleKey"/>.
/// </summary>
public class EntityDefinition : TenantEntity
{
    /// <summary>Machine key, unique per tenant (slug of the label, e.g. "training_records").</summary>
    public string Key { get; set; } = string.Empty;

    /// <summary>Singular display label, e.g. "Training Record".</summary>
    public string Label { get; set; } = string.Empty;

    /// <summary>Plural display label used for the list page + sidebar, e.g. "Training Records".</summary>
    public string PluralLabel { get; set; } = string.Empty;

    /// <summary>Which module this custom sub-module appears under (see ModuleCatalog), e.g. "HR".</summary>
    public string ModuleKey { get; set; } = "Platform";

    /// <summary>
    /// When set, this definition is a TAB attached to a parent record type (e.g. "Employee")
    /// rather than a standalone sub-module — its records belong to a specific parent
    /// (<see cref="CustomRecord.ParentId"/>). Null = standalone sub-module.
    /// </summary>
    public string? AttachTo { get; set; }

    /// <summary>Optional Tabler icon name for the sidebar.</summary>
    public string? Icon { get; set; }

    /// <summary>Optional description shown on the list page.</summary>
    public string? Description { get; set; }

    /// <summary>Soft on/off without deleting the definition or its data.</summary>
    public bool IsActive { get; set; } = true;

    /// <summary>The fields that make up this sub-module's form + list columns.</summary>
    public ICollection<FieldDefinition> Fields { get; set; } = new List<FieldDefinition>();
}
