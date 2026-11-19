using BuildingBlocks.Core.Constants;
using BuildingBlocks.Core.Contracts;
using BuildingBlocks.Core.Interfaces;
using BuildingBlocks.Infrastructure.Caching;
using BuildingBlocks.Security;
using Catalog.Api.Application.DTOs;
using Catalog.Api.Application.Services;
using Catalog.Api.Infrastructure.Persistence;
using Identity.Api.Application.DTOs;
using Identity.Api.Application.Interfaces;
using Identity.Api.Application.Services;
using Identity.Api.Infrastructure.Persistence;
using Identity.Api.Infrastructure.Security;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Order.Api.Application.DTOs;
using Order.Api.Application.Services;
using Order.Api.Infrastructure.Persistence;

namespace NetStarterPack.Microservices.UnitTests;

public class MicroservicesArchitectureTests
{
    private sealed class FakeCurrentUserService : ICurrentUserService
    {
        public Guid? UserId { get; set; } = Guid.NewGuid();
        public string? Username { get; set; } = "superadmin";
        public IReadOnlyList<string> Roles { get; set; } = [RoleNames.SuperAdmin];
        public IReadOnlyList<string> Permissions { get; set; } =
            BuildingBlocks.Core.Constants.Permissions.GetAll().Select(p => p.Code).ToList();
        public string? IpAddress => "127.0.0.1";
        public string CorrelationId => "test-correlation-id-001";
    }

    private sealed class InMemoryEventBus : IEventBus
    {
        public List<AuditLogIntegrationEvent> PublishedEvents { get; } = new();

        public Task PublishAuditAsync(AuditLogIntegrationEvent auditEvent, CancellationToken cancellationToken = default)
        {
            PublishedEvents.Add(auditEvent);
            return Task.CompletedTask;
        }
    }

    private sealed class FakeCatalogStatsClient(CatalogStatsDto stats) : ICatalogStatsClient
    {
        public Task<CatalogStatsDto> GetCatalogStatsAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(stats);
    }

    private static ICacheService CreateTestCacheService()
    {
        var memoryDistributed = new MemoryDistributedCache(Options.Create(new MemoryDistributedCacheOptions()));
        var settings = Options.Create(new CacheSettings { Provider = "InMemory", DefaultExpirationMinutes = 10 });
        return new DistributedCacheService(memoryDistributed, settings, NullLogger<DistributedCacheService>.Instance);
    }

    private static async Task<(IdentityDbContext Db, IdentityUnitOfWork Uow, PasswordHasher Hasher, JwtTokenService Jwt)> CreateSeededIdentityAsync()
    {
        var options = new DbContextOptionsBuilder<IdentityDbContext>()
            .UseInMemoryDatabase($"IdentityTestDb_{Guid.NewGuid()}")
            .Options;

        var db = new IdentityDbContext(options);
        var hasher = new PasswordHasher();
        var jwt = new JwtTokenService(Options.Create(new JwtSettings()));
        var seeder = new IdentityDatabaseSeeder(db, hasher, NullLogger<IdentityDatabaseSeeder>.Instance);
        await seeder.SeedAsync();

        var uow = new IdentityUnitOfWork(db);
        return (db, uow, hasher, jwt);
    }

    private static async Task<(CatalogDbContext Db, CatalogUnitOfWork Uow)> CreateSeededCatalogAsync()
    {
        var options = new DbContextOptionsBuilder<CatalogDbContext>()
            .UseInMemoryDatabase($"CatalogTestDb_{Guid.NewGuid()}")
            .Options;

        var db = new CatalogDbContext(options);
        var seeder = new CatalogDatabaseSeeder(db, NullLogger<CatalogDatabaseSeeder>.Instance);
        await seeder.SeedAsync();

        var uow = new CatalogUnitOfWork(db);
        return (db, uow);
    }

    private static async Task<(OrderDbContext Db, OrderUnitOfWork Uow)> CreateSeededOrderAsync()
    {
        var options = new DbContextOptionsBuilder<OrderDbContext>()
            .UseInMemoryDatabase($"OrderTestDb_{Guid.NewGuid()}")
            .Options;

        var db = new OrderDbContext(options);
        var seeder = new OrderDatabaseSeeder(db, NullLogger<OrderDatabaseSeeder>.Instance);
        await seeder.SeedAsync();

        var uow = new OrderUnitOfWork(db);
        return (db, uow);
    }

    [Fact]
    public async Task IdentityService_Login_And_RefreshTokenRotation_ShouldSucceed()
    {
        var (_, uow, hasher, jwt) = await CreateSeededIdentityAsync();
        var currentUser = new FakeCurrentUserService();
        var cache = CreateTestCacheService();
        var authService = new AuthService(uow, jwt, hasher, currentUser, cache);

        var loginResult = await authService.LoginAsync(new LoginRequest("superadmin", "Password123!"));

        Assert.True(loginResult.Succeeded);
        Assert.NotNull(loginResult.Data);
        Assert.False(string.IsNullOrWhiteSpace(loginResult.Data!.AccessToken));
        Assert.Contains(RoleNames.SuperAdmin, loginResult.Data.User.Roles);

        var oldRefreshToken = loginResult.Data.RefreshToken;
        var refreshResult = await authService.RefreshTokenAsync(new RefreshTokenRequest(oldRefreshToken));

        Assert.True(refreshResult.Succeeded);
        Assert.NotEqual(oldRefreshToken, refreshResult.Data!.RefreshToken);
    }

