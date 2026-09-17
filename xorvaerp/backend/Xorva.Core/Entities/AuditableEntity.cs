namespace Xorva.Core.Entities;

/// <summary>
/// Extends BaseEntity with user-level audit tracking.
/// Tracks which user created and last modified this entity.
/// </summary>
public abstract class AuditableEntity : BaseEntity
{
    /// <summary>
    /// The UserId who created this entity. Null for system-generated records.
    /// </summary>
    public Guid? CreatedBy { get; set; }

    /// <summary>
    /// The UserId who last modified this entity. Null if never updated.
    /// </summary>
    public Guid? UpdatedBy { get; set; }
}
