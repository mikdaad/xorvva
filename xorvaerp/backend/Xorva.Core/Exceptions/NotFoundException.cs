namespace Xorva.Core.Exceptions;

/// <summary>
/// Thrown when a requested entity is not found. Maps to HTTP 404.
/// Never reveal which field was wrong for security (e.g., "Invalid credentials" not "email not found").
/// </summary>
public class NotFoundException : Exception
{
    public NotFoundException(string message) : base(message) { }

    public NotFoundException(string entityName, Guid id)
        : base($"{entityName} with id '{id}' was not found.") { }
}
