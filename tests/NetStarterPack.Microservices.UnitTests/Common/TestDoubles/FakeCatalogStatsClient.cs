using BuildingBlocks.Core.Contracts;
using Identity.Api.Application.Interfaces;

namespace NetStarterPack.Microservices.UnitTests.Common.TestDoubles;

/// <summary>
/// Stub ICatalogStatsClient agar DashboardService (Identity.Api) dapat diuji tanpa HTTP call ke Catalog.Api.
/// </summary>
public sealed class FakeCatalogStatsClient(CatalogStatsDto stats) : ICatalogStatsClient
{
    public Task<CatalogStatsDto> GetCatalogStatsAsync(CancellationToken cancellationToken = default) =>
        Task.FromResult(stats);
}
