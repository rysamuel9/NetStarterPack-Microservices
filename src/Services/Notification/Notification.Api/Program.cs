using BuildingBlocks.Infrastructure;
using BuildingBlocks.Infrastructure.Resilience;
using BuildingBlocks.Security;
using Microsoft.EntityFrameworkCore;
using Notification.Api.Application.Interfaces;
using Notification.Api.Application.Services;
using Notification.Api.Domain.Interfaces;
using Notification.Api.Infrastructure.Clients;
using Notification.Api.Infrastructure.Persistence;
using Notification.Api.Infrastructure.Realtime;
using Notification.Api.Infrastructure.Senders;
using Notification.Api.Infrastructure.Templating;
using Notification.Api.Infrastructure.Workers;

var builder = WebApplication.CreateBuilder(args);

// 1. Register Shared BuildingBlocks (Zero-Trust JWT Auth, [HasPermission], L1/L2 Cache, EventBus)
builder.Services.AddSharedJwtSecurity(builder.Configuration);
builder.Services.AddSharedInfrastructure(builder.Configuration);

// 2. Configure Email (Office 365 / Gmail) & Mobile Push (Expo Push) Settings
builder.Services.Configure<EmailSettings>(builder.Configuration.GetSection(EmailSettings.SectionName));
builder.Services.Configure<PushSettings>(builder.Configuration.GetSection(PushSettings.SectionName));

// 3. Configure Isolated Notification Database (Default Aktif: NetStarterPack_NotificationDb)
var provider = builder.Configuration.GetValue<string>("DatabaseProvider") ?? "SqlServer";
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? "Data Source=LAPTOP-G513H4H7\\SQLEXPRESS02;Initial Catalog=NetStarterPack_NotificationDb;Integrated Security=True;Persist Security Info=False;Pooling=True;Min Pool Size=5;Max Pool Size=100;MultipleActiveResultSets=True;Encrypt=True;TrustServerCertificate=True;Application Name=\"NetStarterPack.Notification\";Command Timeout=30";

builder.Services.AddDbContext<NotificationDbContext>(options =>
{
    if (provider.Equals("Sqlite", StringComparison.OrdinalIgnoreCase))
    {
        options.UseSqlite(builder.Configuration.GetConnectionString("SqliteConnection") ?? "Data Source=NetStarterPack_Notification.db");
    }
    else if (provider.Equals("InMemory", StringComparison.OrdinalIgnoreCase))
    {
        options.UseInMemoryDatabase("NetStarterPack_NotificationInMemoryDb");
    }
    else
    {
        options.UseSqlServer(connectionString, sqlOptions =>
        {
            sqlOptions.EnableRetryOnFailure(maxRetryCount: 3, maxRetryDelay: TimeSpan.FromSeconds(5), errorNumbersToAdd: null);
        });
    }
});

// 4. Register Notification Onion Services, Scriban Renderer, MailKit SMTP, Expo Push, SignalR, & Dispatcher Worker
builder.Services.AddSignalR();
builder.Services.AddScoped<INotificationUnitOfWork, NotificationUnitOfWork>();
builder.Services.AddSingleton<IEmailTemplateRenderer, ScribanEmailTemplateRenderer>();
builder.Services.AddSingleton<IEmailSender, MailKitEmailSender>();
builder.Services.AddHttpClient<IPushNotificationSender, ExpoPushNotificationSender>()
    .AddStandardMicroserviceResilience(builder.Configuration);
builder.Services.AddHttpClient<IIdentityRecipientClient, IdentityRecipientHttpClient>()
    .AddStandardMicroserviceResilience(builder.Configuration);
builder.Services.AddScoped<INotificationRealtimeNotifier, SignalRNotificationRealtimeNotifier>();
builder.Services.AddScoped<INotificationService, NotificationService>();
builder.Services.AddScoped<NotificationDatabaseSeeder>();
builder.Services.AddHostedService<NotificationDispatcherWorker>();

var app = builder.Build();

// 5. Auto-Migrate & Seed Default HTML Email Templates
using (var scope = app.Services.CreateScope())
{
    var seeder = scope.ServiceProvider.GetRequiredService<NotificationDatabaseSeeder>();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    try
    {
        await seeder.SeedAsync();
        logger.LogInformation("[Notification.Api] Database & default Scriban HTML templates initialized successfully.");
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "[Notification.Api] Gagal menginisialisasi database.");
    }
}

app.UseSharedMicroservicePipeline(
    serviceTitle: "Unified Notification Microservice API (In-App SignalR, Email Office 365/Gmail, & Expo Push)",
    serviceName: "Notification.Api");

app.MapHub<NotificationHub>("/hubs/notifications");

app.Run();
