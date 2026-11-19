using System.Diagnostics;
using System.Net.Sockets;
using System.Text.Json.Nodes;
using System.Threading.RateLimiting;
using BuildingBlocks.Core.Common;
using BuildingBlocks.Core.Contracts;
using BuildingBlocks.Infrastructure.Middleware;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

// 1. Register YARP Reverse Proxy from appsettings.json
builder.Services
    .AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"));

builder.Services.AddHttpClient("GatewayAggregator", client =>
{
    client.Timeout = TimeSpan.FromSeconds(4);
});

builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddProblemDetails();

// 2. Centralized API Gateway Rate Limiting (Fixed Window: 300 req / minute per IP)
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = async (context, token) =>
    {
        context.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        context.HttpContext.Response.ContentType = "application/json";
        var payload = Result.Failure("Terlalu banyak permintaan (Rate Limit API Gateway terlampaui). Silakan coba sesaat lagi.", 429);
        await context.HttpContext.Response.WriteAsJsonAsync(payload, token);
    };

    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(httpContext =>
    {
        var clientIp = httpContext.Connection.RemoteIpAddress?.ToString() ?? "anonymous";
        return RateLimitPartition.GetFixedWindowLimiter(clientIp, _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 300,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 10,
            QueueProcessingOrder = QueueProcessingOrder.OldestFirst
        });
    });
});

// 3. Centralized CORS for Frontend SPA
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
            ?? ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000"];

        policy.WithOrigins(allowedOrigins)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

var app = builder.Build();

// 4. Development Auto-Orchestrator: Otomatis menyalakan Identity.Api (5081), Catalog.Api (5082), Order.Api (5083), dan React Vite (5173) saat tekan F5
var spawnedProcesses = new List<Process>();

if (app.Environment.IsDevelopment())
{
    var autoStartBackends = builder.Configuration.GetValue<bool>("MicroservicesOrchestrator:AutoStartBackendServices", true);
    var autoStartSpa = builder.Configuration.GetValue<bool>("MicroservicesOrchestrator:AutoStartFrontendSpa", true);
    var identityPort = builder.Configuration.GetValue<int>("MicroservicesOrchestrator:IdentityPort", 5081);
    var catalogPort = builder.Configuration.GetValue<int>("MicroservicesOrchestrator:CatalogPort", 5082);
    var orderPort = builder.Configuration.GetValue<int>("MicroservicesOrchestrator:OrderPort", 5083);
    var spaPort = builder.Configuration.GetValue<int>("MicroservicesOrchestrator:SpaPort", 5173);

    var solutionRoot = Path.GetFullPath(Path.Combine(app.Environment.ContentRootPath, "..", "..", ".."));

    if (autoStartBackends)
    {
        TryStartDotnetMicroservice(
            serviceName: "Identity.Api",
            port: identityPort,
            projectDir: Path.Combine(solutionRoot, "src", "Services", "Identity", "Identity.Api"),
            spawnedProcesses,
            app.Logger);

        TryStartDotnetMicroservice(
            serviceName: "Catalog.Api",
            port: catalogPort,
            projectDir: Path.Combine(solutionRoot, "src", "Services", "Catalog", "Catalog.Api"),
            spawnedProcesses,
            app.Logger);

        TryStartDotnetMicroservice(
            serviceName: "Order.Api",
            port: orderPort,
            projectDir: Path.Combine(solutionRoot, "src", "Services", "Order", "Order.Api"),
            spawnedProcesses,
            app.Logger);
    }

    if (autoStartSpa && !IsPortListening(spaPort))
    {
        var frontendDir = Path.Combine(solutionRoot, "frontend");
        if (Directory.Exists(frontendDir))
        {
            try
            {
                var isWindows = OperatingSystem.IsWindows();
                var viteProc = Process.Start(new ProcessStartInfo
                {
                    FileName = isWindows ? "cmd.exe" : "npm",
                    Arguments = isWindows ? "/c npm run dev" : "run dev",
                    WorkingDirectory = frontendDir,
                    UseShellExecute = false,
                    CreateNoWindow = false
                });
                if (viteProc is not null)
                {
                    spawnedProcesses.Add(viteProc);
                    app.Logger.LogInformation("[Gateway Orchestrator] React Vite Frontend otomatis dijalankan di http://localhost:{Port}", spaPort);
                }
            }
            catch (Exception ex)
            {
                app.Logger.LogWarning(ex, "[Gateway Orchestrator] Gagal menjalankan npm run dev secara otomatis.");
            }
        }
    }

    app.Lifetime.ApplicationStopping.Register(() =>
    {
        foreach (var proc in spawnedProcesses)
        {
            try
            {
                if (!proc.HasExited)
                {
                    proc.Kill(entireProcessTree: true);
                }
            }
            catch
            {
                // Ignore cleanup exceptions
            }
        }
    });
}

