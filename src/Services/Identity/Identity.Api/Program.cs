using BuildingBlocks.Infrastructure;
using BuildingBlocks.Infrastructure.Resilience;
using BuildingBlocks.Security;
using Identity.Api.Application.Interfaces;
using Identity.Api.Application.Services;
using Identity.Api.Domain.Interfaces;
using Identity.Api.Infrastructure.Clients;
using Identity.Api.Infrastructure.Persistence;
using Identity.Api.Infrastructure.Security;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// 1. Register Shared BuildingBlocks (Zero-Trust JWT Auth, [HasPermission], L1/L2 Cache, EventBus)
builder.Services.AddSharedJwtSecurity(builder.Configuration);
builder.Services.AddSharedInfrastructure(builder.Configuration);

// 2. Configure Database (Default Aktif: Database Terpisah NetStarterPack_IdentityDb)
var provider = builder.Configuration.GetValue<string>("DatabaseProvider") ?? "SqlServer";
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? "Data Source=LAPTOP-G513H4H7\\SQLEXPRESS02;Initial Catalog=NetStarterPack_IdentityDb;Integrated Security=True;Persist Security Info=False;Pooling=True;Min Pool Size=5;Max Pool Size=100;MultipleActiveResultSets=True;Encrypt=True;TrustServerCertificate=True;Application Name=\"NetStarterPack.Identity\";Command Timeout=30";

// =====================================================================================
// [TEMPLATE OPSI 1 DATABASE BERSAMA (SINGLE SHARED DB)]
// Jika ingin Identity.Api & Catalog.Api memakai 1 database SQL Server yang sama,
// cukup uncomment blok di bawah ini (atau ganti di appsettings.json):
// =====================================================================================
// connectionString = "Data Source=LAPTOP-G513H4H7\\SQLEXPRESS02;Initial Catalog=NetStarterPack_SharedDb;Integrated Security=True;Persist Security Info=False;Pooling=True;Min Pool Size=5;Max Pool Size=100;MultipleActiveResultSets=True;Encrypt=True;TrustServerCertificate=True;Application Name=\"NetStarterPack.SharedDb\";Command Timeout=30";

builder.Services.AddDbContext<IdentityDbContext>(options =>
{
    if (provider.Equals("Sqlite", StringComparison.OrdinalIgnoreCase))
    {
        options.UseSqlite(builder.Configuration.GetConnectionString("SqliteConnection") ?? "Data Source=NetStarterPack_Identity.db");
    }
    else if (provider.Equals("InMemory", StringComparison.OrdinalIgnoreCase))
    {
        options.UseInMemoryDatabase("NetStarterPack_IdentityInMemoryDb");
    }
    else
    {
        options.UseSqlServer(connectionString, sqlOptions =>
        {
            sqlOptions.EnableRetryOnFailure(maxRetryCount: 3, maxRetryDelay: TimeSpan.FromSeconds(5), errorNumbersToAdd: null);
        });
    }
});

// 3. Register Identity Onion Services & Repositories
builder.Services.AddScoped<IUserRepository, UserRepository>();
builder.Services.AddScoped<IRoleRepository, RoleRepository>();
builder.Services.AddScoped<IMenuRepository, MenuRepository>();
builder.Services.AddScoped<IIdentityUnitOfWork, IdentityUnitOfWork>();

builder.Services.AddSingleton<IPasswordHasher, PasswordHasher>();
builder.Services.AddScoped<IJwtTokenService, JwtTokenService>();

builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddSingleton<IAvatarStorage, Identity.Api.Infrastructure.Storage.LocalAvatarStorage>();
builder.Services.AddScoped<IAvatarService, AvatarService>();
builder.Services.AddScoped<IRoleService, RoleService>();
builder.Services.AddScoped<IMenuService, MenuService>();
builder.Services.AddScoped<IOrganizationService, OrganizationService>();
builder.Services.AddScoped<IDashboardService, DashboardService>();
builder.Services.AddHttpClient<ICatalogStatsClient, CatalogStatsHttpClient>()
    .AddStandardMicroserviceResilience(builder.Configuration);
builder.Services.AddScoped<IdentityDatabaseSeeder>();

var app = builder.Build();

// 4. Auto-Migrate, Seed Identity Data, & Pre-Warm Cache
using (var scope = app.Services.CreateScope())
{
    var seeder = scope.ServiceProvider.GetRequiredService<IdentityDatabaseSeeder>();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    try
    {
        await seeder.SeedAsync();
        var userService = scope.ServiceProvider.GetRequiredService<IUserService>();
        var roleService = scope.ServiceProvider.GetRequiredService<IRoleService>();
        var menuService = scope.ServiceProvider.GetRequiredService<IMenuService>();
        await userService.GetAllUsersAsync();
        await roleService.GetAllRolesAsync();
        await menuService.GetAllMenusAsync();
        logger.LogInformation("[Identity.Api] Database & cache pre-warmed successfully.");
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "[Identity.Api] Gagal menginisialisasi database.");
    }
}

app.UseSharedMicroservicePipeline(
    serviceTitle: "Identity & RBAC Microservice API",
    serviceName: "Identity.Api");

app.Run();
