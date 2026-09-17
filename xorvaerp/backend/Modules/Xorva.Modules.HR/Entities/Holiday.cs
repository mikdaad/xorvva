using Xorva.Core.Entities;

namespace Xorva.Modules.HR.Entities;

/// <summary>
/// A company public holiday. Excluded (along with weekends) from leave-day counts.
/// </summary>
public class Holiday : CompanyEntity
{
    public string Name { get; set; } = string.Empty;
    public DateOnly Date { get; set; }
    public bool IsActive { get; set; } = true;
}
