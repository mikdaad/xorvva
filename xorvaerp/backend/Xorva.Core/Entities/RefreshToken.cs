namespace Xorva.Core.Entities;

/// <summary>
/// Opaque refresh token stored in the database.
/// Token rotation: each token used exactly ONCE. Reuse invalidates all sessions.
/// Lives in Core alongside ApplicationUser for shared access.
/// </summary>
public class RefreshToken : BaseEntity
{
    public string Token { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
    public bool IsRevoked { get; set; }
    public DateTime? RevokedAt { get; set; }
    public string? ReplacedByToken { get; set; }
    public bool IsActive => !IsRevoked && DateTime.UtcNow < ExpiresAt;
    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;
}
