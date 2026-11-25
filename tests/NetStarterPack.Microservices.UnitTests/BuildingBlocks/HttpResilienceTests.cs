using System.Net;
using BuildingBlocks.Infrastructure.Resilience;
using Microsoft.Extensions.DependencyInjection;
using Polly.CircuitBreaker;

namespace NetStarterPack.Microservices.UnitTests.BuildingBlocks;

public class HttpResilienceTests
{
    private sealed class SequenceHttpMessageHandler(Func<int, HttpResponseMessage> responder) : HttpMessageHandler
    {
        public int CallCount { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            CallCount++;
            return Task.FromResult(responder(CallCount));
        }
    }

    [Fact]
    public async Task AddStandardMicroserviceResilience_ShouldRetryTransient503_AndSucceedOnThirdAttempt()
    {
        var handler = new SequenceHttpMessageHandler(attempt =>
            attempt < 3
                ? new HttpResponseMessage(HttpStatusCode.ServiceUnavailable)
                : new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("ok") });

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddHttpClient("RetryTestClient")
            .ConfigurePrimaryHttpMessageHandler(() => handler)
            .AddStandardMicroserviceResilience(configureOverride: opts =>
            {
                opts.MaxRetryAttempts = 2;
                opts.RetryBaseDelayMs = 10;
                opts.AttemptTimeoutSeconds = 2;
                opts.TotalRequestTimeoutSeconds = 6;
                opts.CircuitBreakerMinimumThroughput = 10;
            });

        await using var provider = services.BuildServiceProvider();
        var client = provider.GetRequiredService<IHttpClientFactory>().CreateClient("RetryTestClient");

        var response = await client.GetAsync("http://localhost:5082/api/v1/products/stats");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(3, handler.CallCount);
    }

    [Fact]
    public async Task AddStandardMicroserviceResilience_ShouldNotRetryClient400BadRequest()
    {
        var handler = new SequenceHttpMessageHandler(_ => new HttpResponseMessage(HttpStatusCode.BadRequest));

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddHttpClient("NoRetry400Client")
            .ConfigurePrimaryHttpMessageHandler(() => handler)
            .AddStandardMicroserviceResilience(configureOverride: opts =>
            {
                opts.MaxRetryAttempts = 3;
                opts.RetryBaseDelayMs = 10;
            });

        await using var provider = services.BuildServiceProvider();
        var client = provider.GetRequiredService<IHttpClientFactory>().CreateClient("NoRetry400Client");

        var response = await client.GetAsync("http://localhost:5082/api/v1/products");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(1, handler.CallCount);
    }

    [Fact]
    public async Task AddStandardMicroserviceResilience_ShouldOpenCircuitBreakerAndFailFastAfterThreshold()
    {
        var handler = new SequenceHttpMessageHandler(_ => new HttpResponseMessage(HttpStatusCode.InternalServerError));

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddHttpClient("CircuitBreakerClient")
            .ConfigurePrimaryHttpMessageHandler(() => handler)
            .AddStandardMicroserviceResilience(configureOverride: opts =>
            {
                opts.MaxRetryAttempts = 0;
                opts.AttemptTimeoutSeconds = 2;
                opts.TotalRequestTimeoutSeconds = 5;
                opts.CircuitBreakerFailureRatio = 0.5;
                opts.CircuitBreakerMinimumThroughput = 2;
                opts.CircuitBreakerSamplingDurationSeconds = 10;
                opts.CircuitBreakerBreakDurationSeconds = 30;
            });

        await using var provider = services.BuildServiceProvider();
        var client = provider.GetRequiredService<IHttpClientFactory>().CreateClient("CircuitBreakerClient");

        var res1 = await client.GetAsync("http://localhost:5081/api/v1/health");
        var res2 = await client.GetAsync("http://localhost:5081/api/v1/health");

        Assert.Equal(HttpStatusCode.InternalServerError, res1.StatusCode);
        Assert.Equal(HttpStatusCode.InternalServerError, res2.StatusCode);
        Assert.Equal(2, handler.CallCount);

        // Request ke-3 harus langsung ditolak fail-fast oleh Circuit Breaker tanpa menyentuh handler
        await Assert.ThrowsAsync<BrokenCircuitException>(
            () => client.GetAsync("http://localhost:5081/api/v1/health"));
        Assert.Equal(2, handler.CallCount);
    }

    [Fact]
    public async Task AddStandardMicroserviceResilience_WhenDisabled_ShouldBypassRetries()
    {
        var handler = new SequenceHttpMessageHandler(_ => new HttpResponseMessage(HttpStatusCode.ServiceUnavailable));

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddHttpClient("DisabledResilienceClient")
            .ConfigurePrimaryHttpMessageHandler(() => handler)
            .AddStandardMicroserviceResilience(configureOverride: opts =>
            {
                opts.Enabled = false;
                opts.MaxRetryAttempts = 3;
            });

        await using var provider = services.BuildServiceProvider();
        var client = provider.GetRequiredService<IHttpClientFactory>().CreateClient("DisabledResilienceClient");

        var response = await client.GetAsync("http://localhost:5082/api/v1/products/stats");

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Equal(1, handler.CallCount);
    }
}
