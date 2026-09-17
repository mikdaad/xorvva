using System.Text.Json.Serialization;

namespace Xorva.Core.Common;

/// <summary>
/// Implemented by response envelopes so a result filter can promote intercepted
/// (queued-for-approval) responses to HTTP 202 Accepted.
/// </summary>
public interface IApprovalAware
{
    bool PendingApproval { get; }
    Guid? ApprovalRequestId { get; }
}

/// <summary>
/// Standard API response envelope. Every endpoint returns this shape.
/// Frontend team always knows: response.success → read response.data
///                              !response.success → read response.message + response.errors
/// </summary>
/// <typeparam name="T">The type of the data payload.</typeparam>
public class ApiResponse<T> : IApprovalAware
{
    [JsonPropertyName("success")]
    public bool Success { get; init; }

    [JsonPropertyName("data")]
    public T? Data { get; init; }

    [JsonPropertyName("message")]
    public string? Message { get; init; }

    [JsonPropertyName("errors")]
    public List<string>? Errors { get; init; }

    /// <summary>True when the action was intercepted and queued for approval instead of executed.</summary>
    [JsonPropertyName("pendingApproval")]
    public bool PendingApproval { get; init; }

    /// <summary>The approval request id, when PendingApproval is true.</summary>
    [JsonPropertyName("approvalRequestId")]
    public Guid? ApprovalRequestId { get; init; }

    /// <summary>Creates a successful response with data.</summary>
    public static ApiResponse<T> Ok(T data, string? message = null) => new()
    {
        Success = true,
        Data = data,
        Message = message
    };

    /// <summary>Creates an error response without data.</summary>
    public static ApiResponse<T> Fail(string message, List<string>? errors = null) => new()
    {
        Success = false,
        Message = message,
        Errors = errors
    };

    /// <summary>
    /// Creates a "queued for approval" response. The action did NOT execute; it was
    /// captured and will run when approvers finish. Promoted to HTTP 202 by the filter.
    /// </summary>
    public static ApiResponse<T> Pending(Guid approvalRequestId, string message) => new()
    {
        Success = true,
        Message = message,
        PendingApproval = true,
        ApprovalRequestId = approvalRequestId
    };
}

/// <summary>
/// Non-generic API response for endpoints that don't return data (e.g., DELETE).
/// </summary>
public class ApiResponse : IApprovalAware
{
    [JsonPropertyName("success")]
    public bool Success { get; init; }

    [JsonPropertyName("message")]
    public string? Message { get; init; }

    [JsonPropertyName("errors")]
    public List<string>? Errors { get; init; }

    [JsonPropertyName("pendingApproval")]
    public bool PendingApproval { get; init; }

    [JsonPropertyName("approvalRequestId")]
    public Guid? ApprovalRequestId { get; init; }

    public static ApiResponse Ok(string? message = null) => new()
    {
        Success = true,
        Message = message
    };

    public static ApiResponse Fail(string message, List<string>? errors = null) => new()
    {
        Success = false,
        Message = message,
        Errors = errors
    };
}
