using BuildingBlocks.Core.Common;

namespace Notification.Api.Domain.Entities;

public enum DeliveryChannel
{
    Email = 1,
    Push = 2
}

public enum DeliveryStatus
{
    Pending = 1,
    Processing = 2,
    Sent = 3,
    Simulated = 4,
    Failed = 5,
    Skipped = 6
}

/// <summary>
/// Inbox notifikasi In-App per user (mencakup Workflow, Order, Tracking, Announcement, &amp; System).
/// </summary>
public class NotificationItem : BaseEntity
{
    public Guid UserId { get; set; }
    public string Category { get; set; } = "System";
    public string TemplateCode { get; set; } = "GENERIC_NOTIFICATION";
    public string Title { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string Severity { get; set; } = "Info";
    public string? ActionUrl { get; set; }
    public string? EntityId { get; set; }
    public string SourceService { get; set; } = "System";
    public string MetadataJson { get; set; } = "{}";
    public bool IsRead { get; set; }
    public DateTime? ReadAt { get; set; }
}

/// <summary>
/// Katalog template email HTML (Scriban) per kode event.
/// Di-seed otomatis dari file HTML default di Git, dan dapat diedit/di-preview/di-reset melalui UI Admin.
/// </summary>
public class NotificationTemplate : BaseEntity
{
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Category { get; set; } = "System";
    public string Description { get; set; } = string.Empty;
    public string SubjectTemplate { get; set; } = string.Empty;
    public string BodyHtmlTemplate { get; set; } = string.Empty;
    public string AccentColor { get; set; } = "#0D9488";
    public string ActionLabel { get; set; } = "Buka Aplikasi";
    public string DefaultFileName { get; set; } = "generic-notification.html";
    public string SampleDataJson { get; set; } = "{}";
    public bool DefaultSendInApp { get; set; } = true;
    public bool DefaultSendEmail { get; set; } = true;
    public bool DefaultSendPush { get; set; } = true;
    public bool IsActive { get; set; } = true;
}

/// <summary>
/// Preferensi channel notifikasi per user untuk setiap kategori (Workflow, Order, Tracking, Announcement, System).
/// </summary>
public class NotificationPreference : BaseEntity
{
    public Guid UserId { get; set; }
    public string Category { get; set; } = string.Empty;
    public bool InAppEnabled { get; set; } = true;
    public bool EmailEnabled { get; set; } = true;
    public bool PushEnabled { get; set; } = true;
}

/// <summary>
/// Token perangkat mobile (Expo Push Token) milik user untuk pengiriman push notification Android/iOS.
/// </summary>
public class UserPushDevice : BaseEntity
{
    public Guid UserId { get; set; }
    public string Username { get; set; } = string.Empty;
    public string PushToken { get; set; } = string.Empty;
    public string Platform { get; set; } = "android";
    public string DeviceName { get; set; } = "Mobile Device";
    public bool IsActive { get; set; } = true;
    public DateTime LastSeenAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Outbox / antrean pengiriman Email &amp; Push Notification yang diproses secara async oleh BackgroundService
/// lengkap dengan retry bertahap dan catatan error.
/// </summary>
public class NotificationDeliveryLog : BaseEntity
{
    public Guid? NotificationItemId { get; set; }
    public Guid? UserId { get; set; }
    public string RecipientName { get; set; } = string.Empty;
    public string? RecipientEmail { get; set; }
    public string? EffectiveRecipientEmail { get; set; }
    public string? RecipientPushToken { get; set; }
    public string TemplateCode { get; set; } = string.Empty;
    public string Category { get; set; } = "System";
    public DeliveryChannel Channel { get; set; } = DeliveryChannel.Email;
    public string Subject { get; set; } = string.Empty;
    public string BodyPreview { get; set; } = string.Empty;
    public string? RenderedHtml { get; set; }
    public string? ActionUrl { get; set; }
    public DeliveryStatus Status { get; set; } = DeliveryStatus.Pending;
    public string ProviderName { get; set; } = string.Empty;
    public int AttemptCount { get; set; }
    public int MaxAttempts { get; set; } = 3;
    public DateTime? NextRetryAt { get; set; }
    public string? LastError { get; set; }
    public DateTime? SentAt { get; set; }
}
