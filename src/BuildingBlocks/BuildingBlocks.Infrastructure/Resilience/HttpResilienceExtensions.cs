using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Http.Resilience;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Polly;
using Polly.CircuitBreaker;
using Polly.Retry;

namespace BuildingBlocks.Infrastructure.Resilience;

public class HttpResilienceSettings
{
    public const string SectionName = "HttpResilienceSettings";

    /// <summary>Mengaktifkan pipeline Polly v8 (Retry + Circuit Breaker + Timeout) pada HttpClient antar-service.</summary>
    public bool Enabled { get; set; } = true;

    /// <summary>Jumlah retry otomatis untuk kegagalan transient (5xx, 408, 429, network error, timeout).</summary>
    public int MaxRetryAttempts { get; set; } = 2;

    /// <summary>Delay dasar (ms) untuk exponential backoff dengan jitter.</summary>
    public int RetryBaseDelayMs { get; set; } = 200;

    /// <summary>Timeout per 1 percobaan HTTP request (detik).</summary>
    public int AttemptTimeoutSeconds { get; set; } = 3;

    /// <summary>Batas total waktu request termasuk seluruh retry (detik).</summary>
    public int TotalRequestTimeoutSeconds { get; set; } = 8;

    /// <summary>Rasio kegagalan (0.1 - 1.0) untuk memicu Circuit Breaker terbuka.</summary>
    public double CircuitBreakerFailureRatio { get; set; } = 0.5;

    /// <summary>Minimum jumlah request dalam jendela sampling sebelum Circuit Breaker mengevaluasi rasio kegagalan.</summary>
    public int CircuitBreakerMinimumThroughput { get; set; } = 5;

    /// <summary>Jendela sampling Circuit Breaker (detik). Otomatis minimal 2x AttemptTimeout + 1 detik sesuai aturan Polly v8.</summary>
    public int CircuitBreakerSamplingDurationSeconds { get; set; } = 30;

    /// <summary>Durasi Circuit Breaker tetap terbuka (fail-fast) sebelum masuk status Half-Open (detik).</summary>
    public int CircuitBreakerBreakDurationSeconds { get; set; } = 15;
}

/// <summary>
/// Extension standar untuk memasang HTTP Resilience berbasis Polly v8 (Microsoft.Extensions.Http.Resilience)
/// pada setiap typed/named HttpClient antar-microservice:
/// Total Timeout -> Exponential Backoff Retry (with Jitter) -> Circuit Breaker -> Per-Attempt Timeout.
/// </summary>
public static class HttpResilienceExtensions
{
    public const string StandardPipelineName = "microservice-standard";

