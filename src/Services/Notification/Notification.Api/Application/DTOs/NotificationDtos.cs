namespace Notification.Api.Application.DTOs;

public record NotificationItemDto(
    Guid Id,
    Guid UserId,
    string Category,
    string TemplateCode,
    string Title,
    string Message,
    string Severity,
    string? ActionUrl,
    string? EntityId,
    string SourceService,
    bool IsRead,
    DateTime? ReadAt,
    DateTime CreatedAt
);

public record NotificationListResponse(
    IReadOnlyList<NotificationItemDto> Items,
    int TotalCount,
    int UnreadCount,
    int Page,
    int PageSize,
    int TotalPages
);

public record NotificationBellResponse(
    int UnreadCount,
    IReadOnlyList<NotificationItemDto> Items
);

public record NotificationPreferenceDto(
    string Category,
    bool InAppEnabled,
    bool EmailEnabled,
    bool PushEnabled
);

public record UpdateNotificationPreferencesRequest(
    IReadOnlyList<NotificationPreferenceDto> Preferences
);

public record RegisterPushDeviceRequest(
    string PushToken,
    string Platform = "android",
    string? DeviceName = null
);

public record UnregisterPushDeviceRequest(
    string PushToken
);

public record UserPushDeviceDto(
    Guid Id,
    string PushToken,
    string Platform,
    string DeviceName,
    bool IsActive,
    DateTime LastSeenAt
);

public record NotificationTemplateDto(
    Guid Id,
    string Code,
    string Name,
    string Category,
    string Description,
    string SubjectTemplate,
    string BodyHtmlTemplate,
    string AccentColor,
    string ActionLabel,
    string DefaultFileName,
    string SampleDataJson,
    bool DefaultSendInApp,
    bool DefaultSendEmail,
    bool DefaultSendPush,
    bool IsActive,
    DateTime UpdatedAt
);

public record UpdateNotificationTemplateRequest(
    string Name,
    string Description,
    string SubjectTemplate,
    string BodyHtmlTemplate,
    string AccentColor,
    string ActionLabel,
    bool DefaultSendInApp,
    bool DefaultSendEmail,
    bool DefaultSendPush,
    bool IsActive
);

public record PreviewTemplateRequest(
    string? SubjectTemplate = null,
    string? BodyHtmlTemplate = null,
    string? AccentColor = null,
    string? ActionLabel = null,
    Dictionary<string, string>? Variables = null
);

public record RenderedEmailResult(
    string Subject,
    string HtmlBody,
    string PlainTextPreview
);

public record SendTestEmailRequest(
    string? RecipientEmail = null,
    Dictionary<string, string>? Variables = null
);

public record SendTestPushRequest(
    string? Title = null,
    string? Message = null
);

public record NotificationDeliveryLogDto(
    Guid Id,
    Guid? NotificationItemId,
    Guid? UserId,
    string RecipientName,
    string? RecipientEmail,
    string? EffectiveRecipientEmail,
    string? RecipientPushToken,
    string TemplateCode,
    string Category,
    string Channel,
    string Subject,
    string BodyPreview,
    string Status,
    string ProviderName,
    int AttemptCount,
    int MaxAttempts,
    DateTime? NextRetryAt,
    string? LastError,
    DateTime? SentAt,
    DateTime CreatedAt
);

public record EmailProviderProfileStatusDto(
    string Name,
    string Host,
    int Port,
    string Security,
    string FromEmail,
    bool HasCredentials,
    bool IsActive
);

public record EmailProviderStatusDto(
    string ActiveProvider,
    bool EnableSending,
    string? DevOverrideRecipient,
    string AppBaseUrl,
    bool PushEnabled,
    IReadOnlyList<EmailProviderProfileStatusDto> Profiles
);