app.UseMiddleware<CorrelationIdMiddleware>();
app.UseExceptionHandler();
app.UseCors("AllowFrontend");
app.UseRateLimiter();

// 5. Unified OpenAPI Spec Aggregator (/openapi/v1.json) — Menggabungkan spec Identity.Api (5081), Catalog.Api (5082), & Order.Api (5083)
app.MapGet("/openapi/v1.json", async (IHttpClientFactory httpClientFactory) =>
{
    var client = httpClientFactory.CreateClient("GatewayAggregator");
    var identityUrl = builder.Configuration["ServiceEndpoints:IdentityServiceUrl"] ?? "http://localhost:5081";
    var catalogUrl = builder.Configuration["ServiceEndpoints:CatalogServiceUrl"] ?? "http://localhost:5082";
    var orderUrl = builder.Configuration["ServiceEndpoints:OrderServiceUrl"] ?? "http://localhost:5083";

    var rootDoc = new JsonObject
    {
        ["openapi"] = "3.0.1",
        ["info"] = new JsonObject
        {
            ["title"] = "NetStarterPack Microservices — Unified API Gateway (YARP)",
            ["version"] = "v1",
            ["description"] = "Dokumentasi gabungan seluruh Microservice (Identity.Api :5081, Catalog.Api :5082, & Order.Api :5083) melalui pintu YARP API Gateway (Port 5080)."
        },
        ["servers"] = new JsonArray(new JsonObject { ["url"] = "http://localhost:5080", ["description"] = "YARP API Gateway (Port 5080)" }),
        ["paths"] = new JsonObject(),
        ["components"] = new JsonObject
        {
            ["schemas"] = new JsonObject(),
            ["securitySchemes"] = new JsonObject
            {
                ["Bearer"] = new JsonObject
                {
                    ["type"] = "http",
                    ["scheme"] = "bearer",
                    ["bearerFormat"] = "JWT",
                    ["description"] = "Masukkan JWT AccessToken dari /api/auth/login"
                }
            }
        },
        ["security"] = new JsonArray(new JsonObject { ["Bearer"] = new JsonArray() })
    };

    var mergedPaths = rootDoc["paths"]!.AsObject();
    var mergedSchemas = rootDoc["components"]!["schemas"]!.AsObject();

    await MergeMicroserviceOpenApiAsync(client, $"{identityUrl}/openapi/v1.json", mergedPaths, mergedSchemas);
    await MergeMicroserviceOpenApiAsync(client, $"{catalogUrl}/openapi/v1.json", mergedPaths, mergedSchemas);
    await MergeMicroserviceOpenApiAsync(client, $"{orderUrl}/openapi/v1.json", mergedPaths, mergedSchemas);

    return Results.Content(rootDoc.ToJsonString(), "application/json");
}).AllowAnonymous();

// 6. Unified Scalar UI (/scalar/v1) & Classic Swagger UI (/swagger) di Gateway
app.MapScalarApiReference(options =>
{
    options
        .WithTitle("NetStarterPack Microservices — Unified Gateway Scalar UI")
        .AddPreferredSecuritySchemes("Bearer");
});

