namespace BuildingBlocks.Core.Contracts;

/// <summary>
/// Event integrasi lintas microservice untuk mencatat Audit Log secara terpusat di Identity.Api.
/// Dikirim melalui IEventBus setiap kali microservice bisnis melakukan perubahan data.
/// </summary>
public record AuditLogIntegrationEvent(
    Guid? UserId,
    string UserName,
    string Action,
    string Module,
    string? EntityId,
    string Details,
    string? IpAddress,
    string SourceService = "Catalog.Api",
    DateTime? Timestamp = null
);

public record CatalogStatsDto(
    int TotalProducts,
    decimal TotalInventoryValue,
    int ActiveProducts,
    int OutOfStockProducts
);

public record OrderStatsDto(
    int TotalOrders,
    decimal TotalRevenue,
    int PendingOrders,
    int CompletedOrders
);

public record WorkflowStatsDto(
    int TotalRequests,
    int InReviewRequests,
    int ApprovedRequests,
    int RejectedRequests,
    int RevisionRequests,
    int ActiveTemplates
);

public record ServiceHealthNode(
    string Service,
    int Port,
    string Url,
    string Status,
    string Database,
    long LatencyMs
);
