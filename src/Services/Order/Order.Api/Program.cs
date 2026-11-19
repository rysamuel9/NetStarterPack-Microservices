using BuildingBlocks.Infrastructure;
using BuildingBlocks.Security;
using Microsoft.EntityFrameworkCore;
using Order.Api.Application.Interfaces;
using Order.Api.Application.Services;
using Order.Api.Domain.Interfaces;
using Order.Api.Infrastructure.Persistence;

var builder = WebApplication.CreateBuilder(args);

// 1. Register Shared BuildingBlocks (Zero-Trust JWT Auth, [HasPermission], L1/L2 Cache, EventBus)
builder.Services.AddSharedJwtSecurity(builder.Configuration);
builder.Services.AddSharedInfrastructure(builder.Configuration);

// 2. Configure Isolated Order Database (Default Aktif: NetStarterPack_OrderDb)
var provider = builder.Configuration.GetValue<string>("DatabaseProvider") ?? "SqlServer";
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? "Data Source=LAPTOP-G513H4H7\\SQLEXPRESS02;Initial Catalog=NetStarterPack_OrderDb;Integrated Security=True;Persist Security Info=False;Pooling=True;Min Pool Size=5;Max Pool Size=100;MultipleActiveResultSets=True;Encrypt=True;TrustServerCertificate=True;Application Name=\"NetStarterPack.Order\";Command Timeout=30";

// =====================================================================================
// [TEMPLATE OPSI 1 DATABASE BERSAMA (SINGLE SHARED DB)]
// Jika ingin semua microservice memakai 1 database SQL Server yang sama (NetStarterPack_SharedDb),
// cukup uncomment baris di bawah ini:
// =====================================================================================
// connectionString = "Data Source=LAPTOP-G513H4H7\\SQLEXPRESS02;Initial Catalog=NetStarterPack_SharedDb;Integrated Security=True;Persist Security Info=False;Pooling=True;Min Pool Size=5;Max Pool Size=100;MultipleActiveResultSets=True;Encrypt=True;TrustServerCertificate=True;Application Name=\"NetStarterPack.SharedDb\";Command Timeout=30";

builder.Services.AddDbContext<OrderDbContext>(options =>
{
    if (provider.Equals("Sqlite", StringComparison.OrdinalIgnoreCase))
    {
        options.UseSqlite(builder.Configuration.GetConnectionString("SqliteConnection") ?? "Data Source=NetStarterPack_Order.db");
    }
    else if (provider.Equals("InMemory", StringComparison.OrdinalIgnoreCase))
    {
        options.UseInMemoryDatabase("NetStarterPack_OrderInMemoryDb");
    }
    else
    {
        options.UseSqlServer(connectionString, sqlOptions =>
        {
            sqlOptions.EnableRetryOnFailure(maxRetryCount: 3, maxRetryDelay: TimeSpan.FromSeconds(5), errorNumbersToAdd: null);
        });
    }
});

// 3. Register Order Onion Services
builder.Services.AddScoped<IOrderUnitOfWork, OrderUnitOfWork>();
builder.Services.AddScoped<IOrderService, OrderService>();
builder.Services.AddScoped<OrderDatabaseSeeder>();

var app = builder.Build();

// 4. Auto-Migrate, Seed Order Data, & Pre-Warm Cache
using (var scope = app.Services.CreateScope())
{
    var seeder = scope.ServiceProvider.GetRequiredService<OrderDatabaseSeeder>();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    try
    {
        await seeder.SeedAsync();
        var orderService = scope.ServiceProvider.GetRequiredService<IOrderService>();
        await orderService.GetAllOrdersAsync();
        await orderService.GetOrderStatsAsync();
        logger.LogInformation("[Order.Api] Database & cache pre-warmed successfully.");
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "[Order.Api] Gagal menginisialisasi database.");
    }
}

app.UseSharedMicroservicePipeline(
    serviceTitle: "Order & Transaction Microservice API",
    serviceName: "Order.Api");

app.Run();
