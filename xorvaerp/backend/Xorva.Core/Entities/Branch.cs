namespace Xorva.Core.Entities;

/// <summary>
/// A physical location of a Company (e.g. "Dubai Office").
/// Company-scoped: the global query filter confines non-SuperAdmin users
/// to branches of their own company automatically.
/// </summary>
public class Branch : CompanyEntity
{
    public string Name { get; set; } = string.Empty;
    public string? Address { get; set; }
    public string? City { get; set; }
    public string? Country { get; set; }
    public bool IsActive { get; set; } = true;

    public Company Company { get; set; } = null!;
}
