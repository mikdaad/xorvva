namespace Xorva.Core.Exceptions;

/// <summary>
/// Thrown when authentication fails. Maps to HTTP 401.
/// Used for: invalid login credentials, invalid/expired refresh tokens.
/// Message stays generic — never reveal whether the email or the password was wrong.
/// </summary>
public class UnauthorizedException : Exception
{
    public UnauthorizedException(string message = "Invalid credentials.") : base(message) { }
}
