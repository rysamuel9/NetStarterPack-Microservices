using System.Diagnostics;
using BuildingBlocks.Core.Interfaces;
using BuildingBlocks.Infrastructure.Caching;
using BuildingBlocks.Infrastructure.Messaging;
using BuildingBlocks.Infrastructure.Middleware;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Scalar.AspNetCore;

namespace BuildingBlocks.Infrastructure;

public static class InfrastructureExtensions
{
    /// <summary>
    /// Mendaftarkan komponen infrastruktur bersama (Hybrid L1/L2 Cache, EventBus, ExceptionHandler, CORS, OpenAPI).
    /// </summary>
    public static IServiceCollection AddSharedInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.Configure<CacheSettings>(configuration.GetSection(CacheSettings.SectionName));
        services.Configure<ServiceEndpointsSettings>(configuration.GetSection(ServiceEndpointsSettings.SectionName));

        // 1. Setup Hybrid Caching (L1 Memory + L2 Redis / InMemory)
        services.AddMemoryCache();
        var cacheSettings = configuration.GetSection(CacheSettings.SectionName).Get<CacheSettings>() ?? new CacheSettings();
        if (cacheSettings.Provider.Equals("Redis", StringComparison.OrdinalIgnoreCase))
        {
            services.AddStackExchangeRedisCache(options =>
            {
                options.Configuration = cacheSettings.RedisConnectionString;
                options.InstanceName = cacheSettings.InstanceName;
            });
        }
        else
        {
            services.AddDistributedMemoryCache();
        }
        services.AddSingleton<ICacheService, DistributedCacheService>();

        // 2. Setup HTTP EventBus untuk komunikasi lintas microservice
        services.AddHttpClient<IEventBus, HttpEventBus>();

        // 3. Setup Global Exception Handler & ProblemDetails
        services.AddExceptionHandler<GlobalExceptionHandler>();
        services.AddProblemDetails();

        // 4. Setup Controllers & OpenAPI
        services.AddControllers();
        services.AddOpenApi();

        // 5. Setup CORS
        services.AddCors(options =>
        {
            options.AddPolicy("AllowFrontend", policy =>
            {
                var allowedOrigins = configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
                    ?? ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5080", "http://localhost:3000"];

                policy.WithOrigins(allowedOrigins)
                      .AllowAnyHeader()
                      .AllowAnyMethod()
                      .AllowCredentials();
            });
        });

        return services;
    }

    /// <summary>
    /// Memasang middleware bersama serta endpoint dokumentasi OpenAPI, Scalar UI (/scalar/v1), dan Swagger UI (/swagger).
    /// Dilengkapi Parent-Process Watchdog: jika dijalankan oleh Gateway.Api (F5) dan Gateway di-stop dari Visual Studio,
    /// microservice ini otomatis ikut berhenti agar tidak pernah mengunci file DLL.
    /// </summary>
    public static WebApplication UseSharedMicroservicePipeline(
        this WebApplication app,
        string serviceTitle,
        string serviceName)
    {
        var parentPidStr = Environment.GetEnvironmentVariable("NSP_PARENT_PID");
        if (int.TryParse(parentPidStr, out var parentPid) && parentPid > 0)
        {
            _ = Task.Run(async () =>
            {
                while (true)
                {
                    await Task.Delay(1500);
                    try
                    {
                        var parent = Process.GetProcessById(parentPid);
                        if (parent.HasExited)
                        {
                            Environment.Exit(0);
                        }
                    }
                    catch
                    {
                        // Parent Gateway.Api sudah berhenti (Stop Debugging di Visual Studio)
                        Environment.Exit(0);
                    }
                }
            });
        }

        app.UseMiddleware<CorrelationIdMiddleware>();
        app.UseExceptionHandler();

        app.MapOpenApi();
        app.MapScalarApiReference(options =>
        {
            options
                .WithTitle($"{serviceTitle} — Scalar UI (.NET 10)")
                .AddPreferredSecuritySchemes("Bearer");
        });

        app.MapGet("/swagger", () => Results.Content($$"""
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>{{serviceTitle}} — Swagger UI</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui.css" />
  <style>
    body { margin: 0; background: #fafafa; }
    .topbar-custom { background: #042f2e; color: #f0fdfa; padding: 10px 24px; font-family: sans-serif; display: flex; align-items: center; justify-content: space-between; font-size: 13px; }
    .topbar-custom a { color: #2dd4bf; text-decoration: none; font-weight: 600; margin-left: 16px; }
  </style>
</head>
<body>
  <div class="topbar-custom">
    <div><strong>{{serviceTitle}} (.NET 10 Microservice)</strong> — Klik tombol hijau <b>Authorize</b> untuk memasukkan JWT Access Token</div>
    <div>
      <a href="/scalar/v1">Buka Scalar UI &rarr;</a>
      <a href="http://localhost:5080/swagger">Gateway Unified Swagger &rarr;</a>
      <a href="http://localhost:5173" target="_blank">Web React &rarr;</a>
    </div>
  </div>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui-bundle.js"></script>
  <script>
    fetch('/openapi/v1.json')
      .then(r => r.json())
      .then(spec => {
        spec.components = spec.components || {};
        spec.components.securitySchemes = {
          Bearer: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Masukkan JWT AccessToken dari hasil /api/auth/login (tanpa kata Bearer)'
          }
        };
        spec.security = [{ Bearer: [] }];
        SwaggerUIBundle({
          spec: spec,
          dom_id: '#swagger-ui',
          deepLinking: true,
          persistAuthorization: true,
          docExpansion: 'list',
          filter: true
        });
      });
  </script>
</body>
</html>
""", "text/html")).AllowAnonymous();

        app.UseCors("AllowFrontend");
        app.UseAuthentication();
        app.UseAuthorization();

        app.MapControllers();

        app.MapGet("/api/health", () => Results.Ok(new
        {
            service = serviceName,
            status = "Healthy",
            framework = ".NET 10.0 LTS",
            architecture = "Microservices + Compact Onion",
            timestamp = DateTime.UtcNow
        })).AllowAnonymous();

        return app;
    }
}
