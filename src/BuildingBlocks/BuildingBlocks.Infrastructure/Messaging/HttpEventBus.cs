using System.Net.Http.Json;
using BuildingBlocks.Core.Contracts;
using BuildingBlocks.Core.Interfaces;
using BuildingBlocks.Security;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace BuildingBlocks.Infrastructure.Messaging;

public class ServiceEndpointsSettings
{
    public const string SectionName = "ServiceEndpoints";

    public string GatewayUrl { get; set; } = "http://localhost:5080";
    public string IdentityServiceUrl { get; set; } = "http://localhost:5081";
    public string CatalogServiceUrl { get; set; } = "http://localhost:5082";
    public string OrderServiceUrl { get; set; } = "http://localhost:5083";
    public string WorkflowServiceUrl { get; set; } = "http://localhost:5084";
    public string AnnouncementServiceUrl { get; set; } = "http://localhost:5085";
    public string MasterDataServiceUrl { get; set; } = "http://localhost:5086";
}

/// <summary>
/// Implementasi IEventBus yang mengirim integration event (seperti AuditLog) lintas microservice.
/// Dilengkapi dengan resilient try-catch & timeout singkat agar kegagalan jaringan ke service lain
/// TIDAK pernah menggagalkan transaksi utama di microservice pemanggil.
/// </summary>
public class HttpEventBus(
    HttpClient httpClient,
    IOptions<ServiceEndpointsSettings> endpointOptions,
    IOptions<JwtSettings> jwtOptions,
    ICurrentUserService currentUserService,
    ILogger<HttpEventBus> logger) : IEventBus
{
    private readonly ServiceEndpointsSettings _endpoints = endpointOptions.Value;
    private readonly JwtSettings _jwtSettings = jwtOptions.Value;

    public async Task PublishAuditAsync(AuditLogIntegrationEvent auditEvent, CancellationToken cancellationToken = default)
    {
        try
        {
            var url = $"{_endpoints.IdentityServiceUrl.TrimEnd('/')}/api/internal/events/audit-log";
            using var request = new HttpRequestMessage(HttpMethod.Post, url)
            {
                Content = JsonContent.Create(auditEvent)
            };

            request.Headers.Add("X-Internal-Api-Key", _jwtSettings.InternalApiKey);
            request.Headers.Add(CurrentUserService.CorrelationHeaderName, currentUserService.CorrelationId);

            // Timeout, Exponential Retry, & Circuit Breaker dikelola oleh Polly v8 (AddStandardMicroserviceResilience)
            var response = await httpClient.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning(
                    "[EVENTBUS] Identity.Api merespons HTTP {StatusCode} saat menerima AuditLogEvent ({Action}).",
                    (int)response.StatusCode,
                    auditEvent.Action);
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(
                ex,
                "[EVENTBUS FALLBACK] Gagal mengirim AuditLogEvent ({Action} - {Module}) ke Identity.Api. Transaksi lokal tetap dilanjutkan.",
                auditEvent.Action,
                auditEvent.Module);
        }
    }
}


