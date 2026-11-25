using System.Diagnostics;
using System.Net;
using Asp.Versioning;
using BuildingBlocks.Core.Attributes;
using BuildingBlocks.Core.Constants;
using BuildingBlocks.Core.Interfaces;
using BuildingBlocks.Infrastructure.Caching;
using BuildingBlocks.Infrastructure.Messaging;
using BuildingBlocks.Infrastructure.Middleware;
using BuildingBlocks.Infrastructure.Resilience;
using BuildingBlocks.Infrastructure.Storage;
using BuildingBlocks.Security;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.OpenApi;
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
        services.Configure<IdempotencySettings>(configuration.GetSection(IdempotencySettings.SectionName));
        services.Configure<HttpResilienceSettings>(configuration.GetSection(HttpResilienceSettings.SectionName));
        services.Configure<FileStorageSettings>(configuration.GetSection(FileStorageSettings.SectionName));

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

        // 1b. Setup Unified File Storage (LocalDisk default dev <-> S3 / MinIO / Cloudflare R2 via config)
        var storageSettings = configuration.GetSection(FileStorageSettings.SectionName).Get<FileStorageSettings>()
                              ?? new FileStorageSettings();
        if (storageSettings.Provider.Equals("S3", StringComparison.OrdinalIgnoreCase) ||
            storageSettings.Provider.Equals("MinIO", StringComparison.OrdinalIgnoreCase))
        {
            services.AddSingleton<IFileStorageService, S3FileStorageService>();
        }
        else
        {
            services.AddSingleton<IFileStorageService, LocalDiskFileStorageService>();
        }

        // 2. Setup HTTP EventBus dengan Polly v8 Resilience (Retry + Circuit Breaker + Timeout)
        services.AddHttpClient<IEventBus, HttpEventBus>()
                .AddStandardMicroserviceResilience(configuration);

        // 3. Setup Global Exception Handler, ProblemDetails, & Trusted ForwardedHeaders
        services.AddExceptionHandler<GlobalExceptionHandler>();
        services.AddProblemDetails();
        services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
            options.ForwardLimit = 2;
            var configuredProxies = configuration.GetSection("SecuritySettings:KnownProxies").Get<string[]>();
            if (configuredProxies is { Length: > 0 })
            {
                foreach (var proxyIp in configuredProxies)
                {
                    if (IPAddress.TryParse(proxyIp, out var ip))
                    {
                        options.KnownProxies.Add(ip);
                    }
                }
            }
        });

        // 4. Setup Controllers, API Versioning (/api/v1/... + backward-compatible /api/...), & OpenAPI
        services.AddControllers();
        services.AddApiVersioning(options =>
        {
            options.DefaultApiVersion = new ApiVersion(1, 0);
            options.AssumeDefaultVersionWhenUnspecified = true;
            options.ReportApiVersions = true;
            options.ApiVersionReader = ApiVersionReader.Combine(
                new UrlSegmentApiVersionReader(),
                new HeaderApiVersionReader(ApiVersioningConstants.VersionHeader),
                new QueryStringApiVersionReader(ApiVersioningConstants.VersionQueryParam));
        })
        .AddMvc()
        .AddApiExplorer(options =>
        {
            options.GroupNameFormat = "'v'VVV";
            options.SubstituteApiVersionInUrl = true;
        });

        services.AddOpenApi("v1", options =>
        {
            options.AddOperationTransformer((operation, context, _) =>
            {
                var idempotentAttr = context.Description.ActionDescriptor.EndpointMetadata
                    .OfType<IdempotentAttribute>()
                    .FirstOrDefault();

                if (idempotentAttr is not null)
                {
                    operation.Parameters ??= [];
                    if (!operation.Parameters.Any(p => string.Equals(p.Name, IdempotencyHeaders.Key, StringComparison.OrdinalIgnoreCase)))
                    {
                        operation.Parameters.Add(new OpenApiParameter
                        {
                            Name = IdempotencyHeaders.Key,
                            In = ParameterLocation.Header,
                            Required = idempotentAttr.RequireKey,
                            Description = "Kunci unik (UUID) per aksi submit untuk mencegah double-submit via Hybrid Cache L1/L2.",
                            Schema = new OpenApiSchema { Type = JsonSchemaType.String }
                        });
                    }
                }

                return Task.CompletedTask;
            });

            // Bersihkan duplikat path legacy (/api/...) di dokumen OpenAPI jika versi kanonis (/api/v1/...) sudah ada,
            // supaya Swagger UI / Scalar tetap rapi sambil tetap mendukung alias /api/... di runtime.
            options.AddDocumentTransformer((document, _, _) =>
            {
                if (document.Paths is not null)
                {
                    var legacyKeysToRemove = document.Paths.Keys
                        .Where(path => path.StartsWith("/api/", StringComparison.OrdinalIgnoreCase) &&
                                       !path.StartsWith("/api/v", StringComparison.OrdinalIgnoreCase) &&
                                       !path.StartsWith("/api/internal/", StringComparison.OrdinalIgnoreCase) &&
                                       !string.Equals(path, "/api/health", StringComparison.OrdinalIgnoreCase))
                        .Where(legacyPath =>
                        {
                            var versionedCandidate = "/api/v1/" + legacyPath["/api/".Length..];
                            return document.Paths.ContainsKey(versionedCandidate);
                        })
                        .ToList();

                    foreach (var key in legacyKeysToRemove)
                    {
                        document.Paths.Remove(key);
                    }
                }

                return Task.CompletedTask;
            });
        });

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
                      .AllowCredentials()
                      .WithExposedHeaders(
                          IdempotencyHeaders.Key,
                          IdempotencyHeaders.Replayed,
                          CurrentUserService.CorrelationHeaderName,
                          ApiVersioningConstants.SupportedVersionsHeader,
                          ApiVersioningConstants.DeprecatedVersionsHeader);
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

        // Security Guard: Cegah Production berjalan dengan default hardcoded JWT SecretKey / InternalApiKey
        var jwtSettings = app.Services.GetService<IOptions<JwtSettings>>()?.Value;
        var allowDefaultSecrets = app.Configuration.GetValue<bool>("SecuritySettings:AllowDefaultSecretsInProduction", false);
        if (jwtSettings is not null && jwtSettings.HasDefaultSecrets())
        {
            if (app.Environment.IsDevelopment() || allowDefaultSecrets)
            {
                app.Logger.LogWarning(
                    "[SECURITY WARNING] {ServiceName} masih menggunakan default JwtSettings SecretKey/InternalApiKey. Wajib diganti via Environment Variable / Vault sebelum deploy Production!",
                    serviceName);
            }
            else
            {
                throw new InvalidOperationException(
                    $"[{serviceName}] Startup diblokir: JwtSettings:SecretKey atau InternalApiKey masih menggunakan nilai default starterpack di environment {app.Environment.EnvironmentName}.");
            }
        }

        app.UseForwardedHeaders();
        app.UseMiddleware<CorrelationIdMiddleware>();
        app.UseMiddleware<SecurityHeadersMiddleware>();
        app.UseExceptionHandler();

        // Swagger / Scalar / OpenAPI hanya aktif di Development (atau jika diizinkan eksplisit via SecuritySettings:EnableApiDocsInProduction)
        var enableApiDocs = app.Environment.IsDevelopment() ||
                            app.Configuration.GetValue<bool>("SecuritySettings:EnableApiDocsInProduction", false);
        if (enableApiDocs)
        {
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
        }

        app.UseCors("AllowFrontend");
        app.UseAuthentication();
        app.UseAuthorization();
        app.UseMiddleware<IdempotencyMiddleware>(serviceName);

        app.MapControllers();

        object BuildHealthPayload() => new
        {
            service = serviceName,
            status = "Healthy",
            apiVersion = ApiVersioningConstants.DefaultVersion,
            framework = ".NET 10.0 LTS",
            architecture = "Microservices + Compact Onion",
            timestamp = DateTime.UtcNow
        };

        app.MapGet("/api/health", () => Results.Ok(BuildHealthPayload())).AllowAnonymous();
        app.MapGet("/api/v1/health", () => Results.Ok(BuildHealthPayload())).AllowAnonymous();

        return app;
    }
}
