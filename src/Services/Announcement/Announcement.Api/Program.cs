using Announcement.Api.Application.Interfaces;
using Announcement.Api.Application.Services;
using Announcement.Api.Domain.Interfaces;
using Announcement.Api.Infrastructure.Persistence;
using BuildingBlocks.Infrastructure;
using BuildingBlocks.Security;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// 1. Register Shared BuildingBlocks (Zero-Trust JWT Auth, [HasPermission], L1/L2 Cache, EventBus)
builder.Services.AddSharedJwtSecurity(builder.Configuration);
builder.Services.AddSharedInfrastructure(builder.Configuration);

// 2. Configure Isolated Announcement Database (Default Aktif: NetStarterPack_AnnouncementDb)
var provider = builder.Configuration.GetValue<string>("DatabaseProvider") ?? "SqlServer";
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? "Data Source=LAPTOP-G513H4H7\\SQLEXPRESS02;Initial Catalog=NetStarterPack_AnnouncementDb;Integrated Security=True;Persist Security Info=False;Pooling=True;Min Pool Size=5;Max Pool Size=100;MultipleActiveResultSets=True;Encrypt=True;TrustServerCertificate=True;Application Name=\"NetStarterPack.Announcement\";Command Timeout=30";

// =====================================================================================
// [TEMPLATE OPSI 1 DATABASE BERSAMA (SINGLE SHARED DB)]
// Jika ingin semua microservice memakai 1 database SQL Server yang sama (NetStarterPack_SharedDb),
// cukup uncomment baris di bawah ini:
// =====================================================================================
// connectionString = "Data Source=LAPTOP-G513H4H7\\SQLEXPRESS02;Initial Catalog=NetStarterPack_SharedDb;Integrated Security=True;Persist Security Info=False;Pooling=True;Min Pool Size=5;Max Pool Size=100;MultipleActiveResultSets=True;Encrypt=True;TrustServerCertificate=True;Application Name=\"NetStarterPack.SharedDb\";Command Timeout=30";

builder.Services.AddDbContext<AnnouncementDbContext>(options =>
{
    if (provider.Equals("Sqlite", StringComparison.OrdinalIgnoreCase))
    {
        options.UseSqlite(builder.Configuration.GetConnectionString("SqliteConnection") ?? "Data Source=NetStarterPack_Announcement.db");
    }
    else if (provider.Equals("InMemory", StringComparison.OrdinalIgnoreCase))
    {
        options.UseInMemoryDatabase("NetStarterPack_AnnouncementInMemoryDb");
    }
    else
    {
        options.UseSqlServer(connectionString, sqlOptions =>
        {
            sqlOptions.EnableRetryOnFailure(maxRetryCount: 3, maxRetryDelay: TimeSpan.FromSeconds(5), errorNumbersToAdd: null);
        });
    }
});

// 3. Register Announcement Onion Services
builder.Services.AddScoped<IAnnouncementUnitOfWork, AnnouncementUnitOfWork>();
builder.Services.AddScoped<IAnnouncementService, AnnouncementService>();
builder.Services.AddScoped<AnnouncementDatabaseSeeder>();

var app = builder.Build();

// 4. Auto-Migrate, Seed 12 Sample Announcements + Banners, & Pre-Warm Cache
using (var scope = app.Services.CreateScope())
{
    var seeder = scope.ServiceProvider.GetRequiredService<AnnouncementDatabaseSeeder>();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    try
    {
        await seeder.SeedAsync();
        var annService = scope.ServiceProvider.GetRequiredService<IAnnouncementService>();
        await annService.GetStatsAsync();
        logger.LogInformation("[Announcement.Api] Database, 12 sample announcements, & cache pre-warmed successfully.");
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "[Announcement.Api] Gagal menginisialisasi database.");
    }
}

app.UseSharedMicroservicePipeline(
    serviceTitle: "Internal Announcement & Newsroom Microservice API",
    serviceName: "Announcement.Api");

app.Run();
