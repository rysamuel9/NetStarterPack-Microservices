using BuildingBlocks.Core.Interfaces;
using BuildingBlocks.Infrastructure.Persistence;
using Catalog.Api.Domain.Entities;
using Catalog.Api.Domain.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace Catalog.Api.Infrastructure.Persistence;

/// <summary>
/// DbContext terisolasi khusus untuk Catalog Microservice (Database-per-Service: NetStarterPack_CatalogDb).
/// Sama sekali tidak bergantung pada tabel Users atau Roles milik Identity Service.
/// </summary>
public class CatalogDbContext(DbContextOptions<CatalogDbContext> options) : DbContext(options)
{
    public DbSet<Product> Products => Set<Product>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // [TEMPLATE OPSI 1 DATABASE BERSAMA - SCHEMA ISOLATION]
        // Jika memakai 1 Database bersama (NetStarterPack_SharedDb) dan ingin tabel Catalog
        // dikelompokkan ke dalam schema SQL Server "catalog" (misal: catalog.Products),
        // cukup uncomment baris di bawah ini:
        // modelBuilder.HasDefaultSchema("catalog");

        modelBuilder.Entity<Product>(entity =>
        {
            entity.ToTable("Products");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Sku).HasMaxLength(50).IsRequired();
            entity.Property(x => x.Name).HasMaxLength(200).IsRequired();
            entity.Property(x => x.Category).HasMaxLength(100).IsRequired();
            entity.Property(x => x.Description).HasMaxLength(1000);
            entity.Property(x => x.Price).HasPrecision(18, 2);
            entity.HasIndex(x => x.Sku).IsUnique();
            entity.HasQueryFilter(x => !x.IsDeleted);
        });
    }
}

public class CatalogUnitOfWork(CatalogDbContext dbContext) : ICatalogUnitOfWork
{
    private IRepository<Product>? _products;

    public IRepository<Product> Products =>
        _products ??= new GenericRepository<Product, CatalogDbContext>(dbContext);

    public Task<int> SaveChangesAsync(CancellationToken cancellationToken = default) =>
        dbContext.SaveChangesAsync(cancellationToken);
}

public class CatalogDatabaseSeeder(
    CatalogDbContext dbContext,
    ILogger<CatalogDatabaseSeeder> logger)
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
                // Catatan EF Core: Jika memakai 1 database bersama (NetStarterPack_SharedDb) tanpa Migration,
                // EnsureCreatedAsync() pada microservice kedua tidak akan membuat tabel baru jika tabel Identity sudah ada.
                // Uncomment blok try-catch di bawah ini agar tabel Products tetap otomatis dibuat di dalam 1 DB yang sama:
                // try
                // {
                //     var creator = dbContext.Database.GetService<Microsoft.EntityFrameworkCore.Storage.IRelationalDatabaseCreator>();
                //     await creator.CreateTablesAsync(cancellationToken);
                // }
                // catch { /* Abaikan jika tabel Products sudah ada */ }
            }
        }
        else
        {
            await dbContext.Database.EnsureCreatedAsync(cancellationToken);

                // [TEMPLATE OPSI 1 DATABASE BERSAMA (SINGLE SHARED DB)]
                // Catatan EF Core: Jika memakai 1 database bersama (NetStarterPack_SharedDb) tanpa Migration,
                // EnsureCreatedAsync() pada microservice kedua tidak akan membuat tabel baru jika tabel Identity sudah ada.
                // Uncomment blok try-catch di bawah ini agar tabel Products tetap otomatis dibuat di dalam 1 DB yang sama:
                // try
                // {
                //     var creator = dbContext.Database.GetService<Microsoft.EntityFrameworkCore.Storage.IRelationalDatabaseCreator>();
                //     await creator.CreateTablesAsync(cancellationToken);
                // }
                // catch { /* Abaikan jika tabel Products sudah ada */ }
        }

        if (await dbContext.Products.AnyAsync(cancellationToken))
        {
            return;
        }

        logger.LogInformation("Seeding initial Catalog products into NetStarterPack_CatalogDb...");

        var sampleProducts = new List<Product>
        {
            new()
            {
                Sku = "PRD-CLOUD-001",
                Name = "Enterprise Cloud Server Instance (8 vCPU / 32GB)",
                Category = "Cloud & Infrastructure",
                Description = "Dedicated cloud compute instance untuk deployment microservice skala produksi.",
                Price = 2450000m,
                Stock = 25,
                Status = ProductStatus.Active,
                CreatedBy = "superadmin"
            },
            new()
            {
                Sku = "PRD-LIC-002",
                Name = "Annual Enterprise Security Suite License",
                Category = "Software License",
                Description = "Lisensi tahunan proteksi endpoint, SIEM, dan monitoring keamanan Zero-Trust.",
                Price = 8500000m,
                Stock = 12,
                Status = ProductStatus.Active,
                CreatedBy = "admin"
            },
            new()
            {
                Sku = "PRD-HW-003",
                Name = "Managed Core Network Switch 48-Port PoE+",
                Category = "Hardware",
                Description = "Switch jaringan enterprise Layer-3 dengan manajemen VLAN otomatis.",
                Price = 14200000m,
                Stock = 8,
                Status = ProductStatus.Active,
                CreatedBy = "staff"
            },
            new()
            {
                Sku = "PRD-SRV-004",
                Name = "Paket Implementasi & Training Sistem (On-Site)",
                Category = "Services",
                Description = "Layanan setup arsitektur microservice, migrasi data, dan pelatihan tim selama 5 hari.",
                Price = 15000000m,
                Stock = 5,
                Status = ProductStatus.Active,
                CreatedBy = "manager"
            },
            new()
            {
                Sku = "PRD-HW-005",
                Name = "Biometric Access Control Terminal Pro",
                Category = "Hardware",
                Description = "Perangkat presensi dan kontrol akses pintu berbasis pengenalan wajah & NFC.",
                Price = 4750000m,
                Stock = 0,
                Status = ProductStatus.OutOfStock,
                CreatedBy = "staff"
            },
            new()
            {
                Sku = "PRD-CLOUD-006",
                Name = "Automated Daily Backup & Disaster Recovery Vault (2TB)",
                Category = "Cloud & Infrastructure",
                Description = "Penyimpanan cadangan database microservice terenkripsi otomatis dengan retensi 90 hari.",
                Price = 1250000m,
                Stock = 40,
                Status = ProductStatus.Active,
                CreatedBy = "superadmin"
            }
        };

        await dbContext.Products.AddRangeAsync(sampleProducts, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        logger.LogInformation("Catalog database seeded with {Count} items.", sampleProducts.Count);
    }
}

