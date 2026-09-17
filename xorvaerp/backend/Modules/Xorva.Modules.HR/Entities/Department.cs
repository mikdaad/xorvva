using Xorva.Core.Entities;
using Xorva.Modules.HR.Enums;

namespace Xorva.Modules.HR.Entities;

/// <summary>
/// Organizational unit within a company. Company-scoped (auto tenant isolation).
/// Supports hierarchy (ParentDepartmentId) and a department head (HeadEmployeeId).
/// </summary>
public class Department : CompanyEntity
{
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string? Description { get; set; }

    /// <summary>Business function — drives which module the department's head (a Manager) can run.</summary>
    public DepartmentFunction Function { get; set; } = DepartmentFunction.General;

    /// <summary>The employee who heads this department (nullable — set after the employee exists).</summary>
    public Guid? HeadEmployeeId { get; set; }

    /// <summary>Parent for sub-departments (e.g. Engineering → Backend Team). Same company only.</summary>
    public Guid? ParentDepartmentId { get; set; }

    public bool IsActive { get; set; } = true;
    public int SortOrder { get; set; }

    /// <summary>
    /// Admin-defined rules for this department — a JSON array of {label, value} the department
    /// "sets for itself" (e.g. payroll notes, overtime policy, salary band). Free-form for now.
    /// </summary>
    public string? Rules { get; set; }
}
