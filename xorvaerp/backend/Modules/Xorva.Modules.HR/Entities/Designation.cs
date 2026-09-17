using Xorva.Core.Entities;

namespace Xorva.Modules.HR.Entities;

/// <summary>
/// Job title, independent of department (a "Senior Engineer" can exist across departments).
/// </summary>
public class Designation : CompanyEntity
{
    public string Title { get; set; } = string.Empty;
    public string? Code { get; set; }

    /// <summary>Optional grouping, e.g. Management / Technical / Support / Operations.</summary>
    public string? Category { get; set; }

    public string? Description { get; set; }
    public bool IsActive { get; set; } = true;
    public int SortOrder { get; set; }
}
