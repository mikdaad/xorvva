using Xorva.Core.Entities;
using Xorva.Modules.HR.Enums;

namespace Xorva.Modules.HR.Entities;

/// <summary>
/// An admin-designed section (tab) on the employee record — e.g. "Passport &amp; Visa",
/// "Security", "Training", "Career Path". Owned entirely by the HR module (independent).
/// Super Admin / Admin add and remove these per company.
/// </summary>
public class EmployeeTab : CompanyEntity
{
    /// <summary>Machine key, unique per company (slug of the label).</summary>
    public string Key { get; set; } = string.Empty;

    /// <summary>Display label shown on the tab.</summary>
    public string Label { get; set; } = string.Empty;

    /// <summary>false = ONE set of fields per employee (a form, e.g. Passport); true = MANY rows (a table, e.g. Training).</summary>
    public bool IsList { get; set; }

    /// <summary>Optional Tabler icon name.</summary>
    public string? Icon { get; set; }

    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;

    public ICollection<EmployeeTabField> Fields { get; set; } = new List<EmployeeTabField>();
}

/// <summary>One field inside an <see cref="EmployeeTab"/>.</summary>
public class EmployeeTabField : CompanyEntity
{
    public Guid EmployeeTabId { get; set; }
    public string Key { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public HrFieldType Type { get; set; } = HrFieldType.Text;
    public bool IsRequired { get; set; }
    public int SortOrder { get; set; }
    /// <summary>JSON array of choices for a Select field.</summary>
    public string? Options { get; set; }

    /// <summary>Show this field as a column in the tab's employee table (keeps tables narrow).</summary>
    public bool ShowInList { get; set; }

    /// <summary>Expose a filter for this field on the tab's employee table.</summary>
    public bool IsFilterable { get; set; }

    public EmployeeTab EmployeeTab { get; set; } = null!;
}

/// <summary>
/// The data for an employee under a tab. A "single" tab has exactly one row per employee;
/// a "list" tab has many. Values are stored as a JSON document (jsonb on PostgreSQL).
/// </summary>
public class EmployeeTabRecord : CompanyEntity
{
    public Guid EmployeeTabId { get; set; }
    public Guid EmployeeId { get; set; }
    public string Data { get; set; } = "{}";
}
