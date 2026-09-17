using System.Text.Json.Serialization;

namespace Xorva.Core.Common;

/// <summary>
/// Generic paginated result wrapper for list endpoints.
/// Supports cursor-based pagination metadata for the frontend.
/// </summary>
/// <typeparam name="T">The type of items in the list.</typeparam>
public class PagedResult<T>
{
    [JsonPropertyName("items")]
    public List<T> Items { get; init; } = [];

    [JsonPropertyName("totalCount")]
    public int TotalCount { get; init; }

    [JsonPropertyName("page")]
    public int Page { get; init; }

    [JsonPropertyName("pageSize")]
    public int PageSize { get; init; }

    [JsonPropertyName("totalPages")]
    public int TotalPages => (int)Math.Ceiling((double)TotalCount / PageSize);

    [JsonPropertyName("hasNextPage")]
    public bool HasNextPage => Page < TotalPages;

    [JsonPropertyName("hasPreviousPage")]
    public bool HasPreviousPage => Page > 1;

    public static PagedResult<T> Create(List<T> items, int totalCount, int page, int pageSize) => new()
    {
        Items = items,
        TotalCount = totalCount,
        Page = page,
        PageSize = pageSize
    };
}
