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

public record AnnouncementStatsDto(
    int TotalAnnouncements,
    int PublishedAnnouncements,
    int TotalLikes,
    int TotalComments
);

public record TrackingStatsDto(
    int TotalAssignments,
    int ActiveInTransit,
    int PendingVerification,
    int CompletedAssignments,
    int SuspiciousFlags
);

/// <summary>
/// Event integrasi lintas microservice untuk mengirim notifikasi multi-channel (In-App SignalR, Email HTML, &amp; Mobile Push)
/// ke Notification.Api tanpa membuat microservice bisnis bergantung pada SMTP/Push/HTML.
/// </summary>
public record NotificationIntegrationEvent(
    string TemplateCode,
    string Category,
    string Title,
    string Message,
    IReadOnlyList<Guid>? TargetUserIds = null,
    IReadOnlyList<string>? TargetRoles = null,
    Guid? ExcludeUserId = null,
    Dictionary<string, string>? Variables = null,
    string? ActionUrl = null,
    string? EntityId = null,
    string Severity = "Info",
    string SourceService = "System",
    bool SendInApp = true,
    bool SendEmail = true,
    bool SendPush = true,
    DateTime? Timestamp = null
);

/// <summary>
/// Request internal dari Notification.Api ke Identity.Api untuk me-resolve alamat email dan nama penerima
/// berdasarkan daftar UserId dan/atau RoleName.
/// </summary>
public record ResolveRecipientsRequest(
    IReadOnlyList<Guid>? UserIds = null,
    IReadOnlyList<string>? RoleNames = null,
    Guid? ExcludeUserId = null
);

/// <summary>
/// Hasil resolusi kontak penerima dari Identity.Api (dipakai Notification.Api untuk pengiriman In-App, Email, &amp; Push).
/// </summary>
public record ResolvedRecipientDto(
    Guid UserId,
    string Username,
    string FullName,
    string Email,
    IReadOnlyList<string> Roles
);

public record NotificationStatsDto(
    int TotalNotifications,
    int UnreadNotifications,
    int PendingDeliveries,
    int SentDeliveries,
    int FailedDeliveries,
    int ActiveTemplates,
    int RegisteredDevices
);

public record ServiceHealthNode(
    string Service,
    int Port,
    string Url,
    string Status,
    string Database,
    long LatencyMs
);
