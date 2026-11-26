using BuildingBlocks.Core.Common;
using BuildingBlocks.Core.Contracts;
using Notification.Api.Application.DTOs;
using Notification.Api.Domain.Entities;

namespace Notification.Api.Application.Interfaces;

public interface INotificationService
{
    Task<Result<int>> IngestEventAsync(NotificationIntegrationEvent integrationEvent, CancellationToken cancellationToken = default);
    Task<Result<NotificationListResponse>> GetMyNotificationsAsync(string? category = null, bool unreadOnly = false, int page = 1, int pageSize = 20, CancellationToken cancellationToken = default);
    Task<Result<NotificationBellResponse>> GetBellSummaryAsync(int limit = 10, CancellationToken cancellationToken = default);
    Task<Result> MarkAsReadAsync(Guid id, CancellationToken cancellationToken = default);
    Task<Result<int>> MarkAllAsReadAsync(string? category = null, CancellationToken cancellationToken = default);
    Task<Result> DeleteMyNotificationAsync(Guid id, CancellationToken cancellationToken = default);

    Task<Result<IReadOnlyList<NotificationPreferenceDto>>> GetMyPreferencesAsync(CancellationToken cancellationToken = default);
    Task<Result<IReadOnlyList<NotificationPreferenceDto>>> UpdateMyPreferencesAsync(UpdateNotificationPreferencesRequest request, CancellationToken cancellationToken = default);

    Task<Result<IReadOnlyList<UserPushDeviceDto>>> GetMyDevicesAsync(CancellationToken cancellationToken = default);
    Task<Result<UserPushDeviceDto>> RegisterDeviceAsync(RegisterPushDeviceRequest request, CancellationToken cancellationToken = default);
    Task<Result> UnregisterDeviceAsync(string pushToken, CancellationToken cancellationToken = default);
    Task<Result> RemoveDeviceByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<Result<int>> SendTestPushToMeAsync(SendTestPushRequest? request = null, CancellationToken cancellationToken = default);

    Task<Result<IReadOnlyList<NotificationTemplateDto>>> GetTemplatesAsync(CancellationToken cancellationToken = default);
    Task<Result<NotificationTemplateDto>> GetTemplateByCodeAsync(string code, CancellationToken cancellationToken = default);
    Task<Result<NotificationTemplateDto>> UpdateTemplateAsync(string code, UpdateNotificationTemplateRequest request, CancellationToken cancellationToken = default);
    Task<Result<NotificationTemplateDto>> ResetTemplateToDefaultAsync(string code, CancellationToken cancellationToken = default);
    Task<Result<RenderedEmailResult>> PreviewTemplateAsync(string code, PreviewTemplateRequest? request = null, CancellationToken cancellationToken = default);
    Task<Result<NotificationDeliveryLogDto>> SendTestEmailAsync(string code, SendTestEmailRequest? request = null, CancellationToken cancellationToken = default);

    Task<Result<IReadOnlyList<NotificationDeliveryLogDto>>> GetDeliveryLogsAsync(string? channel = null, string? status = null, int limit = 100, CancellationToken cancellationToken = default);
    Task<Result<NotificationDeliveryLogDto>> RetryDeliveryAsync(Guid deliveryLogId, CancellationToken cancellationToken = default);
    Task<Result<EmailProviderStatusDto>> GetProviderStatusAsync(CancellationToken cancellationToken = default);
    Task<Result<NotificationStatsDto>> GetStatsAsync(CancellationToken cancellationToken = default);
}

public interface IEmailTemplateRenderer
{
    Task<RenderedEmailResult> RenderAsync(
        string subjectTemplate,
        string bodyHtmlTemplate,
        string accentColor,
        string actionLabel,
        string? actionUrl,
        Dictionary<string, string> variables,
        string? devRedirectOriginalEmail = null,
        CancellationToken cancellationToken = default);

    Task<string?> LoadDefaultBodyHtmlAsync(string fileName, CancellationToken cancellationToken = default);
}

public record EmailSendResult(
    bool Succeeded,
    bool IsSimulated,
    string ProviderName,
    string EffectiveRecipient,
    string? ErrorMessage = null
);

public interface IEmailSender
{
    Task<EmailSendResult> SendAsync(
        string toEmail,
        string toName,
        string subject,
        string htmlBody,
        CancellationToken cancellationToken = default);

    EmailProviderStatusDto GetProviderStatus();
}

public record PushSendResult(
    bool Succeeded,
    bool IsSimulated,
    string ProviderName,
    string? ErrorMessage = null
);

public interface IPushNotificationSender
{
    Task<PushSendResult> SendAsync(
        string pushToken,
        string title,
        string body,
        Dictionary<string, string>? data = null,
        CancellationToken cancellationToken = default);
}

public interface IIdentityRecipientClient
{
    Task<IReadOnlyList<ResolvedRecipientDto>> ResolveRecipientsAsync(
        ResolveRecipientsRequest request,
        CancellationToken cancellationToken = default);
}

public interface INotificationRealtimeNotifier
{
    Task NotifyUserAsync(Guid userId, NotificationItemDto notification, int unreadCount, CancellationToken cancellationToken = default);
    Task NotifyUnreadCountAsync(Guid userId, int unreadCount, CancellationToken cancellationToken = default);
}
