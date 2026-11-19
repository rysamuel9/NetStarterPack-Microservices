using Announcement.Api.Infrastructure.Persistence;
using BuildingBlocks.Security;
using Catalog.Api.Infrastructure.Persistence;
using Identity.Api.Application.Interfaces;
using Identity.Api.Infrastructure.Persistence;
using Identity.Api.Infrastructure.Security;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using NetStarterPack.Microservices.UnitTests.Common.TestDoubles;
using Order.Api.Infrastructure.Persistence;
using Workflow.Api.Infrastructure.Persistence;

namespace NetStarterPack.Microservices.UnitTests.Common.Factories;

/// <summary>
/// Factory terpusat untuk menyiapkan EF Core InMemory DbContext + UnitOfWork terisolasi
/// (Database-per-Service) lengkap dengan data seed dan auto-cleanup via IDisposable.
/// </summary>
public static class TestDbFactory
{
    public static async Task<IdentityTestContext> CreateIdentityAsync(bool useRealPasswordHasher = false)
    {
        var options = new DbContextOptionsBuilder<IdentityDbContext>()
            .UseInMemoryDatabase($"IdentityTestDb_{Guid.NewGuid()}")
            .Options;

        var db = new IdentityDbContext(options);
        IPasswordHasher hasher = useRealPasswordHasher
            ? new PasswordHasher()
            : new FakePasswordHasher();
        var jwt = new JwtTokenService(Options.Create(new JwtSettings()));

        var seeder = new IdentityDatabaseSeeder(db, hasher, NullLogger<IdentityDatabaseSeeder>.Instance);
        await seeder.SeedAsync();

        var uow = new IdentityUnitOfWork(db);
        return new IdentityTestContext(db, uow, hasher, jwt);
    }

    public static async Task<CatalogTestContext> CreateCatalogAsync()
    {
        var options = new DbContextOptionsBuilder<CatalogDbContext>()
            .UseInMemoryDatabase($"CatalogTestDb_{Guid.NewGuid()}")
            .Options;

        var db = new CatalogDbContext(options);
        var seeder = new CatalogDatabaseSeeder(db, NullLogger<CatalogDatabaseSeeder>.Instance);
        await seeder.SeedAsync();

        return new CatalogTestContext(db, new CatalogUnitOfWork(db));
    }

    public static async Task<OrderTestContext> CreateOrderAsync()
    {
        var options = new DbContextOptionsBuilder<OrderDbContext>()
            .UseInMemoryDatabase($"OrderTestDb_{Guid.NewGuid()}")
            .Options;

        var db = new OrderDbContext(options);
        var seeder = new OrderDatabaseSeeder(db, NullLogger<OrderDatabaseSeeder>.Instance);
        await seeder.SeedAsync();

        return new OrderTestContext(db, new OrderUnitOfWork(db));
    }

    public static async Task<WorkflowTestContext> CreateWorkflowAsync()
    {
        var options = new DbContextOptionsBuilder<WorkflowDbContext>()
            .UseInMemoryDatabase($"WorkflowTestDb_{Guid.NewGuid()}")
            .Options;

        var db = new WorkflowDbContext(options);
        var seeder = new WorkflowDatabaseSeeder(db, NullLogger<WorkflowDatabaseSeeder>.Instance);
        await seeder.SeedAsync();

        return new WorkflowTestContext(db, new WorkflowUnitOfWork(db));
    }

    public static async Task<AnnouncementTestContext> CreateAnnouncementAsync()
    {
        var options = new DbContextOptionsBuilder<AnnouncementDbContext>()
            .UseInMemoryDatabase($"AnnouncementTestDb_{Guid.NewGuid()}")
            .Options;

        var db = new AnnouncementDbContext(options);
        var hostEnv = new FakeHostEnvironment();
        var seeder = new AnnouncementDatabaseSeeder(db, hostEnv, NullLogger<AnnouncementDatabaseSeeder>.Instance);
        await seeder.SeedAsync();

        return new AnnouncementTestContext(db, new AnnouncementUnitOfWork(db), hostEnv);
    }
}

public sealed record IdentityTestContext(
    IdentityDbContext Db,
    IdentityUnitOfWork Uow,
    IPasswordHasher Hasher,
    JwtTokenService Jwt) : IDisposable
{
    public void Dispose() => Db.Dispose();
}

public sealed record CatalogTestContext(
    CatalogDbContext Db,
    CatalogUnitOfWork Uow) : IDisposable
{
    public void Dispose() => Db.Dispose();
}

public sealed record OrderTestContext(
    OrderDbContext Db,
    OrderUnitOfWork Uow) : IDisposable
{
    public void Dispose() => Db.Dispose();
}

public sealed record WorkflowTestContext(
    WorkflowDbContext Db,
    WorkflowUnitOfWork Uow) : IDisposable
{
    public void Dispose() => Db.Dispose();
}

public sealed record AnnouncementTestContext(
    AnnouncementDbContext Db,
    AnnouncementUnitOfWork Uow,
    FakeHostEnvironment HostEnvironment) : IDisposable
{
    public void Dispose()
    {
        Db.Dispose();
        HostEnvironment.Dispose();
    }
}