app.MapGet("/swagger", () => Results.Content("""
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>NetStarterPack Microservices — Unified Gateway Swagger UI</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui.css" />
  <style>
    body { margin: 0; background: #fafafa; }
    .topbar-custom { background: #042f2e; color: #f0fdfa; padding: 10px 24px; font-family: sans-serif; display: flex; align-items: center; justify-content: space-between; font-size: 13px; flex-wrap: wrap; gap: 8px; }
    .topbar-custom a { color: #2dd4bf; text-decoration: none; font-weight: 600; margin-left: 14px; }
    .badge-ms { background: #0d9488; color: white; padding: 2px 8px; border-radius: 999px; font-size: 11px; margin-right: 8px; }
  </style>
</head>
<body>
  <div class="topbar-custom">
    <div>
      <span class="badge-ms">YARP GATEWAY :5080</span>
      <strong>Unified Microservices Swagger UI</strong> — Klik <b>Authorize</b> untuk tes Identity (:5081), Catalog (:5082), &amp; Order (:5083)
    </div>
    <div>
      <a href="http://localhost:5081/swagger" target="_blank">Identity (:5081) &nearr;</a>
      <a href="http://localhost:5082/swagger" target="_blank">Catalog (:5082) &nearr;</a>
      <a href="http://localhost:5083/swagger" target="_blank">Order (:5083) &nearr;</a>
      <a href="/scalar/v1">Unified Scalar &rarr;</a>
      <a href="http://localhost:5173" target="_blank">Web React (:5173) &rarr;</a>
    </div>
  </div>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui-bundle.js"></script>
  <script>
    fetch('/openapi/v1.json')
      .then(r => r.json())
      .then(spec => {
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

// 7. Aggregated Microservices Health & Topology Check (/api/health)
app.MapGet("/api/health", async (IHttpClientFactory httpClientFactory) =>
{
    var client = httpClientFactory.CreateClient("GatewayAggregator");
    var identityUrl = builder.Configuration["ServiceEndpoints:IdentityServiceUrl"] ?? "http://localhost:5081";
    var catalogUrl = builder.Configuration["ServiceEndpoints:CatalogServiceUrl"] ?? "http://localhost:5082";
    var orderUrl = builder.Configuration["ServiceEndpoints:OrderServiceUrl"] ?? "http://localhost:5083";

    var identityHealth = await ProbeServiceAsync(client, "Identity.Api", $"{identityUrl}/api/health", "NetStarterPack_IdentityDb", 5081);
    var catalogHealth = await ProbeServiceAsync(client, "Catalog.Api", $"{catalogUrl}/api/health", "NetStarterPack_CatalogDb", 5082);
    var orderHealth = await ProbeServiceAsync(client, "Order.Api", $"{orderUrl}/api/health", "NetStarterPack_OrderDb", 5083);

    return Results.Ok(new
    {
        gateway = "Gateway.Api (YARP Reverse Proxy)",
        status = identityHealth.Status == "Healthy" && catalogHealth.Status == "Healthy" && orderHealth.Status == "Healthy" ? "Healthy" : "Degraded",
        framework = ".NET 10.0 LTS",
        architecture = "Microservices + Compact Onion + YARP Gateway",
        services = new[] { identityHealth, catalogHealth, orderHealth },
        timestamp = DateTime.UtcNow
    });
}).AllowAnonymous();

// 8. Map YARP Reverse Proxy Routes
app.MapReverseProxy();

app.Run();

static bool IsPortListening(int port)
{
    try
    {
        using var tcp = new TcpClient();
        return tcp.ConnectAsync("127.0.0.1", port).Wait(250);
    }
    catch
    {
        return false;
    }
}

/// <summary>
/// Menjalankan microservice dari folder Shadow-Copy (obj/runtime-shadow) serta menyertakan NSP_PARENT_PID.
/// Keuntungannya: Folder asli bin/Debug/net10.0 TIDAK PERNAH terkunci (locked) saat Visual Studio melakukan Build/Rebuild!
/// </summary>
static void TryStartDotnetMicroservice(
    string serviceName,
    int port,
    string projectDir,
    List<Process> spawnedProcesses,
    ILogger logger)
{
    if (IsPortListening(port) || !Directory.Exists(projectDir))
    {
        return;
    }

    try
    {
        var binDir = Path.Combine(projectDir, "bin", "Debug", "net10.0");
        var sourceDll = Path.Combine(binDir, $"{serviceName}.dll");

        ProcessStartInfo startInfo;
        if (File.Exists(sourceDll))
        {
            var shadowDir = Path.Combine(projectDir, "obj", "runtime-shadow", $"run-{DateTime.UtcNow.Ticks}");
            CopyDirectoryRecursive(binDir, shadowDir);
            var shadowDll = Path.Combine(shadowDir, $"{serviceName}.dll");

            startInfo = new ProcessStartInfo
            {
                FileName = "dotnet",
                Arguments = $"\"{shadowDll}\" --urls http://localhost:{port}",
                WorkingDirectory = projectDir,
                UseShellExecute = false,
                CreateNoWindow = false
            };
        }
        else
        {
            startInfo = new ProcessStartInfo
            {
                FileName = "dotnet",
                Arguments = $"run --project \"{projectDir}\" --urls http://localhost:{port}",
                WorkingDirectory = projectDir,
                UseShellExecute = false,
                CreateNoWindow = false
            };
        }

        startInfo.EnvironmentVariables["ASPNETCORE_ENVIRONMENT"] = "Development";
        startInfo.EnvironmentVariables["NSP_PARENT_PID"] = Environment.ProcessId.ToString();

        var process = Process.Start(startInfo);
        if (process is not null)
        {
            spawnedProcesses.Add(process);
            logger.LogInformation("[Gateway Orchestrator] Microservice {ServiceName} otomatis dijalankan di http://localhost:{Port}", serviceName, port);
        }
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "[Gateway Orchestrator] Gagal menjalankan microservice {ServiceName} secara otomatis.", serviceName);
    }
}

static void CopyDirectoryRecursive(string sourceDir, string targetDir)
{
    Directory.CreateDirectory(targetDir);
    foreach (var file in Directory.GetFiles(sourceDir))
    {
        var destFile = Path.Combine(targetDir, Path.GetFileName(file));
        File.Copy(file, destFile, overwrite: true);
    }
    foreach (var subDir in Directory.GetDirectories(sourceDir))
    {
        var destSubDir = Path.Combine(targetDir, Path.GetFileName(subDir));
        CopyDirectoryRecursive(subDir, destSubDir);
    }
}

static async Task MergeMicroserviceOpenApiAsync(
    HttpClient client,
    string openApiUrl,
    JsonObject mergedPaths,
    JsonObject mergedSchemas)
{
    try
    {
        var jsonString = await client.GetStringAsync(openApiUrl);
        var node = JsonNode.Parse(jsonString)?.AsObject();
        if (node is null) return;

        if (node["paths"] is JsonObject paths)
        {
            foreach (var kvp in paths)
            {
                if (kvp.Key.StartsWith("/api/internal/", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }
                mergedPaths[kvp.Key] = kvp.Value?.DeepClone();
            }
        }

        if (node["components"]?["schemas"] is JsonObject schemas)
        {
            foreach (var kvp in schemas)
            {
                if (!mergedSchemas.ContainsKey(kvp.Key))
                {
                    mergedSchemas[kvp.Key] = kvp.Value?.DeepClone();
                }
            }
        }
    }
    catch
    {
        // Abaikan jika salah satu microservice sedang booting
    }
}

static async Task<ServiceHealthNode> ProbeServiceAsync(
    HttpClient client,
    string serviceName,
    string healthUrl,
    string databaseName,
    int port)
{
    var sw = Stopwatch.StartNew();
    try
    {
        var response = await client.GetAsync(healthUrl);
        sw.Stop();
        return new ServiceHealthNode(
            serviceName,
            port,
            healthUrl,
            response.IsSuccessStatusCode ? "Healthy" : $"HTTP {(int)response.StatusCode}",
            databaseName,
            sw.ElapsedMilliseconds);
    }
    catch
    {
        sw.Stop();
        return new ServiceHealthNode(
            serviceName,
            port,
            healthUrl,
            "Unreachable",
            databaseName,
            sw.ElapsedMilliseconds);
    }
}


