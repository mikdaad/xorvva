namespace Xorva.API.Middleware;

/// <summary>
/// Logs every HTTP request with method, path, status code, and duration.
/// Essential for production debugging and performance monitoring.
/// </summary>
public class RequestLoggingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<RequestLoggingMiddleware> _logger;

    public RequestLoggingMiddleware(RequestDelegate next, ILogger<RequestLoggingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var startTime = System.Diagnostics.Stopwatch.GetTimestamp();

        await _next(context);

        var elapsed = System.Diagnostics.Stopwatch.GetElapsedTime(startTime);

        _logger.LogInformation(
            "{Method} {Path} → {StatusCode} ({Duration}ms)",
            context.Request.Method,
            context.Request.Path,
            context.Response.StatusCode,
            elapsed.TotalMilliseconds.ToString("F1"));
    }
}