    [Fact]
    public async Task CatalogService_CreateProduct_ShouldPersistToIsolatedCatalogDb_And_PublishAuditIntegrationEvent()
    {
        var (_, catalogUow) = await CreateSeededCatalogAsync();
        var currentUser = new FakeCurrentUserService { Username = "staff" };
        var cache = CreateTestCacheService();
        var eventBus = new InMemoryEventBus();

        var productService = new ProductService(catalogUow, currentUser, cache, eventBus);

        var createResult = await productService.CreateProductAsync(new CreateOrUpdateProductRequest(
            Sku: "MS-TEST-900",
            Name: "Kubernetes Worker Node",
            Category: "Cloud & Infrastructure",
            Description: "Dedicated node untuk cluster microservice",
            Price: 3500000m,
            Stock: 10,
            Status: "Active"));

        Assert.True(createResult.Succeeded);
        Assert.Equal("MS-TEST-900", createResult.Data!.Sku);

        Assert.Single(eventBus.PublishedEvents);
        var publishedEvent = eventBus.PublishedEvents[0];
        Assert.Equal("CREATE_PRODUCT", publishedEvent.Action);
        Assert.Equal("Catalog.Api", publishedEvent.SourceService);
    }

    [Fact]
    public async Task OrderService_Example2Microservice_ShouldCalculateTotal_InvalidateCache_And_PublishAuditEvent()
    {
        var (db, orderUow) = await CreateSeededOrderAsync();
        var currentUser = new FakeCurrentUserService { Username = "manager" };
        var cache = CreateTestCacheService();
        var eventBus = new InMemoryEventBus();

        var orderService = new OrderService(orderUow, currentUser, cache, eventBus);

        // 1. Pastikan 4 data order hasil seeder masuk ke cache
        var initialList = await orderService.GetAllOrdersAsync();
        Assert.Equal(4, initialList.Data!.Count);

        // 2. Buat pesanan baru (Quantity 3 x 2.000.000 = 6.000.000)
        var createResult = await orderService.CreateOrderAsync(new CreateOrUpdateOrderRequest(
            OrderNumber: "ord-2026-999",
            CustomerName: "PT Garuda Digital Nusantara",
            CustomerEmail: "finance@garudadigital.id",
            ProductSku: "PRD-CLOUD-001",
            ProductName: "Enterprise Cloud Server Instance",
            Quantity: 3,
            UnitPrice: 2000000m,
            Status: "Completed",
            Notes: "Unit test Order Microservice Example 2"));

        Assert.True(createResult.Succeeded);
        Assert.Equal(201, createResult.StatusCode);
        Assert.Equal("ORD-2026-999", createResult.Data!.OrderNumber);
        Assert.Equal(6000000m, createResult.Data.TotalAmount);

        // 3. Pastikan cache ter-invalidate sehingga total order sekarang 5
        var afterCreateList = await orderService.GetAllOrdersAsync();
        Assert.Equal(5, afterCreateList.Data!.Count);

        // 4. Pastikan event CREATE_ORDER dikirim oleh Order.Api ke IEventBus
        Assert.Single(eventBus.PublishedEvents);
        Assert.Equal("CREATE_ORDER", eventBus.PublishedEvents[0].Action);
        Assert.Equal("Order.Api", eventBus.PublishedEvents[0].SourceService);

        // 5. Pastikan Soft-Delete berfungsi di OrderDbContext
        await orderService.DeleteOrderAsync(createResult.Data.Id);
        var deletedEntity = await db.Orders.IgnoreQueryFilters().FirstOrDefaultAsync(o => o.Id == createResult.Data.Id);
        Assert.NotNull(deletedEntity);
        Assert.True(deletedEntity!.IsDeleted);
    }

    [Fact]
    public async Task CrossService_AuditEvent_And_DashboardAggregation_ShouldCombineIdentityAndCatalogMetrics()
    {
        var (_, identityUow, _, _) = await CreateSeededIdentityAsync();
        var (_, catalogUow) = await CreateSeededCatalogAsync();
        var currentUser = new FakeCurrentUserService();
        var cache = CreateTestCacheService();
        var eventBus = new InMemoryEventBus();

        var productService = new ProductService(catalogUow, currentUser, cache, eventBus);
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

        var dashboardService = new DashboardService(
            identityUow,
            new FakeCatalogStatsClient(catalogStatsResult.Data),
            cache);

        await dashboardService.RecordIntegrationAuditLogAsync(eventBus.PublishedEvents.Single());

        var summaryResult = await dashboardService.GetSummaryAsync();
        Assert.True(summaryResult.Succeeded);
        Assert.Equal(5, summaryResult.Data!.TotalUsers);
        Assert.Equal(7, summaryResult.Data.TotalProducts);
        Assert.Contains(summaryResult.Data.RecentActivities, a => a.Action == "CREATE_PRODUCT");
    }
}
