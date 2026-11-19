namespace BuildingBlocks.Core.Contracts;

/// <summary>
/// Event integrasi lintas microservice untuk mencatat Audit Log secara terpusat di Identity.Api.
/// Dikirim melalui IEventBus setiap kali microservice bisnis (seperti Catalog.Api atau Order.Api) melakukan perubahan data.
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

/// <summary>
/// Kontrak ringkasan metrik dari Catalog.Api untuk diagregasi oleh Dashboard di Identity.Api.
/// </summary>
public record CatalogStatsDto(
    int TotalProducts,
    decimal TotalInventoryValue,
    int ActiveProducts,
    int OutOfStockProducts
);

/// <summary>
/// Kontrak ringkasan metrik dari Order.Api (Microservice ke-3).
/// </summary>
public record OrderStatsDto(
    int TotalOrders,
    decimal TotalRevenue,
    int PendingOrders,
    int CompletedOrders
);
