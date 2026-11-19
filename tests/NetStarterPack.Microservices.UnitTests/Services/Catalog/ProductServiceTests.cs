using Catalog.Api.Application.DTOs;
using Catalog.Api.Application.Services;
using Microsoft.EntityFrameworkCore;
using NetStarterPack.Microservices.UnitTests.Common.Factories;
using NetStarterPack.Microservices.UnitTests.Common.TestDoubles;

namespace NetStarterPack.Microservices.UnitTests.Services.Catalog;

public class ProductServiceTests
{
    [Fact]
    public async Task CreateProduct_ShouldPersistToIsolatedCatalogDb_AndPublishAuditIntegrationEvent()
    {
        using var ctx = await TestDbFactory.CreateCatalogAsync();
        var currentUser = new FakeCurrentUserService { Username = "staff" };
        var cache = TestCacheFactory.CreateInMemory();
        var eventBus = new InMemoryEventBus();

        var service = new ProductService(ctx.Uow, currentUser, cache, eventBus);

        var createResult = await service.CreateProductAsync(new CreateOrUpdateProductRequest(
            Sku: "ms-test-900",
            Name: "Kubernetes Worker Node",
            Category: "Cloud & Infrastructure",
            Description: "Dedicated node untuk cluster microservice",
            Price: 3500000m,
            Stock: 10,
            Status: "Active"));

        Assert.True(createResult.Succeeded);
        Assert.Equal(201, createResult.StatusCode);
        Assert.Equal("MS-TEST-900", createResult.Data!.Sku);

        Assert.Single(eventBus.PublishedEvents);
        var publishedEvent = eventBus.PublishedEvents[0];
        Assert.Equal("CREATE_PRODUCT", publishedEvent.Action);
        Assert.Equal("Catalog.Api", publishedEvent.SourceService);
    }

    [Fact]
    public async Task CreateProduct_WithDuplicateSku_ShouldReturn409()
    {
        using var ctx = await TestDbFactory.CreateCatalogAsync();
        var service = new ProductService(ctx.Uow, new FakeCurrentUserService(), TestCacheFactory.CreateInMemory(), new InMemoryEventBus());

        var existing = (await service.GetAllProductsAsync()).Data!.First();

        var duplicate = await service.CreateProductAsync(new CreateOrUpdateProductRequest(
            Sku: existing.Sku.ToLowerInvariant(),
            Name: "Produk Duplikat",
            Category: "Hardware",
            Description: "Harus ditolak karena SKU sama",
            Price: 100000m,
            Stock: 1,
            Status: "Active"));

        Assert.False(duplicate.Succeeded);
        Assert.Equal(409, duplicate.StatusCode);
    }

    [Fact]
    public async Task UpdateAndDeleteProduct_ShouldInvalidateCacheSoftDelete_AndPublishAuditEvents()
    {
        using var ctx = await TestDbFactory.CreateCatalogAsync();
        var cache = TestCacheFactory.CreateInMemory();
        var eventBus = new InMemoryEventBus();
        var service = new ProductService(ctx.Uow, new FakeCurrentUserService(), cache, eventBus);

        // Warm up cache
        var initialList = (await service.GetAllProductsAsync()).Data!;
        var target = initialList.First();

        var updateRes = await service.UpdateProductAsync(target.Id, new CreateOrUpdateProductRequest(
            Sku: target.Sku,
            Name: "Updated Catalog Name",
            Category: target.Category,
            Description: target.Description,
            Price: target.Price + 50000m,
            Stock: target.Stock + 2,
            Status: "Active"));

        Assert.True(updateRes.Succeeded);
        Assert.Equal("Updated Catalog Name", updateRes.Data!.Name);

        var deleteRes = await service.DeleteProductAsync(target.Id);
        Assert.True(deleteRes.Succeeded);

        // List setelah delete berkurang 1 (cache ter-invalidate) & di DB tetap ada dengan IsDeleted = true
        var afterDeleteList = (await service.GetAllProductsAsync()).Data!;
        Assert.Equal(initialList.Count - 1, afterDeleteList.Count);

        var deletedEntity = await ctx.Db.Products.IgnoreQueryFilters().FirstOrDefaultAsync(p => p.Id == target.Id);
        Assert.NotNull(deletedEntity);
        Assert.True(deletedEntity!.IsDeleted);

        Assert.Contains(eventBus.PublishedEvents, e => e.Action == "UPDATE_PRODUCT" && e.SourceService == "Catalog.Api");
        Assert.Contains(eventBus.PublishedEvents, e => e.Action == "DELETE_PRODUCT" && e.SourceService == "Catalog.Api");
    }
}
