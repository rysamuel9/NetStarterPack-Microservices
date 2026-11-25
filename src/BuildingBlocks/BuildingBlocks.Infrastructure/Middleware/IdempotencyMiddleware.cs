using System.Collections.Concurrent;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using BuildingBlocks.Core.Attributes;
using BuildingBlocks.Core.Common;
using BuildingBlocks.Core.Constants;
using BuildingBlocks.Core.Interfaces;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace BuildingBlocks.Infrastructure.Middleware;

public class IdempotencySettings
{
    public const string SectionName = "IdempotencySettings";

    /// <summary>Mengaktifkan atau menonaktifkan IdempotencyMiddleware per microservice.</summary>
    public bool Enabled { get; set; } = true;

    /// <summary>Masa simpan default response idempotent di Hybrid Cache L1/L2 (menit).</summary>
    public int DefaultExpirationMinutes { get; set; } = 30;

    /// <summary>Durasi lock InProgress (detik) saat request yang sama masih sedang diproses.</summary>
    public int InProgressLockSeconds { get; set; } = 60;

    /// <summary>Batas panjang maksimal karakter header Idempotency-Key.</summary>
    public int MaxKeyLength { get; set; } = 128;

    /// <summary>Batas ukuran body request (byte) yang di-hash untuk validasi kesamaan payload (default 1 MB).</summary>
    public long MaxBodyHashBytes { get; set; } = 1024 * 1024;
}

/// <summary>
/// Entri yang disimpan di Hybrid Cache L1/L2 (<see cref="ICacheService"/>) untuk melacak status &amp; hasil response idempotent.
/// </summary>
public sealed record IdempotencyRecord(
    bool IsCompleted,
    string RequestHash,
    int StatusCode,
    string ContentType,
    string Body,
    DateTime CreatedAtUtc);