    public static IHttpClientBuilder AddStandardMicroserviceResilience(
        this IHttpClientBuilder builder,
        IConfiguration? configuration = null,
        Action<HttpResilienceSettings>? configureOverride = null)
    {
        if (configuration is not null)
        {
            builder.Services.Configure<HttpResilienceSettings>(
                configuration.GetSection(HttpResilienceSettings.SectionName));
        }

        builder.AddResilienceHandler(StandardPipelineName, (pipelineBuilder, context) =>
        {
            var boundSettings = context.ServiceProvider.GetService<IOptions<HttpResilienceSettings>>()?.Value;
            var settings = new HttpResilienceSettings
            {
                Enabled = boundSettings?.Enabled ?? true,
                MaxRetryAttempts = boundSettings?.MaxRetryAttempts ?? 2,
                RetryBaseDelayMs = boundSettings?.RetryBaseDelayMs ?? 200,
                AttemptTimeoutSeconds = boundSettings?.AttemptTimeoutSeconds ?? 3,
                TotalRequestTimeoutSeconds = boundSettings?.TotalRequestTimeoutSeconds ?? 8,
                CircuitBreakerFailureRatio = boundSettings?.CircuitBreakerFailureRatio ?? 0.5,
                CircuitBreakerMinimumThroughput = boundSettings?.CircuitBreakerMinimumThroughput ?? 5,
                CircuitBreakerSamplingDurationSeconds = boundSettings?.CircuitBreakerSamplingDurationSeconds ?? 30,
                CircuitBreakerBreakDurationSeconds = boundSettings?.CircuitBreakerBreakDurationSeconds ?? 15
            };

            configureOverride?.Invoke(settings);

            if (!settings.Enabled)
            {
                return;
            }

            var logger = context.ServiceProvider
                .GetRequiredService<ILoggerFactory>()
                .CreateLogger("BuildingBlocks.HttpResilience");

            var attemptTimeout = TimeSpan.FromSeconds(Math.Max(1, settings.AttemptTimeoutSeconds));
            var totalTimeout = TimeSpan.FromSeconds(Math.Max(settings.AttemptTimeoutSeconds + 1, settings.TotalRequestTimeoutSeconds));
            var samplingDuration = TimeSpan.FromSeconds(
                Math.Max(settings.CircuitBreakerSamplingDurationSeconds, settings.AttemptTimeoutSeconds * 2 + 1));

            // 1. Outer: Total Request Timeout (budget maksimal termasuk semua retry)
            pipelineBuilder.AddTimeout(totalTimeout);

            // 2. Retry: Exponential Backoff + Jitter untuk error transient (5xx, 408, 429, HttpRequestException, Timeout)
            if (settings.MaxRetryAttempts > 0)
            {
                pipelineBuilder.AddRetry(new HttpRetryStrategyOptions
                {
                    MaxRetryAttempts = settings.MaxRetryAttempts,
                    BackoffType = DelayBackoffType.Exponential,
                    UseJitter = true,
                    Delay = TimeSpan.FromMilliseconds(Math.Max(10, settings.RetryBaseDelayMs)),
                    OnRetry = args =>
                    {
                        var reason = args.Outcome.Exception?.Message
                                     ?? $"HTTP {(int?)args.Outcome.Result?.StatusCode}";
                        logger.LogWarning(
                            "[HTTP RESILIENCE RETRY] Client '{ClientName}' retry ke-{Attempt} setelah {DelayMs}ms (Alasan: {Reason}).",
                            builder.Name,
                            args.AttemptNumber + 1,
                            (int)args.RetryDelay.TotalMilliseconds,
                            reason);
                        return default;
                    }
                });
            }

            // 3. Circuit Breaker: fail-fast ketika downstream sedang bermasalah berkepanjangan
            pipelineBuilder.AddCircuitBreaker(new HttpCircuitBreakerStrategyOptions
            {
                FailureRatio = Math.Clamp(settings.CircuitBreakerFailureRatio, 0.1, 1.0),
                MinimumThroughput = Math.Max(2, settings.CircuitBreakerMinimumThroughput),
                SamplingDuration = samplingDuration,
                BreakDuration = TimeSpan.FromSeconds(Math.Max(1, settings.CircuitBreakerBreakDurationSeconds)),
                OnOpened = args =>
                {
                    logger.LogWarning(
                        "[HTTP CIRCUIT OPEN] Client '{ClientName}' membuka circuit selama {BreakSeconds}s karena rasio kegagalan terlampaui.",
                        builder.Name,
                        (int)args.BreakDuration.TotalSeconds);
                    return default;
                },
                OnClosed = _ =>
                {
                    logger.LogInformation(
                        "[HTTP CIRCUIT CLOSED] Client '{ClientName}' pulih kembali (circuit tertutup normal).",
                        builder.Name);
                    return default;
                },
                OnHalfOpened = _ =>
                {
                    logger.LogInformation(
                        "[HTTP CIRCUIT HALF-OPEN] Client '{ClientName}' sedang menguji pemulihan service tujuan.",
                        builder.Name);
                    return default;
                }
            });

            // 4. Inner: Per-Attempt Timeout
            pipelineBuilder.AddTimeout(attemptTimeout);
        });

        return builder;
    }
}
