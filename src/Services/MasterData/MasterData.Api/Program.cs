using BuildingBlocks.Infrastructure;
using BuildingBlocks.Security;
using MasterData.Api.Application.Interfaces;
using MasterData.Api.Application.Services;
using MasterData.Api.Domain.Interfaces;
using MasterData.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// 1. Register Shared BuildingBlocks (Zero-Trust JWT Auth, [HasPermission], L1/L2 Cache, Idempotency, EventBus)
builder.Services.AddSharedJwtSecurity(builder.Configuration);
builder.Services.AddSharedInfrastructure(builder.Configuration);

// 2. Configure Isolated MasterData Database (Default Aktif: NetStarterPack_MasterDataDb)
var provider = builder.Configuration.GetValue<string>("DatabaseProvider") ?? "SqlServer";
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? "Data Source=LAPTOP-G513H4H7\\SQLEXPRESS02;Initial Catalog=NetStarterPack_MasterDataDb;Integrated Security=True;Persist Security Info=False;Pooling=True;Min Pool Size=5;Max Pool Size=100;MultipleActiveResultSets=True;Encrypt=True;TrustServerCertificate=True;Application Name=\"NetStarterPack.MasterData\";Command Timeout=30";

// =====================================================================================
// [TEMPLATE OPSI 1 DATABASE BERSAMA (SINGLE SHARED DB)]
// Jika ingin semua microservice memakai 1 database SQL Server yang sama (NetStarterPack_SharedDb),
// cukup uncomment baris di bawah ini:
// =====================================================================================
// connectionString = "Data Source=LAPTOP-G513H4H7\\SQLEXPRESS02;Initial Catalog=NetStarterPack_SharedDb;Integrated Security=True;Persist Security Info=False;Pooling=True;Min Pool Size=5;Max Pool Size=100;MultipleActiveResultSets=True;Encrypt=True;TrustServerCertificate=True;Application Name=\"NetStarterPack.SharedDb\";Command Timeout=30";

builder.Services.AddDbContext<MasterDataDbContext>(options =>
{
    if (provider.Equals("Sqlite", StringComparison.OrdinalIgnoreCase))
    {
        options.UseSqlite(builder.Configuration.GetConnectionString("SqliteConnection") ?? "Data Source=NetStarterPack_MasterData.db");
    }
    else if (provider.Equals("InMemory", StringComparison.OrdinalIgnoreCase))
    {
        options.UseInMemoryDatabase("NetStarterPack_MasterDataInMemoryDb");
    }
    else
    {
        options.UseSqlServer(connectionString, sqlOptions =>
        {
            sqlOptions.EnableRetryOnFailure(maxRetryCount: 3, maxRetryDelay: TimeSpan.FromSeconds(5), errorNumbersToAdd: null);
        });
    }
});

// 3. Register MasterData Onion Services
builder.Services.AddScoped<IMasterDataUnitOfWork, MasterDataUnitOfWork>();
builder.Services.AddScoped<ILookupService, LookupService>();
builder.Services.AddScoped<MasterDataDatabaseSeeder>();

var app = builder.Build();

// 4. Auto-Migrate, Seed Unified Lookups, & Pre-Warm Hybrid Cache L1/L2
using (var scope = app.Services.CreateScope())
{
    var seeder = scope.ServiceProvider.GetRequiredService<MasterDataDatabaseSeeder>();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    try
    {
        await seeder.SeedAsync();
        var lookupService = scope.ServiceProvider.GetRequiredService<ILookupService>();
        await lookupService.GetGroupsAsync();
        await lookupService.GetLookupsAsync("PRODUCT_CATEGORY", activeOnly: true);
        await lookupService.GetStatsAsync();
        logger.LogInformation("[MasterData.Api] Database & unified lookup cache pre-warmed successfully.");
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "[MasterData.Api] Gagal menginisialisasi database.");
    }
}

app.UseSharedMicroservicePipeline(
    serviceTitle: "Master Data & Unified Lookup Microservice API",
    serviceName: "MasterData.Api");

app.Run();
