namespace Xorva.Core.Exceptions;

/// <summary>
/// Thrown when an operation conflicts with existing state. Maps to HTTP 409.
/// Used for: duplicate email registration, entity already exists, etc.
/// </summary>
public class ConflictException : Exception
{
    public ConflictException(string message) : base(message) { }
}
