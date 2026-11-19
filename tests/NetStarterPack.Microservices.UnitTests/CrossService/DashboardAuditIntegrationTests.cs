using Catalog.Api.Application.DTOs;
using Catalog.Api.Application.Services;
using Identity.Api.Application.Services;
using NetStarterPack.Microservices.UnitTests.Common.Factories;
using NetStarterPack.Microservices.UnitTests.Common.TestDoubles;

namespace NetStarterPack.Microservices.UnitTests.CrossService;

public class DashboardAuditIntegrationTests
{
    [Fact]
    public async Task CatalogEvent_ForwardedToIdentityDashboard_ShouldCombineIdentityAndCatalogMetrics()
    {
        using var identityCtx = await TestDbFactory.CreateIdentityAsync();
        using var catalogCtx = await TestDbFactory.CreateCatalogAsync();

        var currentUser = new FakeCurrentUserService();
        var cache = TestCacheFactory.CreateInMemory();
        var eventBus = new InMemoryEventBus();

        // 1. Tambah produk di Catalog.Api (Database 1)
        var productService = new ProductService(catalogCtx.Uow, currentUser, cache, eventBus);
        await productService.CreateProductAsync(new CreateOrUpdateProductRequest(
            Sku: "MS-AGG-001",
            Name: "API Gateway Appliance",
            Category: "Hardware",
            Description: "YARP Gateway Hardware",
            Price: 5000000m,
            Stock: 2,
            Status: "Active"));

        var catalogStatsResult = await productService.GetCatalogStatsAsync();
        Assert.True(catalogStatsResult.Succeeded);
        Assert.Equal(7, catalogStatsResult.Data!.TotalProducts);

        // 2. Forward AuditLogIntegrationEvent ke Identity.Api (Database 2) & agregasi Dashboard
        var dashboardService = new DashboardService(
            identityCtx.Uow,
            new FakeCatalogStatsClient(catalogStatsResult.Data),
            cache);

        await dashboardService.RecordIntegrationAuditLogAsync(eventBus.PublishedEvents.Single());

        var summaryResult = await dashboardService.GetSummaryAsync();
        Assert.True(summaryResult.Succeeded);
        Assert.Equal(63, summaryResult.Data!.TotalUsers);
        Assert.Equal(7, summaryResult.Data.TotalProducts);
        Assert.Contains(summaryResult.Data.RecentActivities, a => a.Action == "CREATE_PRODUCT");
    }
}
