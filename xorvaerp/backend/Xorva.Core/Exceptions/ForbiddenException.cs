namespace Xorva.Core.Exceptions;

/// <summary>
/// Thrown when a user lacks permission for an operation. Maps to HTTP 403.
/// Used for RBAC violations (e.g., Employee trying to access admin endpoint).
/// </summary>
public class ForbiddenException : Exception
{
    public ForbiddenException(string message = "You do not have permission to perform this action.")
        : base(message) { }
}
