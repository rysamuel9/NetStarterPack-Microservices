using BuildingBlocks.Core.Interfaces;
using BuildingBlocks.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Order.Api.Domain.Entities;
using Order.Api.Domain.Interfaces;

namespace Order.Api.Infrastructure.Persistence;

/// <summary>
/// DbContext terisolasi khusus untuk Order Microservice (Database-per-Service: NetStarterPack_OrderDb).
/// </summary>
public class OrderDbContext(DbContextOptions<OrderDbContext> options) : DbContext(options)
{
    public DbSet<Domain.Entities.Order> Orders => Set<Domain.Entities.Order>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // [TEMPLATE OPSI 1 DATABASE BERSAMA - SCHEMA ISOLATION]
        // Jika memakai 1 Database bersama (NetStarterPack_SharedDb), uncomment baris di bawah ini:
        // modelBuilder.HasDefaultSchema("orders");

        modelBuilder.Entity<Domain.Entities.Order>(entity =>
        {
            entity.ToTable("Orders");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.OrderNumber).HasMaxLength(50).IsRequired();
            entity.Property(x => x.CustomerName).HasMaxLength(150).IsRequired();
            entity.Property(x => x.CustomerEmail).HasMaxLength(150);
            entity.Property(x => x.ProductSku).HasMaxLength(50).IsRequired();
            entity.Property(x => x.ProductName).HasMaxLength(200).IsRequired();
            entity.Property(x => x.UnitPrice).HasPrecision(18, 2);
            entity.Property(x => x.TotalAmount).HasPrecision(18, 2);
            entity.Property(x => x.Notes).HasMaxLength(500);
            entity.HasIndex(x => x.OrderNumber).IsUnique();
            entity.HasQueryFilter(x => !x.IsDeleted);
        });
    }
}

public class OrderUnitOfWork(OrderDbContext dbContext) : IOrderUnitOfWork
{
    private IRepository<Domain.Entities.Order>? _orders;

    public IRepository<Domain.Entities.Order> Orders =>
        _orders ??= new GenericRepository<Domain.Entities.Order, OrderDbContext>(dbContext);

    public Task<int> SaveChangesAsync(CancellationToken cancellationToken = default) =>
        dbContext.SaveChangesAsync(cancellationToken);
}

public class OrderDatabaseSeeder(
    OrderDbContext dbContext,
    ILogger<OrderDatabaseSeeder> logger)
{
    public async Task SeedAsync(CancellationToken cancellationToken = default)
    {
        if (dbContext.Database.IsRelational())
        {
            var pending = await dbContext.Database.GetPendingMigrationsAsync(cancellationToken);
            if (pending.Any())
            {
                await dbContext.Database.MigrateAsync(cancellationToken);
            }
            else
            {
                await dbContext.Database.EnsureCreatedAsync(cancellationToken);

                // [TEMPLATE OPSI 1 DATABASE BERSAMA (SINGLE SHARED DB)]
                // Uncomment blok try-catch di bawah jika memakai 1 database bersama (NetStarterPack_SharedDb):
                // try
                // {
                //     var creator = dbContext.Database.GetService<Microsoft.EntityFrameworkCore.Storage.IRelationalDatabaseCreator>();
                //     await creator.CreateTablesAsync(cancellationToken);
                // }
                // catch { }
            }
        }
        else
        {
            await dbContext.Database.EnsureCreatedAsync(cancellationToken);
        }

        if (await dbContext.Orders.AnyAsync(cancellationToken))
        {
            return;
        }

        logger.LogInformation("Seeding initial Orders into NetStarterPack_OrderDb...");

        var sampleOrders = new List<Domain.Entities.Order>
        {
            new()
            {
                OrderNumber = "ORD-2026-001",
                CustomerName = "PT Telkom Nusantara Cloud",
                CustomerEmail = "procurement@telkomcloud.co.id",
                ProductSku = "PRD-CLOUD-001",
                ProductName = "Enterprise Cloud Server Instance (8 vCPU / 32GB)",
                Quantity = 4,
                UnitPrice = 2450000m,
                TotalAmount = 9800000m,
                Status = OrderStatus.Completed,
                Notes = "Deployment cluster microservice production region Jakarta",
                CreatedBy = "superadmin"
            },
            new()
            {
                OrderNumber = "ORD-2026-002",
                CustomerName = "Bank Mandiri Digital Lab",
                CustomerEmail = "secops@mandiridigital.co.id",
                ProductSku = "PRD-LIC-002",
                ProductName = "Annual Enterprise Security Suite License",
                Quantity = 2,
                UnitPrice = 8500000m,
                TotalAmount = 17000000m,
                Status = OrderStatus.Processing,
                Notes = "Menunggu aktivasi lisensi Zero-Trust API Gateway",
                CreatedBy = "admin"
            },
            new()
            {
                OrderNumber = "ORD-2026-003",
                CustomerName = "RS Mitra Sehat Sentosa",
                CustomerEmail = "it.infra@mitrasehat.id",
                ProductSku = "PRD-SRV-004",
                ProductName = "Paket Implementasi & Training Sistem (On-Site)",
                Quantity = 1,
                UnitPrice = 15000000m,
                TotalAmount = 15000000m,
                Status = OrderStatus.Pending,
                Notes = "Jadwal training tim IT minggu depan",
                CreatedBy = "staff"
            },
            new()
            {
                OrderNumber = "ORD-2026-004",
                CustomerName = "PT Logistik Cepat Express",
                CustomerEmail = "ops@logistikcepat.com",
                ProductSku = "PRD-CLOUD-006",
                ProductName = "Automated Daily Backup & Disaster Recovery Vault (2TB)",
                Quantity = 5,
                UnitPrice = 1250000m,
                TotalAmount = 6250000m,
                Status = OrderStatus.Completed,
                Notes = "Backup otomatis database microservice harian",
                CreatedBy = "manager"
            }
        };

        await dbContext.Orders.AddRangeAsync(sampleOrders, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        logger.LogInformation("Order database seeded with {Count} items.", sampleOrders.Count);
    }
}
