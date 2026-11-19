using BuildingBlocks.Core.Common;
using BuildingBlocks.Security;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

namespace BuildingBlocks.Infrastructure.Middleware;

/// <summary>
/// Global Exception Handler terstandarisasi untuk mengembalikan Result.Failure JSON di seluruh microservice.
/// </summary>
public class GlobalExceptionHandler(ILogger<GlobalExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        var correlationId = httpContext.Request.Headers[CurrentUserService.CorrelationHeaderName].FirstOrDefault()
                            ?? httpContext.TraceIdentifier;

        logger.LogError(
            exception,
            "[CorrelationId: {CorrelationId}] Unhandled exception occurred: {Message}",
            correlationId,
            exception.Message);

        httpContext.Response.StatusCode = StatusCodes.Status500InternalServerError;
        httpContext.Response.ContentType = "application/json";

        var response = Result.Failure(
            "Terjadi kesalahan internal pada microservice. Silakan periksa log dengan Correlation ID terkait.",
            500,
            exception.Message);

        await httpContext.Response.WriteAsJsonAsync(response, cancellationToken);
        return true;
    }
}

/// <summary>
/// Middleware Distributed Tracing: memastikan setiap HTTP Request yang masuk dari Gateway ke Microservice
/// selalu memiliki header X-Correlation-Id yang sama untuk memudahkan pelacakan log lintas service.
/// </summary>
public class CorrelationIdMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context)
    {
        if (!context.Request.Headers.TryGetValue(CurrentUserService.CorrelationHeaderName, out var correlationId) ||
            string.IsNullOrWhiteSpace(correlationId))
        {
            correlationId = Guid.NewGuid().ToString("N");
            context.Request.Headers[CurrentUserService.CorrelationHeaderName] = correlationId;
        }

        context.Response.OnStarting(() =>
        {
            context.Response.Headers[CurrentUserService.CorrelationHeaderName] = correlationId.ToString();
            return Task.CompletedTask;
        });

        await next(context);
    }
}
