using System.Security.Cryptography;
using System.Text;
using BuildingBlocks.Core.Common;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace BuildingBlocks.Security;

/// <summary>
/// Helper validasi X-Internal-Api-Key dengan constant-time comparison (SHA-256 + CryptographicOperations.FixedTimeEquals)
/// untuk mencegah timing side-channel attack maupun kebocoran panjang secret key.
/// </summary>
public static class InternalApiKeyHelper
{
    public const string HeaderName = "X-Internal-Api-Key";

    public static bool IsValid(string? providedKey, string? expectedKey)
    {
        if (string.IsNullOrWhiteSpace(providedKey) || string.IsNullOrWhiteSpace(expectedKey))
        {
            return false;
        }

        var providedHash = SHA256.HashData(Encoding.UTF8.GetBytes(providedKey.Trim()));
        var expectedHash = SHA256.HashData(Encoding.UTF8.GetBytes(expectedKey.Trim()));
        return CryptographicOperations.FixedTimeEquals(providedHash, expectedHash);
    }
}

/// <summary>
/// Mengamankan endpoint statistik / internal yang boleh diakses oleh:
/// 1) User yang sudah login (Zero-Trust JWT valid), ATAU
/// 2) Microservice lain yang mengirim header X-Internal-Api-Key valid (constant-time comparison).
/// Request anonim dari publik akan selalu ditolak dengan HTTP 401.
/// </summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class RequireAuthenticatedOrInternalApiKeyAttribute : Attribute, IAsyncAuthorizationFilter
{
    public Task OnAuthorizationAsync(AuthorizationFilterContext context)
    {
        if (context.HttpContext.User?.Identity?.IsAuthenticated == true)
        {
            return Task.CompletedTask;
        }

        var jwtSettings = context.HttpContext.RequestServices
            .GetRequiredService<IOptions<JwtSettings>>()
            .Value;

        var providedKey = context.HttpContext.Request.Headers[InternalApiKeyHelper.HeaderName].FirstOrDefault();
        if (InternalApiKeyHelper.IsValid(providedKey, jwtSettings.InternalApiKey))
        {
            return Task.CompletedTask;
        }

        context.Result = new ObjectResult(
            Result.Failure("Autentikasi JWT atau X-Internal-Api-Key yang valid diperlukan untuk mengakses endpoint ini.", 401))
        {
            StatusCode = 401
        };

        return Task.CompletedTask;
    }
}

/// <summary>
/// Mengamankan endpoint komunikasi antar-microservice (Service-to-Service) murni yang WAJIB menyertakan X-Internal-Api-Key valid.
/// </summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class RequireInternalApiKeyAttribute : Attribute, IAsyncAuthorizationFilter
{
    public Task OnAuthorizationAsync(AuthorizationFilterContext context)
    {
        var jwtSettings = context.HttpContext.RequestServices
            .GetRequiredService<IOptions<JwtSettings>>()
            .Value;

        var providedKey = context.HttpContext.Request.Headers[InternalApiKeyHelper.HeaderName].FirstOrDefault();
        if (InternalApiKeyHelper.IsValid(providedKey, jwtSettings.InternalApiKey))
        {
            return Task.CompletedTask;
        }

        context.Result = new ObjectResult(
            Result.Failure("Invalid X-Internal-Api-Key for inter-service communication.", 401))
        {
            StatusCode = 401
        };

        return Task.CompletedTask;
    }
}
