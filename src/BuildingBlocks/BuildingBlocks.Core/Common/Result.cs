namespace BuildingBlocks.Core.Common;

/// <summary>
/// Pembungkus hasil operasi standar (Result Pattern) yang seragam di seluruh microservice dan API Gateway.
/// </summary>
public class Result
{
    public bool Succeeded { get; init; }
    public string Message { get; init; } = string.Empty;
    public string[] Errors { get; init; } = [];
    public int StatusCode { get; init; } = 200;

    public static Result Success(string message = "Success", int statusCode = 200) =>
        new() { Succeeded = true, Message = message, StatusCode = statusCode };

    public static Result Failure(string message, int statusCode = 400, params string[] errors) =>
        new()
        {
            Succeeded = false,
            Message = message,
            StatusCode = statusCode,
            Errors = errors.Length > 0 ? errors : [message]
        };
}

public class Result<T> : Result
{
    public T? Data { get; init; }

    public static Result<T> Success(T data, string message = "Success", int statusCode = 200) =>
        new() { Succeeded = true, Data = data, Message = message, StatusCode = statusCode };

    public new static Result<T> Failure(string message, int statusCode = 400, params string[] errors) =>
        new()
        {
            Succeeded = false,
            Message = message,
            StatusCode = statusCode,
            Errors = errors.Length > 0 ? errors : [message]
        };
}

public class PagedResult<T>
{
    public IReadOnlyList<T> Items { get; init; } = [];
    public int PageNumber { get; init; }
    public int PageSize { get; init; }
    public int TotalCount { get; init; }
    public int TotalPages => PageSize > 0 ? (int)Math.Ceiling(TotalCount / (double)PageSize) : 0;
    public bool HasPreviousPage => PageNumber > 1;
    public bool HasNextPage => PageNumber < TotalPages;
}
