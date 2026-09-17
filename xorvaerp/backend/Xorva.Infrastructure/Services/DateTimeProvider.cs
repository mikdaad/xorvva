using Xorva.Core.Interfaces;

namespace Xorva.Infrastructure.Services;

/// <summary>
/// Production implementation of IDateTimeProvider.
/// Returns actual UTC time. Injected as singleton.
/// </summary>
public class DateTimeProvider : IDateTimeProvider
{
    public DateTime UtcNow => DateTime.UtcNow;
}
