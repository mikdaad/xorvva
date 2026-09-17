namespace Xorva.Core.Exceptions;

/// <summary>
/// Thrown when request data is invalid. Maps to HTTP 400.
/// Typically thrown by FluentValidation pipeline behavior for validation failures.
/// </summary>
public class BadRequestException : Exception
{
    /// <summary>Individual validation error messages.</summary>
    public IReadOnlyList<string> Errors { get; }

    public BadRequestException(string message) : base(message)
    {
        Errors = [message];
    }

    public BadRequestException(IEnumerable<string> errors) : base("One or more validation errors occurred.")
    {
        Errors = errors.ToList().AsReadOnly();
    }
}
