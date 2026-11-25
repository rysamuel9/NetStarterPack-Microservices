using BuildingBlocks.Core.Interfaces;
using BuildingBlocks.Infrastructure.Persistence;
using MasterData.Api.Domain.Entities;
using MasterData.Api.Domain.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace MasterData.Api.Infrastructure.Persistence;

/// <summary>
/// DbContext terisolasi khusus untuk MasterData Microservice (Database-per-Service: NetStarterPack_MasterDataDb).
/// </summary>
public class MasterDataDbContext(DbContextOptions<MasterDataDbContext> options) : DbContext(options)
{
    public DbSet<MasterLookup> MasterLookups => Set<MasterLookup>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // [TEMPLATE OPSI 1 DATABASE BERSAMA - SCHEMA ISOLATION]
        // Jika memakai 1 Database bersama (NetStarterPack_SharedDb), uncomment baris di bawah ini:
        // modelBuilder.HasDefaultSchema("masterdata");

        modelBuilder.Entity<MasterLookup>(entity =>
        {
            entity.ToTable("MasterLookups");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.GroupCode).HasMaxLength(64).IsRequired();
            entity.Property(x => x.Code).HasMaxLength(64).IsRequired();
            entity.Property(x => x.Name).HasMaxLength(150).IsRequired();
            entity.Property(x => x.Description).HasMaxLength(500);
            entity.Property(x => x.MetadataJson).HasMaxLength(2000);

            entity.HasOne(x => x.Parent)
                  .WithMany()
                  .HasForeignKey(x => x.ParentId)
                  .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(x => new { x.GroupCode, x.Code })
                  .IsUnique()
                  .HasFilter("IsDeleted = 0");

            entity.HasIndex(x => new { x.GroupCode, x.IsActive, x.SortOrder });
            entity.HasQueryFilter(x => !x.IsDeleted);
        });
    }
}

public class MasterDataUnitOfWork(MasterDataDbContext dbContext) : IMasterDataUnitOfWork
{
    private IRepository<MasterLookup>? _lookups;

    public IRepository<MasterLookup> Lookups =>
        _lookups ??= new GenericRepository<MasterLookup, MasterDataDbContext>(dbContext);

    public Task<int> SaveChangesAsync(CancellationToken cancellationToken = default) =>
        dbContext.SaveChangesAsync(cancellationToken);
}

