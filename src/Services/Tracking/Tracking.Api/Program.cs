using BuildingBlocks.Infrastructure;
using BuildingBlocks.Security;
using Microsoft.EntityFrameworkCore;
using Tracking.Api.Application.Interfaces;
using Tracking.Api.Application.Services;
using Tracking.Api.Domain.Interfaces;
using Tracking.Api.Infrastructure.Persistence;
using Tracking.Api.Infrastructure.Realtime;

var builder = WebApplication.CreateBuilder(args);

// 1. Register Shared BuildingBlocks (Zero-Trust JWT Auth, [HasPermission], L1/L2 Cache, FileStorage, EventBus)
builder.Services.AddSharedJwtSecurity(builder.Configuration);
builder.Services.AddSharedInfrastructure(builder.Configuration);

// 2. Configure Isolated Tracking Database (Default Aktif: NetStarterPack_TrackingDb)
var provider = builder.Configuration.GetValue<string>("DatabaseProvider") ?? "SqlServer";
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? "Data Source=LAPTOP-G513H4H7\\SQLEXPRESS02;Initial Catalog=NetStarterPack_TrackingDb;Integrated Security=True;Persist Security Info=False;Pooling=True;Min Pool Size=5;Max Pool Size=100;MultipleActiveResultSets=True;Encrypt=True;TrustServerCertificate=True;Application Name=\"NetStarterPack.Tracking\";Command Timeout=30";

builder.Services.AddDbContext<TrackingDbContext>(options =>
{
    if (provider.Equals("Sqlite", StringComparison.OrdinalIgnoreCase))
    {
        options.UseSqlite(builder.Configuration.GetConnectionString("SqliteConnection") ?? "Data Source=NetStarterPack_Tracking.db");
    }
    else if (provider.Equals("InMemory", StringComparison.OrdinalIgnoreCase))
    {
        options.UseInMemoryDatabase("NetStarterPack_TrackingInMemoryDb");
    }
    else
    {
        options.UseSqlServer(connectionString, sqlOptions =>
        {
            sqlOptions.EnableRetryOnFailure(maxRetryCount: 3, maxRetryDelay: TimeSpan.FromSeconds(5), errorNumbersToAdd: null);
        });
    }
});

// 3. Register Tracking Onion Services & SignalR Live Telemetry Hub
builder.Services.AddSignalR();
builder.Services.AddScoped<ITrackingUnitOfWork, TrackingUnitOfWork>();
builder.Services.AddScoped<ITrackingRealtimeNotifier, SignalRTrackingRealtimeNotifier>();
builder.Services.AddScoped<ITrackingService, TrackingService>();
builder.Services.AddScoped<TrackingDatabaseSeeder>();

var app = builder.Build();

// 4. Auto-Migrate, Seed Sample Jakarta Assignments, & Pre-Warm Cache
using (var scope = app.Services.CreateScope())
{
    var seeder = scope.ServiceProvider.GetRequiredService<TrackingDatabaseSeeder>();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    try
    {
        await seeder.SeedAsync();
        var trackingService = scope.ServiceProvider.GetRequiredService<ITrackingService>();
        await trackingService.GetStatsAsync();
        logger.LogInformation("[Tracking.Api] Database, sample Jakarta dispatch assignments, & cache pre-warmed successfully.");
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "[Tracking.Api] Gagal menginisialisasi database.");
    }
}

app.UseSharedMicroservicePipeline(
    serviceTitle: "Field Dispatch & Live Location Tracking Microservice API",
    serviceName: "Tracking.Api");

app.MapHub<TrackingHub>("/hubs/tracking");

app.Run();