/// <summary>
/// Middleware anti double-submit berbasis header <c>Idempotency-Key</c> dan Hybrid Cache L1/L2.
/// Menangani 3 skenario utama:
/// 1) Request duplikat setelah selesai -> replay response lama (header <c>X-Idempotent-Replayed: true</c>).
/// 2) Request duplikat saat request pertama masih berjalan -> tolak dengan HTTP 409 Conflict.
/// 3) Idempotency-Key sama tapi payload request berbeda -> tolak dengan HTTP 422 Unprocessable Entity.
/// </summary>
public class IdempotencyMiddleware(
    RequestDelegate next,
    ICacheService cacheService,
    IOptions<IdempotencySettings> idempotencyOptions,
    ILogger<IdempotencyMiddleware> logger,
    string serviceScope = "default")
{
    private readonly IdempotencySettings _settings = idempotencyOptions.Value;
    private readonly ConcurrentDictionary<string, byte> _inFlightKeys = new();

    public async Task InvokeAsync(HttpContext context)
    {
        if (!_settings.Enabled || !IsMutatingMethod(context.Request.Method))
        {
            await next(context);
            return;
        }

        var attribute = context.GetEndpoint()?.Metadata.GetMetadata<IdempotentAttribute>();
        if (attribute is null)
        {
            await next(context);
            return;
        }

        var hasHeader = context.Request.Headers.TryGetValue(IdempotencyHeaders.Key, out var rawKeyValues);
        var idempotencyKey = hasHeader ? rawKeyValues.ToString().Trim() : string.Empty;

        if (string.IsNullOrWhiteSpace(idempotencyKey))
        {
            if (attribute.RequireKey)
            {
                await WriteJsonResultAsync(
                    context,
                    Result.Failure($"Header '{IdempotencyHeaders.Key}' wajib disertakan untuk endpoint ini.", StatusCodes.Status400BadRequest));
                return;
            }

            await next(context);
            return;
        }

        if (idempotencyKey.Length > _settings.MaxKeyLength)
        {
            await WriteJsonResultAsync(
                context,
                Result.Failure($"Panjang header '{IdempotencyHeaders.Key}' maksimal {_settings.MaxKeyLength} karakter.", StatusCodes.Status400BadRequest));
            return;
        }

        var userScope = ResolveUserScope(context);
        var path = context.Request.Path.Value ?? "/";
        var cacheKey = CacheKeys.Idempotency(serviceScope, userScope, context.Request.Method, path, idempotencyKey);
        var requestHash = await ComputeRequestHashAsync(context);

        var existing = await cacheService.GetAsync<IdempotencyRecord>(cacheKey, context.RequestAborted);
        if (existing is not null)
        {
            await HandleExistingRecordAsync(context, existing, idempotencyKey, requestHash);
            return;
        }

        if (!_inFlightKeys.TryAdd(cacheKey, 0))
        {
            await WriteJsonResultAsync(
                context,
                Result.Failure("Permintaan dengan Idempotency-Key ini sedang diproses. Mohon tunggu sebentar.", StatusCodes.Status409Conflict),
                idempotencyKey);
            return;
        }

        var completedSuccessfully = false;
        var originalBodyStream = context.Response.Body;

        try
        {
            // Double-checked lookup setelah mendapatkan in-process lock
            existing = await cacheService.GetAsync<IdempotencyRecord>(cacheKey, context.RequestAborted);
            if (existing is not null)
            {
                await HandleExistingRecordAsync(context, existing, idempotencyKey, requestHash);
                return;
            }

            var lockTtl = TimeSpan.FromSeconds(Math.Max(5, _settings.InProgressLockSeconds));
            var inProgressRecord = new IdempotencyRecord(
                IsCompleted: false,
                RequestHash: requestHash,
                StatusCode: 0,
                ContentType: string.Empty,
                Body: string.Empty,
                CreatedAtUtc: DateTime.UtcNow);

            await cacheService.SetAsync(cacheKey, inProgressRecord, lockTtl, context.RequestAborted);

            await using var responseBuffer = new MemoryStream();
            context.Response.Body = responseBuffer;

            await next(context);

            responseBuffer.Position = 0;
            using var reader = new StreamReader(responseBuffer, Encoding.UTF8, detectEncodingFromByteOrderMarks: false, leaveOpen: true);
            var responseBodyText = await reader.ReadToEndAsync(context.RequestAborted);

            var statusCode = context.Response.StatusCode;
            if (statusCode is >= 200 and < 300)
            {
                var ttlMinutes = attribute.ExpirationMinutes > 0
                    ? attribute.ExpirationMinutes
                    : _settings.DefaultExpirationMinutes;

                var completedRecord = new IdempotencyRecord(
                    IsCompleted: true,
                    RequestHash: requestHash,
                    StatusCode: statusCode,
                    ContentType: string.IsNullOrWhiteSpace(context.Response.ContentType)
                        ? "application/json; charset=utf-8"
                        : context.Response.ContentType,
                    Body: responseBodyText,
                    CreatedAtUtc: DateTime.UtcNow);

                await cacheService.SetAsync(
                    cacheKey,
                    completedRecord,
                    TimeSpan.FromMinutes(Math.Max(1, ttlMinutes)),
                    context.RequestAborted);

                completedSuccessfully = true;
            }

            context.Response.Body = originalBodyStream;
            if (!context.Response.HasStarted)
            {
                context.Response.Headers[IdempotencyHeaders.Key] = idempotencyKey;
            }

            responseBuffer.Position = 0;
            await responseBuffer.CopyToAsync(originalBodyStream, context.RequestAborted);
        }
        finally
        {
            context.Response.Body = originalBodyStream;

            if (!completedSuccessfully && existing is null)
            {
                // Request gagal (4xx/5xx/exception): hapus lock InProgress supaya client bisa retry dengan aman
                await cacheService.RemoveAsync(cacheKey, CancellationToken.None);
            }

            _inFlightKeys.TryRemove(cacheKey, out _);
        }
    }

    private async Task HandleExistingRecordAsync(
        HttpContext context,
        IdempotencyRecord existing,
        string idempotencyKey,
        string requestHash)
    {
        if (!existing.IsCompleted)
        {
            logger.LogWarning(
                "[IDEMPOTENCY CONFLICT] Concurrent duplicate request blocked for {Method} {Path} (Key: {IdempotencyKey}).",
                context.Request.Method,
                context.Request.Path,
                idempotencyKey);

            await WriteJsonResultAsync(
                context,
                Result.Failure("Permintaan dengan Idempotency-Key ini sedang diproses. Mohon tunggu sebentar.", StatusCodes.Status409Conflict),
                idempotencyKey);
            return;
        }

        if (!string.Equals(existing.RequestHash, requestHash, StringComparison.Ordinal))
        {
            logger.LogWarning(
                "[IDEMPOTENCY MISMATCH] Key reused with different payload on {Method} {Path} (Key: {IdempotencyKey}).",
                context.Request.Method,
                context.Request.Path,
                idempotencyKey);

            await WriteJsonResultAsync(
                context,
                Result.Failure("Idempotency-Key sudah pernah digunakan untuk payload request yang berbeda.", StatusCodes.Status422UnprocessableEntity),
                idempotencyKey);
            return;
        }

        logger.LogInformation(
            "[IDEMPOTENCY REPLAY] Mengembalikan response cache untuk {Method} {Path} (Key: {IdempotencyKey}).",
            context.Request.Method,
            context.Request.Path,
            idempotencyKey);

        context.Response.StatusCode = existing.StatusCode;
        context.Response.ContentType = string.IsNullOrWhiteSpace(existing.ContentType)
            ? "application/json; charset=utf-8"
            : existing.ContentType;
        context.Response.Headers[IdempotencyHeaders.Key] = idempotencyKey;
        context.Response.Headers[IdempotencyHeaders.Replayed] = "true";

        if (!string.IsNullOrEmpty(existing.Body))
        {
            await context.Response.WriteAsync(existing.Body, Encoding.UTF8, context.RequestAborted);
        }
    }

    private async Task<string> ComputeRequestHashAsync(HttpContext context)
    {
        using var hasher = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);

        var queryBytes = Encoding.UTF8.GetBytes(context.Request.QueryString.Value ?? string.Empty);
        hasher.AppendData(queryBytes);

        if (!context.Request.HasFormContentType &&
            (context.Request.ContentLength is null || context.Request.ContentLength <= _settings.MaxBodyHashBytes))
        {
            context.Request.EnableBuffering();
            context.Request.Body.Position = 0;

            var buffer = new byte[8192];
            long totalRead = 0;
            int bytesRead;

            while ((bytesRead = await context.Request.Body.ReadAsync(buffer, context.RequestAborted)) > 0)
            {
                totalRead += bytesRead;
                if (totalRead > _settings.MaxBodyHashBytes)
                {
                    break;
                }

                hasher.AppendData(buffer, 0, bytesRead);
            }

            context.Request.Body.Position = 0;
        }

        return Convert.ToHexString(hasher.GetHashAndReset());
    }

    private static string ResolveUserScope(HttpContext context)
    {
        var userId = context.User?.FindFirstValue(ClaimTypes.NameIdentifier)
                     ?? context.User?.FindFirstValue("sub");

        return string.IsNullOrWhiteSpace(userId) ? "anonymous" : userId;
    }

    private static bool IsMutatingMethod(string method) =>
        HttpMethods.IsPost(method) ||
        HttpMethods.IsPut(method) ||
        HttpMethods.IsPatch(method) ||
        HttpMethods.IsDelete(method);

    private static async Task WriteJsonResultAsync(HttpContext context, Result payload, string? idempotencyKey = null)
    {
        context.Response.StatusCode = payload.StatusCode;
        context.Response.ContentType = "application/json; charset=utf-8";
        if (!string.IsNullOrWhiteSpace(idempotencyKey))
        {
            context.Response.Headers[IdempotencyHeaders.Key] = idempotencyKey;
        }

        await context.Response.WriteAsJsonAsync(payload, context.RequestAborted);
    }
}