public class MasterDataDatabaseSeeder(
    MasterDataDbContext dbContext,
    ILogger<MasterDataDatabaseSeeder> logger)
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
            }
        }
        else
        {
            await dbContext.Database.EnsureCreatedAsync(cancellationToken);
        }

        if (await dbContext.MasterLookups.AnyAsync(cancellationToken))
        {
            return;
        }

        logger.LogInformation("Seeding initial Unified MasterLookups into NetStarterPack_MasterDataDb...");

        var docInternal = new MasterLookup
        {
            GroupCode = "DOCUMENT_TYPE",
            Code = "INTERNAL",
            Name = "Dokumen Internal",
            Description = "Kelompok dokumen operasional internal perusahaan",
            SortOrder = 1,
            IsActive = true,
            IsSystem = true,
            MetadataJson = "{\"color\":\"teal\"}",
            CreatedBy = "SystemSeeder"
        };

        var docExternal = new MasterLookup
        {
            GroupCode = "DOCUMENT_TYPE",
            Code = "EXTERNAL",
            Name = "Dokumen Eksternal",
            Description = "Kelompok dokumen yang melibatkan vendor, klien, atau pihak ketiga",
            SortOrder = 2,
            IsActive = true,
            IsSystem = true,
            MetadataJson = "{\"color\":\"indigo\"}",
            CreatedBy = "SystemSeeder"
        };

        var lookups = new List<MasterLookup>
        {
            // 1. PRODUCT_CATEGORY (dipakai langsung oleh Catalog / ProductsPage & Mobile)
            new() { GroupCode = "PRODUCT_CATEGORY", Code = "CLOUD_INFRA", Name = "Cloud & Infrastructure", Description = "Layanan server cloud, backup vault, dan infrastruktur komputasi", SortOrder = 1, IsActive = true, IsSystem = true, MetadataJson = "{\"color\":\"teal\"}", CreatedBy = "SystemSeeder" },
            new() { GroupCode = "PRODUCT_CATEGORY", Code = "SOFTWARE_LICENSE", Name = "Software License", Description = "Lisensi perangkat lunak enterprise dan security suite", SortOrder = 2, IsActive = true, IsSystem = true, MetadataJson = "{\"color\":\"indigo\"}", CreatedBy = "SystemSeeder" },
            new() { GroupCode = "PRODUCT_CATEGORY", Code = "HARDWARE", Name = "Hardware", Description = "Perangkat keras jaringan, server fisik, dan terminal akses", SortOrder = 3, IsActive = true, IsSystem = true, MetadataJson = "{\"color\":\"amber\"}", CreatedBy = "SystemSeeder" },
            new() { GroupCode = "PRODUCT_CATEGORY", Code = "SERVICES", Name = "Services", Description = "Jasa implementasi, konsultasi arsitektur, dan training tim", SortOrder = 4, IsActive = true, IsSystem = true, MetadataJson = "{\"color\":\"sky\"}", CreatedBy = "SystemSeeder" },
            new() { GroupCode = "PRODUCT_CATEGORY", Code = "SECURITY_NETWORK", Name = "Security & Network", Description = "Firewall, VPN gateway, dan perangkat proteksi jaringan", SortOrder = 5, IsActive = true, IsSystem = false, MetadataJson = "{\"color\":\"rose\"}", CreatedBy = "SystemSeeder" },
            new() { GroupCode = "PRODUCT_CATEGORY", Code = "DATA_ANALYTICS", Name = "Data & Analytics", Description = "Platform analitik data, BI dashboard, dan data warehouse", SortOrder = 6, IsActive = true, IsSystem = false, MetadataJson = "{\"color\":\"violet\"}", CreatedBy = "SystemSeeder" },
            new() { GroupCode = "PRODUCT_CATEGORY", Code = "DEVELOPER_TOOLS", Name = "Developer Tools", Description = "Tool CI/CD, observability, dan lisensi IDE tim engineering", SortOrder = 7, IsActive = true, IsSystem = false, MetadataJson = "{\"color\":\"emerald\"}", CreatedBy = "SystemSeeder" },

            // 2. UNIT_OF_MEASURE
            new() { GroupCode = "UNIT_OF_MEASURE", Code = "PCS", Name = "Pieces (Pcs)", Description = "Satuan barang per buah", SortOrder = 1, IsActive = true, IsSystem = true, CreatedBy = "SystemSeeder" },
            new() { GroupCode = "UNIT_OF_MEASURE", Code = "UNIT", Name = "Unit", Description = "Satuan perangkat atau mesin", SortOrder = 2, IsActive = true, IsSystem = true, CreatedBy = "SystemSeeder" },
            new() { GroupCode = "UNIT_OF_MEASURE", Code = "LICENSE", Name = "License / Seat", Description = "Satuan lisensi pengguna atau server", SortOrder = 3, IsActive = true, IsSystem = true, CreatedBy = "SystemSeeder" },
            new() { GroupCode = "UNIT_OF_MEASURE", Code = "PACKAGE", Name = "Paket", Description = "Satuan layanan atau bundling paket", SortOrder = 4, IsActive = true, IsSystem = false, CreatedBy = "SystemSeeder" },
            new() { GroupCode = "UNIT_OF_MEASURE", Code = "MONTH", Name = "Bulan (Subscription)", Description = "Satuan langganan bulanan", SortOrder = 5, IsActive = true, IsSystem = false, CreatedBy = "SystemSeeder" },

            // 3. PAYMENT_METHOD
            new() { GroupCode = "PAYMENT_METHOD", Code = "BANK_TRANSFER", Name = "Transfer Bank", Description = "Pembayaran transfer rekening perusahaan", SortOrder = 1, IsActive = true, IsSystem = true, CreatedBy = "SystemSeeder" },
            new() { GroupCode = "PAYMENT_METHOD", Code = "VIRTUAL_ACCOUNT", Name = "Virtual Account", Description = "Pembayaran otomatis via Virtual Account", SortOrder = 2, IsActive = true, IsSystem = false, CreatedBy = "SystemSeeder" },
            new() { GroupCode = "PAYMENT_METHOD", Code = "CORPORATE_CARD", Name = "Kartu Kredit Perusahaan", Description = "Pembayaran via kartu kredit korporat", SortOrder = 3, IsActive = true, IsSystem = false, CreatedBy = "SystemSeeder" },
            new() { GroupCode = "PAYMENT_METHOD", Code = "INVOICE_NET30", Name = "Invoice (NET 30)", Description = "Pembayaran tempo 30 hari setelah invoice terbit", SortOrder = 4, IsActive = true, IsSystem = false, CreatedBy = "SystemSeeder" },

            // 4. PRIORITY_LEVEL
            new() { GroupCode = "PRIORITY_LEVEL", Code = "LOW", Name = "Low", Description = "Prioritas rendah", SortOrder = 1, IsActive = true, IsSystem = true, MetadataJson = "{\"color\":\"slate\"}", CreatedBy = "SystemSeeder" },
            new() { GroupCode = "PRIORITY_LEVEL", Code = "NORMAL", Name = "Normal", Description = "Prioritas standar operasional", SortOrder = 2, IsActive = true, IsSystem = true, MetadataJson = "{\"color\":\"sky\"}", CreatedBy = "SystemSeeder" },
            new() { GroupCode = "PRIORITY_LEVEL", Code = "HIGH", Name = "High", Description = "Prioritas tinggi", SortOrder = 3, IsActive = true, IsSystem = true, MetadataJson = "{\"color\":\"amber\"}", CreatedBy = "SystemSeeder" },
            new() { GroupCode = "PRIORITY_LEVEL", Code = "URGENT", Name = "Urgent", Description = "Butuh penanganan segera", SortOrder = 4, IsActive = true, IsSystem = true, MetadataJson = "{\"color\":\"rose\"}", CreatedBy = "SystemSeeder" },

            // 5. DOCUMENT_TYPE (contoh hierarki Parent -> Child)
            docInternal,
            docExternal,
            new() { GroupCode = "DOCUMENT_TYPE", Code = "MEMO", Name = "Memo Internal", Description = "Surat edaran atau memo antar-divisi", ParentId = docInternal.Id, SortOrder = 3, IsActive = true, IsSystem = false, CreatedBy = "SystemSeeder" },
            new() { GroupCode = "DOCUMENT_TYPE", Code = "SOP", Name = "Standard Operating Procedure (SOP)", Description = "Dokumen prosedur standar kerja", ParentId = docInternal.Id, SortOrder = 4, IsActive = true, IsSystem = false, CreatedBy = "SystemSeeder" },
            new() { GroupCode = "DOCUMENT_TYPE", Code = "PURCHASE_ORDER", Name = "Purchase Order (PO)", Description = "Dokumen pemesanan resmi ke vendor", ParentId = docExternal.Id, SortOrder = 5, IsActive = true, IsSystem = false, CreatedBy = "SystemSeeder" },
            new() { GroupCode = "DOCUMENT_TYPE", Code = "CONTRACT", Name = "Perjanjian / Kontrak", Description = "Dokumen legal kontrak kerja sama", ParentId = docExternal.Id, SortOrder = 6, IsActive = true, IsSystem = false, CreatedBy = "SystemSeeder" }
        };

        await dbContext.MasterLookups.AddRangeAsync(lookups, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        logger.LogInformation("MasterData database seeded with {Count} unified lookup items.", lookups.Count);
    }
}
