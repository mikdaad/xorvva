namespace Xorva.Core.Interfaces;

/// <summary>
/// Abstraction for time to enable testable code.
/// In production, returns DateTime.UtcNow.
/// In tests, returns a fixed or controlled time value.
/// </summary>
public interface IDateTimeProvider
{
    DateTime UtcNow { get; }
}
