using Xorva.Core.Entities;

namespace Xorva.Modules.Platform.Entities;

/// <summary>
/// One data row of a tenant-defined custom sub-module. Company-scoped, so it flows through
/// the same tenant/company query filters and audit as every first-class entity.
///
/// The field values live in <see cref="Data"/> as a JSON document (a <c>jsonb</c> column on
/// PostgreSQL). This is what makes admin-defined forms possible without a schema migration:
/// adding a field just adds a key to the JSON — no new table, no ALTER.
/// </summary>
public class CustomRecord : CompanyEntity
{
    /// <summary>The custom sub-module this row belongs to.</summary>
    public Guid EntityDefinitionId { get; set; }

    /// <summary>
    /// For a definition attached to a parent (e.g. an Employee tab), the id of that parent
    /// record. Null for standalone sub-module rows.
    /// </summary>
    public Guid? ParentId { get; set; }

    /// <summary>The field values as a JSON object, keyed by <c>FieldDefinition.Key</c>.</summary>
    public string Data { get; set; } = "{}";

    public EntityDefinition EntityDefinition { get; set; } = null!;
}
