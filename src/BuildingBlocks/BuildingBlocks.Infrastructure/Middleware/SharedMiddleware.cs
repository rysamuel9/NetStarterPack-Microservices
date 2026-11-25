using BuildingBlocks.Core.Common;
using BuildingBlocks.Security;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace BuildingBlocks.Infrastructure.Middleware;

/// <summary>
/// Global Exception Handler terstandarisasi untuk mengembalikan Result.Failure JSON di seluruh microservice.
/// Detail exception.Message HANYA disertakan pada environment Development agar tidak membocorkan informasi internal di Production.
/// </summary>
public class GlobalExceptionHandler(
    ILogger<GlobalExceptionHandler> logger,
    IHostEnvironment hostEnvironment) : IExceptionHandler
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

        var response = hostEnvironment.IsDevelopment()
            ? Result.Failure(
                $"Terjadi kesalahan internal pada microservice (Correlation ID: {correlationId}).",
                500,
                exception.Message)
            : Result.Failure(
                $"Terjadi kesalahan internal pada server. Silakan hubungi administrator dengan Correlation ID: {correlationId}.",
                500);

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

/// <summary>
/// Middleware HTTP Security Headers (Defense-in-Depth) untuk seluruh microservice dan API Gateway.
/// Memasang X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy,
/// Cross-Origin-Resource-Policy, CSP untuk API JSON, serta HSTS di HTTPS non-Development.
/// </summary>
public class SecurityHeadersMiddleware(RequestDelegate next, IHostEnvironment hostEnvironment)
{
    public async Task InvokeAsync(HttpContext context)
    {
        context.Response.OnStarting(() =>
        {
            var headers = context.Response.Headers;
            headers.Remove("Server");
            headers.Remove("X-Powered-By");

            headers["X-Content-Type-Options"] = "nosniff";
            headers["X-Frame-Options"] = "DENY";
            headers["Referrer-Policy"] = "no-referrer";
            headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=()";
            headers["Cross-Origin-Resource-Policy"] = "same-site";

            var path = context.Request.Path.Value ?? string.Empty;
            var isApiDocsRoute =
                path.StartsWith("/swagger", StringComparison.OrdinalIgnoreCase) ||
                path.StartsWith("/scalar", StringComparison.OrdinalIgnoreCase);

            if (!isApiDocsRoute && !headers.ContainsKey("Content-Security-Policy"))
            {
                headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'";
            }

            if (context.Request.IsHttps && !hostEnvironment.IsDevelopment())
            {
                headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
            }

            return Task.CompletedTask;
        });

        await next(context);
    }
}
