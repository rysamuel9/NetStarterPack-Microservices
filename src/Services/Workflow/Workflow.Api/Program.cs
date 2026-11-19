using BuildingBlocks.Infrastructure;
using BuildingBlocks.Security;
using Microsoft.EntityFrameworkCore;
using Workflow.Api.Application.Interfaces;
using Workflow.Api.Application.Services;
using Workflow.Api.Domain.Interfaces;
using Workflow.Api.Infrastructure.Persistence;

var builder = WebApplication.CreateBuilder(args);

// 1. Register Shared BuildingBlocks (Zero-Trust JWT Auth, [HasPermission], L1/L2 Cache, EventBus)
builder.Services.AddSharedJwtSecurity(builder.Configuration);
builder.Services.AddSharedInfrastructure(builder.Configuration);

// 2. Configure Isolated Workflow Database (Default Aktif: NetStarterPack_WorkflowDb)
var provider = builder.Configuration.GetValue<string>("DatabaseProvider") ?? "SqlServer";
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? "Data Source=LAPTOP-G513H4H7\\SQLEXPRESS02;Initial Catalog=NetStarterPack_WorkflowDb;Integrated Security=True;Persist Security Info=False;Pooling=True;Min Pool Size=5;Max Pool Size=100;MultipleActiveResultSets=True;Encrypt=True;TrustServerCertificate=True;Application Name=\"NetStarterPack.Workflow\";Command Timeout=30";

// =====================================================================================
// [TEMPLATE OPSI 1 DATABASE BERSAMA (SINGLE SHARED DB)]
// Jika ingin semua microservice memakai 1 database SQL Server yang sama (NetStarterPack_SharedDb),
// cukup uncomment baris di bawah ini:
// =====================================================================================
// connectionString = "Data Source=LAPTOP-G513H4H7\\SQLEXPRESS02;Initial Catalog=NetStarterPack_SharedDb;Integrated Security=True;Persist Security Info=False;Pooling=True;Min Pool Size=5;Max Pool Size=100;MultipleActiveResultSets=True;Encrypt=True;TrustServerCertificate=True;Application Name=\"NetStarterPack.SharedDb\";Command Timeout=30";

builder.Services.AddDbContext<WorkflowDbContext>(options =>
{
    if (provider.Equals("Sqlite", StringComparison.OrdinalIgnoreCase))
    {
        options.UseSqlite(builder.Configuration.GetConnectionString("SqliteConnection") ?? "Data Source=NetStarterPack_Workflow.db");
    }
    else if (provider.Equals("InMemory", StringComparison.OrdinalIgnoreCase))
    {
        options.UseInMemoryDatabase("NetStarterPack_WorkflowInMemoryDb");
    }
    else
    {
        options.UseSqlServer(connectionString, sqlOptions =>
        {
            sqlOptions.EnableRetryOnFailure(maxRetryCount: 3, maxRetryDelay: TimeSpan.FromSeconds(5), errorNumbersToAdd: null);
        });
    }
});

// 3. Register Workflow Onion Services
builder.Services.AddScoped<IWorkflowUnitOfWork, WorkflowUnitOfWork>();
builder.Services.AddScoped<IWorkflowService, WorkflowService>();
builder.Services.AddScoped<WorkflowDatabaseSeeder>();

var app = builder.Build();

// 4. Auto-Migrate, Seed Dynamic Templates & Sample Requests, Pre-Warm Cache
using (var scope = app.Services.CreateScope())
{
    var seeder = scope.ServiceProvider.GetRequiredService<WorkflowDatabaseSeeder>();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    try
    {
        await seeder.SeedAsync();
        var workflowService = scope.ServiceProvider.GetRequiredService<IWorkflowService>();
        await workflowService.GetFormTemplatesAsync(activeOnly: true);
        await workflowService.GetWorkflowStatsAsync();
        logger.LogInformation("[Workflow.Api] Database, dynamic templates, & cache pre-warmed successfully.");
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "[Workflow.Api] Gagal menginisialisasi database.");
    }
}

app.UseSharedMicroservicePipeline(
    serviceTitle: "Dynamic Form & Multi-Level Approval Workflow Microservice API",
    serviceName: "Workflow.Api");

app.Run();
