namespace Xorva.Core.Entities;

/// <summary>
/// Base entity with a unique identifier and audit timestamps.
/// All domain entities must inherit from this class.
/// </summary>
public abstract class BaseEntity
{
    /// <summary>
    /// Unique identifier. Generated server-side using sequential GUIDs for index performance.
    /// </summary>
    public Guid Id { get; init; } = Guid.CreateVersion7();

    /// <summary>
    /// UTC timestamp when the entity was first created.
    /// </summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// UTC timestamp of the last modification. Null if never updated.
    /// </summary>
    public DateTime? UpdatedAt { get; set; }
}
