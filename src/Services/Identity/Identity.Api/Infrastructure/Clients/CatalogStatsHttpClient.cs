using System.Net.Http.Json;
using BuildingBlocks.Core.Common;
using BuildingBlocks.Core.Contracts;
using BuildingBlocks.Infrastructure.Messaging;
using BuildingBlocks.Security;
using Identity.Api.Application.Interfaces;
using Microsoft.Extensions.Options;

namespace Identity.Api.Infrastructure.Clients;

/// <summary>
/// HTTP Client resilient dari Identity.Api ke Catalog.Api untuk mengambil metrik produk pada Dashboard.
/// Menyertakan X-Internal-Api-Key untuk autentikasi Service-to-Service (Zero-Trust internal)
/// dan dilengkapi fallback otomatis jika Catalog.Api sedang offline agar Dashboard tetap hidup.
/// </summary>
public class CatalogStatsHttpClient(
    HttpClient httpClient,
    IOptions<ServiceEndpointsSettings> endpointOptions,
    IOptions<JwtSettings> jwtOptions,
    ILogger<CatalogStatsHttpClient> logger) : ICatalogStatsClient
{
    private readonly ServiceEndpointsSettings _endpoints = endpointOptions.Value;
    private readonly JwtSettings _jwtSettings = jwtOptions.Value;

    public async Task<CatalogStatsDto> GetCatalogStatsAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            // Timeout, Retry, & Circuit Breaker dikelola secara terpusat oleh Polly v8 (AddStandardMicroserviceResilience)
            var url = $"{_endpoints.CatalogServiceUrl.TrimEnd('/')}/api/v1/products/stats";
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Add(InternalApiKeyHelper.HeaderName, _jwtSettings.InternalApiKey);

            using var httpResponse = await httpClient.SendAsync(request, cancellationToken);
            if (!httpResponse.IsSuccessStatusCode)
            {
                return new CatalogStatsDto(0, 0m, 0, 0);
            }

            var response = await httpResponse.Content.ReadFromJsonAsync<Result<CatalogStatsDto>>(cancellationToken);
            if (response is { Succeeded: true, Data: not null })
            {
                return response.Data;
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "[RESILIENT FALLBACK] Gagal mengambil statistik produk dari Catalog.Api. Menggunakan nilai default 0.");
        }

        return new CatalogStatsDto(0, 0m, 0, 0);
    }
}
