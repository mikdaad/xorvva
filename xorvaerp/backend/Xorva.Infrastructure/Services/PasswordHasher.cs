namespace Xorva.Infrastructure.Services;

/// <summary>
/// BCrypt-based password hashing service.
/// Cost factor 12: ~250ms per hash — fast enough for login, slow enough to resist brute force.
/// Thread-safe, stateless — injected as singleton.
/// </summary>
public class PasswordHasher
{
    private const int WorkFactor = 12;

    /// <summary>Hashes a plain text password using BCrypt with salt.</summary>
    public string Hash(string password)
    {
        return BCrypt.Net.BCrypt.HashPassword(password, WorkFactor);
    }

    /// <summary>Verifies a plain text password against a stored BCrypt hash.</summary>
    public bool Verify(string password, string hash)
    {
        return BCrypt.Net.BCrypt.Verify(password, hash);
    }
}
