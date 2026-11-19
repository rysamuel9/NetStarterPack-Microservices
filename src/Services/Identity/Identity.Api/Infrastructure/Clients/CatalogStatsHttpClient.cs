using System.Net.Http.Json;
using BuildingBlocks.Core.Common;
using BuildingBlocks.Core.Contracts;
using BuildingBlocks.Infrastructure.Messaging;
using Identity.Api.Application.Interfaces;
using Microsoft.Extensions.Options;

namespace Identity.Api.Infrastructure.Clients;

/// <summary>
/// HTTP Client resilient dari Identity.Api ke Catalog.Api untuk mengambil metrik produk pada Dashboard.
/// Dilengkapi fallback otomatis jika Catalog.Api sedang offline agar Dashboard tetap hidup.
/// </summary>
public class CatalogStatsHttpClient(
    HttpClient httpClient,
    IOptions<ServiceEndpointsSettings> endpointOptions,
    ILogger<CatalogStatsHttpClient> logger) : ICatalogStatsClient
{
    private readonly ServiceEndpointsSettings _endpoints = endpointOptions.Value;

    public async Task<CatalogStatsDto> GetCatalogStatsAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            cts.CancelAfter(TimeSpan.FromSeconds(2));

            var url = $"{_endpoints.CatalogServiceUrl.TrimEnd('/')}/api/products/stats";
            var response = await httpClient.GetFromJsonAsync<Result<CatalogStatsDto>>(url, cts.Token);
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
