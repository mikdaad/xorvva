using System.Net;
using System.Text.Json;
using Xorva.Core.Common;
using Xorva.Core.Exceptions;

namespace Xorva.API.Middleware;

/// <summary>
/// Global exception handler middleware. Sits at the TOP of the pipeline.
/// Catches ALL unhandled exceptions and converts them to consistent ApiResponse JSON.
/// 
/// Mapping:
///   NotFoundException    → 404
///   ForbiddenException   → 403
///   ConflictException    → 409
///   BadRequestException  → 400
///   UnauthorizedAccess   → 401
///   Everything else      → 500 (details hidden in production)
/// </summary>
public class ExceptionMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionMiddleware> _logger;
    private readonly IHostEnvironment _env;

    public ExceptionMiddleware(RequestDelegate next, ILogger<ExceptionMiddleware> logger, IHostEnvironment env)
    {
        _next = next;
        _logger = logger;
        _env = env;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            await HandleExceptionAsync(context, ex);
        }
    }

    private async Task HandleExceptionAsync(HttpContext context, Exception exception)
    {
        var (statusCode, message, errors) = exception switch
        {
            BadRequestException badReq => (HttpStatusCode.BadRequest, badReq.Message, badReq.Errors.ToList()),
            NotFoundException notFound => (HttpStatusCode.NotFound, notFound.Message, (List<string>?)null),
            ForbiddenException forbidden => (HttpStatusCode.Forbidden, forbidden.Message, (List<string>?)null),
            ConflictException conflict => (HttpStatusCode.Conflict, conflict.Message, (List<string>?)null),
            UnauthorizedException unauthorized => (HttpStatusCode.Unauthorized, unauthorized.Message, (List<string>?)null),
            UnauthorizedAccessException => (HttpStatusCode.Unauthorized, "Unauthorized.", (List<string>?)null),
            _ => (HttpStatusCode.InternalServerError, GetInternalErrorMessage(exception), (List<string>?)null)
        };

        _logger.LogError(exception, "Exception caught by middleware: {Message} | Path: {Path}",
            exception.Message, context.Request.Path);

        context.Response.ContentType = "application/json";
        context.Response.StatusCode = (int)statusCode;

        var response = ApiResponse.Fail(message, errors);

        var jsonOptions = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
        await context.Response.WriteAsJsonAsync(response, jsonOptions);
    }

    private string GetInternalErrorMessage(Exception exception)
    {
        // In development, show the actual exception for debugging
        // In production, hide internal details to prevent information leakage
        return _env.IsDevelopment()
            ? $"Internal Server Error: {exception.Message}"
            : "An unexpected error occurred. Please try again later.";
    }
}
