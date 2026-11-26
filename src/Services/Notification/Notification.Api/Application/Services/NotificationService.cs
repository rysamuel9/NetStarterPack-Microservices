using System.Text.Json;
using BuildingBlocks.Core.Common;
using BuildingBlocks.Core.Constants;
using BuildingBlocks.Core.Contracts;
using BuildingBlocks.Core.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Notification.Api.Application.DTOs;
using Notification.Api.Application.Interfaces;
using Notification.Api.Domain.Entities;
using Notification.Api.Domain.Interfaces;
using Notification.Api.Infrastructure.Persistence;
using Notification.Api.Infrastructure.Senders;

namespace Notification.Api.Application.Services;

public class NotificationService(
    INotificationUnitOfWork unitOfWork,
    ICurrentUserService currentUserService,
    ICacheService cacheService,
    IEventBus eventBus,
    IIdentityRecipientClient recipientClient,
    IEmailTemplateRenderer templateRenderer,
    IEmailSender emailSender,
    IPushNotificationSender pushSender,
    INotificationRealtimeNotifier realtimeNotifier,
    IOptions<EmailSettings> emailOptions,
    ILogger<NotificationService> logger) : INotificationService
{
    private readonly EmailSettings _emailSettings = emailOptions.Value;

    public async Task<Result<int>> IngestEventAsync(
        NotificationIntegrationEvent integrationEvent,
        CancellationToken cancellationToken = default)
    {
        var recipients = await recipientClient.ResolveRecipientsAsync(
            new ResolveRecipientsRequest(
                integrationEvent.TargetUserIds,
                integrationEvent.TargetRoles,
                integrationEvent.ExcludeUserId),
            cancellationToken);

        if (recipients.Count == 0)
        {
            return Result<int>.Success(0, "Tidak ada penerima aktif yang cocok.");
        }

        var template = await GetTemplateEntityOrFallbackAsync(integrationEvent.TemplateCode, cancellationToken);
        var category = string.IsNullOrWhiteSpace(integrationEvent.Category)
            ? template.Category
            : integrationEvent.Category.Trim();

        var recipientIds = recipients.Select(r => r.UserId).Distinct().ToList();
        var existingPreferences = await unitOfWork.Preferences.GetListAsync(
            p => recipientIds.Contains(p.UserId) && p.Category == category,
            cancellationToken);
        var prefByUser = existingPreferences.ToDictionary(p => p.UserId);

        var activeDevices = await unitOfWork.PushDevices.GetListAsync(
            d => recipientIds.Contains(d.UserId) && d.IsActive,
            cancellationToken);
        var devicesByUser = activeDevices
            .GroupBy(d => d.UserId)
            .ToDictionary(g => g.Key, g => g.ToList());

        var createdInApp = new List<(Guid UserId, NotificationItem Item)>();
        var metadataJson = JsonSerializer.Serialize(integrationEvent.Variables ?? new Dictionary<string, string>());

        foreach (var recipient in recipients)
        {
            prefByUser.TryGetValue(recipient.UserId, out var pref);

            var allowInApp = integrationEvent.SendInApp && template.DefaultSendInApp && (pref?.InAppEnabled ?? true);
            var allowEmail = integrationEvent.SendEmail && template.DefaultSendEmail && (pref?.EmailEnabled ?? true);
            var allowPush = integrationEvent.SendPush && template.DefaultSendPush && (pref?.PushEnabled ?? true);

            NotificationItem? createdItem = null;
            if (allowInApp)
            {
                createdItem = new NotificationItem
                {
                    UserId = recipient.UserId,
                    Category = category,
                    TemplateCode = template.Code,
                    Title = integrationEvent.Title.Trim(),
                    Message = integrationEvent.Message.Trim(),
                    Severity = string.IsNullOrWhiteSpace(integrationEvent.Severity) ? "Info" : integrationEvent.Severity.Trim(),
                    ActionUrl = integrationEvent.ActionUrl,
                    EntityId = integrationEvent.EntityId,
                    SourceService = integrationEvent.SourceService,
                    MetadataJson = metadataJson,
                    IsRead = false,
                    CreatedBy = integrationEvent.SourceService
                };

                await unitOfWork.Notifications.AddAsync(createdItem, cancellationToken);
                createdInApp.Add((recipient.UserId, createdItem));
            }

            if (allowEmail && !string.IsNullOrWhiteSpace(recipient.Email))
            {
                var variables = BuildVariables(integrationEvent, recipient, category);
                var devRedirectOrigin = ShouldShowDevRedirectBanner(recipient.Email)
                    ? $"{recipient.Email} ({recipient.FullName})"
                    : null;

                var rendered = await templateRenderer.RenderAsync(
                    template.SubjectTemplate,
                    template.BodyHtmlTemplate,
                    template.AccentColor,
                    template.ActionLabel,
                    integrationEvent.ActionUrl,
                    variables,
                    devRedirectOrigin,
                    cancellationToken);

                await unitOfWork.DeliveryLogs.AddAsync(new NotificationDeliveryLog
                {
                    NotificationItemId = createdItem?.Id,
                    UserId = recipient.UserId,
                    RecipientName = recipient.FullName,
                    RecipientEmail = recipient.Email,
                    EffectiveRecipientEmail = string.IsNullOrWhiteSpace(_emailSettings.DevOverrideRecipient)
                        ? recipient.Email
                        : _emailSettings.DevOverrideRecipient.Trim(),
                    TemplateCode = template.Code,
                    Category = category,
                    Channel = DeliveryChannel.Email,
                    Subject = rendered.Subject,
                    BodyPreview = rendered.PlainTextPreview,
                    RenderedHtml = rendered.HtmlBody,
                    ActionUrl = integrationEvent.ActionUrl,
                    Status = DeliveryStatus.Pending,
                    ProviderName = _emailSettings.ActiveProvider,
                    MaxAttempts = 3,
                    CreatedBy = integrationEvent.SourceService
                }, cancellationToken);
            }

            if (allowPush && devicesByUser.TryGetValue(recipient.UserId, out var userDevices))
            {
                foreach (var device in userDevices)
                {
                    await unitOfWork.DeliveryLogs.AddAsync(new NotificationDeliveryLog
                    {
                        NotificationItemId = createdItem?.Id,
                        UserId = recipient.UserId,
                        RecipientName = recipient.FullName,
                        RecipientPushToken = device.PushToken,
                        TemplateCode = template.Code,
                        Category = category,
                        Channel = DeliveryChannel.Push,
                        Subject = integrationEvent.Title.Trim(),
                        BodyPreview = Truncate(integrationEvent.Message.Trim(), 240),
                        ActionUrl = integrationEvent.ActionUrl,
                        Status = DeliveryStatus.Pending,
                        ProviderName = "ExpoPush",
                        MaxAttempts = 3,
                        CreatedBy = integrationEvent.SourceService
                    }, cancellationToken);
                }
            }
        }

        await unitOfWork.SaveChangesAsync(cancellationToken);
        await cacheService.RemoveAsync(CacheKeys.NotificationStats(), cancellationToken);

        foreach (var (userId, item) in createdInApp)
        {
            await cacheService.RemoveAsync(CacheKeys.NotificationUnreadCount(userId), cancellationToken);
            var unreadCount = await unitOfWork.Notifications.CountAsync(n => n.UserId == userId && !n.IsRead, cancellationToken);
            await realtimeNotifier.NotifyUserAsync(userId, MapNotification(item), unreadCount, cancellationToken);
        }

        logger.LogInformation(
            "[Notification.Api] Ingested event {TemplateCode} ({Category}) for {RecipientCount} recipients.",
            template.Code,
            category,
            recipients.Count);

        return Result<int>.Success(recipients.Count, $"Notifikasi berhasil dijadwalkan untuk {recipients.Count} penerima.");
    }

    public async Task<Result<NotificationListResponse>> GetMyNotificationsAsync(
        string? category = null,
        bool unreadOnly = false,
        int page = 1,
        int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        if (!currentUserService.UserId.HasValue)
        {
            return Result<NotificationListResponse>.Failure("Sesi pengguna tidak valid.", 401);
        }

        var userId = currentUserService.UserId.Value;
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = unitOfWork.Notifications.Query(asNoTracking: true)
            .Where(n => n.UserId == userId);

        if (!string.IsNullOrWhiteSpace(category) && !category.Equals("All", StringComparison.OrdinalIgnoreCase))
        {
            var cat = category.Trim();
            query = query.Where(n => n.Category == cat);
        }

        if (unreadOnly)
        {
            query = query.Where(n => !n.IsRead);
        }

        var totalCount = await query.CountAsync(cancellationToken);
        var unreadCount = await GetUnreadCountCachedAsync(userId, cancellationToken);

        var items = await query
            .OrderByDescending(n => n.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        var totalPages = Math.Max(1, (int)Math.Ceiling(totalCount / (double)pageSize));
        return Result<NotificationListResponse>.Success(new NotificationListResponse(
            items.Select(MapNotification).ToList(),
            totalCount,
            unreadCount,
            page,
            pageSize,
            totalPages));
    }

    public async Task<Result<NotificationBellResponse>> GetBellSummaryAsync(
        int limit = 10,
        CancellationToken cancellationToken = default)
    {
        if (!currentUserService.UserId.HasValue)
        {
            return Result<NotificationBellResponse>.Failure("Sesi pengguna tidak valid.", 401);
        }

        var userId = currentUserService.UserId.Value;
        limit = Math.Clamp(limit, 1, 30);

        var unreadCount = await GetUnreadCountCachedAsync(userId, cancellationToken);
        var recent = await unitOfWork.Notifications.Query(asNoTracking: true)
            .Where(n => n.UserId == userId)
            .OrderBy(n => n.IsRead)
            .ThenByDescending(n => n.CreatedAt)
            .Take(limit)
            .ToListAsync(cancellationToken);

        return Result<NotificationBellResponse>.Success(new NotificationBellResponse(
            unreadCount,
            recent.Select(MapNotification).ToList()));
    }

    public async Task<Result> MarkAsReadAsync(Guid id, CancellationToken cancellationToken = default)
    {
        if (!currentUserService.UserId.HasValue)
        {
            return Result.Failure("Sesi pengguna tidak valid.", 401);
        }

        var userId = currentUserService.UserId.Value;
        var item = await unitOfWork.Notifications.FirstOrDefaultAsync(n => n.Id == id && n.UserId == userId, cancellationToken);
        if (item is null)
        {
            return Result.Failure("Notifikasi tidak ditemukan.", 404);
        }

        if (!item.IsRead)
        {
            item.IsRead = true;
            item.ReadAt = DateTime.UtcNow;
            item.UpdatedAt = DateTime.UtcNow;
            unitOfWork.Notifications.Update(item);
            await unitOfWork.SaveChangesAsync(cancellationToken);

            await cacheService.RemoveAsync(CacheKeys.NotificationUnreadCount(userId), cancellationToken);
            var unreadCount = await GetUnreadCountCachedAsync(userId, cancellationToken);
            await realtimeNotifier.NotifyUnreadCountAsync(userId, unreadCount, cancellationToken);
        }

        return Result.Success("Notifikasi ditandai sudah dibaca.");
    }

    public async Task<Result<int>> MarkAllAsReadAsync(string? category = null, CancellationToken cancellationToken = default)
    {
        if (!currentUserService.UserId.HasValue)
        {
            return Result<int>.Failure("Sesi pengguna tidak valid.", 401);
        }

        var userId = currentUserService.UserId.Value;
        var unreadItems = await unitOfWork.Notifications.GetListAsync(
            n => n.UserId == userId && !n.IsRead &&
                 (string.IsNullOrWhiteSpace(category) || category == "All" || n.Category == category),
            cancellationToken);

        if (unreadItems.Count == 0)
        {
            return Result<int>.Success(0, "Semua notifikasi sudah dibaca.");
        }

        var now = DateTime.UtcNow;
        foreach (var item in unreadItems)
        {
            item.IsRead = true;
            item.ReadAt = now;
            item.UpdatedAt = now;
            unitOfWork.Notifications.Update(item);
        }

        await unitOfWork.SaveChangesAsync(cancellationToken);
        await cacheService.RemoveAsync(CacheKeys.NotificationUnreadCount(userId), cancellationToken);

        var remainingUnread = await GetUnreadCountCachedAsync(userId, cancellationToken);
        await realtimeNotifier.NotifyUnreadCountAsync(userId, remainingUnread, cancellationToken);

        return Result<int>.Success(unreadItems.Count, $"{unreadItems.Count} notifikasi ditandai sudah dibaca.");
    }

    public async Task<Result> DeleteMyNotificationAsync(Guid id, CancellationToken cancellationToken = default)
    {
        if (!currentUserService.UserId.HasValue)
        {
            return Result.Failure("Sesi pengguna tidak valid.", 401);
        }

        var userId = currentUserService.UserId.Value;
        var item = await unitOfWork.Notifications.FirstOrDefaultAsync(n => n.Id == id && n.UserId == userId, cancellationToken);
        if (item is null)
        {
            return Result.Failure("Notifikasi tidak ditemukan.", 404);
        }

        unitOfWork.Notifications.Remove(item);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        await cacheService.RemoveAsync(CacheKeys.NotificationUnreadCount(userId), cancellationToken);
        return Result.Success("Notifikasi dihapus.");
    }

    public async Task<Result<IReadOnlyList<NotificationPreferenceDto>>> GetMyPreferencesAsync(CancellationToken cancellationToken = default)
    {
        if (!currentUserService.UserId.HasValue)
        {
            return Result<IReadOnlyList<NotificationPreferenceDto>>.Failure("Sesi pengguna tidak valid.", 401);
        }

        var userId = currentUserService.UserId.Value;
        var saved = await unitOfWork.Preferences.GetListAsync(p => p.UserId == userId, cancellationToken);
        var byCat = saved.ToDictionary(p => p.Category, StringComparer.OrdinalIgnoreCase);

        var result = NotificationCategories.All
            .Select(cat => byCat.TryGetValue(cat, out var p)
                ? new NotificationPreferenceDto(cat, p.InAppEnabled, p.EmailEnabled, p.PushEnabled)
                : new NotificationPreferenceDto(cat, true, true, true))
            .ToList();

        return Result<IReadOnlyList<NotificationPreferenceDto>>.Success(result);
    }

    public async Task<Result<IReadOnlyList<NotificationPreferenceDto>>> UpdateMyPreferencesAsync(
        UpdateNotificationPreferencesRequest request,
        CancellationToken cancellationToken = default)
    {
        if (!currentUserService.UserId.HasValue)
        {
            return Result<IReadOnlyList<NotificationPreferenceDto>>.Failure("Sesi pengguna tidak valid.", 401);
        }

        var userId = currentUserService.UserId.Value;
        var existing = await unitOfWork.Preferences.GetListAsync(p => p.UserId == userId, cancellationToken);
        var byCat = existing.ToDictionary(p => p.Category, StringComparer.OrdinalIgnoreCase);

        foreach (var prefDto in request.Preferences ?? [])
        {
            var matchedCategory = NotificationCategories.All.FirstOrDefault(c =>
                c.Equals(prefDto.Category, StringComparison.OrdinalIgnoreCase));
            if (matchedCategory is null) continue;

            if (byCat.TryGetValue(matchedCategory, out var entity))
            {
                entity.InAppEnabled = prefDto.InAppEnabled;
                entity.EmailEnabled = prefDto.EmailEnabled;
                entity.PushEnabled = prefDto.PushEnabled;
                entity.UpdatedAt = DateTime.UtcNow;
                entity.UpdatedBy = currentUserService.Username;
                unitOfWork.Preferences.Update(entity);
            }
            else
            {
                await unitOfWork.Preferences.AddAsync(new NotificationPreference
                {
                    UserId = userId,
                    Category = matchedCategory,
                    InAppEnabled = prefDto.InAppEnabled,
                    EmailEnabled = prefDto.EmailEnabled,
                    PushEnabled = prefDto.PushEnabled,
                    CreatedBy = currentUserService.Username
                }, cancellationToken);
            }
        }

        await unitOfWork.SaveChangesAsync(cancellationToken);
        return await GetMyPreferencesAsync(cancellationToken);
    }

    public async Task<Result<IReadOnlyList<UserPushDeviceDto>>> GetMyDevicesAsync(CancellationToken cancellationToken = default)
    {
        if (!currentUserService.UserId.HasValue)
        {
            return Result<IReadOnlyList<UserPushDeviceDto>>.Failure("Sesi pengguna tidak valid.", 401);
        }

        var userId = currentUserService.UserId.Value;
        var devices = await unitOfWork.PushDevices.GetListAsync(d => d.UserId == userId, cancellationToken);
        var result = devices
            .OrderByDescending(d => d.LastSeenAt)
            .Select(MapDevice)
            .ToList();

        return Result<IReadOnlyList<UserPushDeviceDto>>.Success(result);
    }

    public async Task<Result<UserPushDeviceDto>> RegisterDeviceAsync(
        RegisterPushDeviceRequest request,
        CancellationToken cancellationToken = default)
    {
        if (!currentUserService.UserId.HasValue)
        {
            return Result<UserPushDeviceDto>.Failure("Sesi pengguna tidak valid.", 401);
        }

        if (string.IsNullOrWhiteSpace(request.PushToken))
        {
            return Result<UserPushDeviceDto>.Failure("PushToken wajib diisi.", 400);
        }

        var userId = currentUserService.UserId.Value;
        var token = request.PushToken.Trim();
        var platform = string.IsNullOrWhiteSpace(request.Platform) ? "android" : request.Platform.Trim().ToLowerInvariant();
        var deviceName = string.IsNullOrWhiteSpace(request.DeviceName) ? $"Device ({platform})" : request.DeviceName.Trim();

        var existing = await unitOfWork.PushDevices.FirstOrDefaultAsync(
            d => d.UserId == userId && d.PushToken == token,
            cancellationToken);

        if (existing is not null)
        {
            existing.Platform = platform;
            existing.DeviceName = deviceName;
            existing.IsActive = true;
            existing.LastSeenAt = DateTime.UtcNow;
            existing.UpdatedAt = DateTime.UtcNow;
            unitOfWork.PushDevices.Update(existing);
            await unitOfWork.SaveChangesAsync(cancellationToken);
            return Result<UserPushDeviceDto>.Success(MapDevice(existing), "Perangkat push diperbarui.");
        }

        var device = new UserPushDevice
        {
            UserId = userId,
            Username = currentUserService.Username ?? "user",
            PushToken = token,
            Platform = platform,
            DeviceName = deviceName,
            IsActive = true,
            LastSeenAt = DateTime.UtcNow,
            CreatedBy = currentUserService.Username
        };

        await unitOfWork.PushDevices.AddAsync(device, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        await cacheService.RemoveAsync(CacheKeys.NotificationStats(), cancellationToken);

        return Result<UserPushDeviceDto>.Success(MapDevice(device), "Perangkat push berhasil didaftarkan.");
    }

    public async Task<Result> UnregisterDeviceAsync(string pushToken, CancellationToken cancellationToken = default)
    {
        if (!currentUserService.UserId.HasValue)
        {
            return Result.Failure("Sesi pengguna tidak valid.", 401);
        }

        if (string.IsNullOrWhiteSpace(pushToken))
        {
            return Result.Success("Tidak ada token untuk dihapus.");
        }

        var userId = currentUserService.UserId.Value;
        var existing = await unitOfWork.PushDevices.FirstOrDefaultAsync(
            d => d.UserId == userId && d.PushToken == pushToken.Trim(),
            cancellationToken);

        if (existing is not null)
        {
            existing.IsActive = false;
            existing.UpdatedAt = DateTime.UtcNow;
            unitOfWork.PushDevices.Update(existing);
            await unitOfWork.SaveChangesAsync(cancellationToken);
        }

        return Result.Success("Perangkat push dinonaktifkan.");
    }

    public async Task<Result> RemoveDeviceByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        if (!currentUserService.UserId.HasValue)
        {
            return Result.Failure("Sesi pengguna tidak valid.", 401);
        }

        var userId = currentUserService.UserId.Value;
        var device = await unitOfWork.PushDevices.FirstOrDefaultAsync(d => d.Id == id && d.UserId == userId, cancellationToken);
        if (device is null)
        {
            return Result.Failure("Perangkat tidak ditemukan.", 404);
        }

        unitOfWork.PushDevices.Remove(device);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        return Result.Success("Perangkat berhasil dihapus.");
    }

    public async Task<Result<int>> SendTestPushToMeAsync(
        SendTestPushRequest? request = null,
        CancellationToken cancellationToken = default)
    {
        if (!currentUserService.UserId.HasValue)
        {
            return Result<int>.Failure("Sesi pengguna tidak valid.", 401);
        }

        var userId = currentUserService.UserId.Value;
        var title = string.IsNullOrWhiteSpace(request?.Title) ? "Tes Push Notification NetStarterPack" : request.Title.Trim();
        var body = string.IsNullOrWhiteSpace(request?.Message)
            ? $"Halo {currentUserService.FullName ?? currentUserService.Username}! Jalur real-time SignalR & Expo Push berhasil terhubung."
            : request.Message.Trim();

        // Buat juga in-app item supaya langsung muncul live via SignalR (dan local notif di Expo Go)
        var inApp = new NotificationItem
        {
            UserId = userId,
            Category = NotificationCategories.System,
            TemplateCode = NotificationTemplateCodes.Generic,
            Title = title,
            Message = body,
            Severity = "Success",
            ActionUrl = "/notifications",
            SourceService = "Notification.Api",
            CreatedBy = currentUserService.Username ?? "System"
        };
        await unitOfWork.Notifications.AddAsync(inApp, cancellationToken);

        var devices = await unitOfWork.PushDevices.GetListAsync(d => d.UserId == userId && d.IsActive, cancellationToken);
        foreach (var device in devices)
        {
            var sendResult = await pushSender.SendAsync(
                device.PushToken,
                title,
                body,
                new Dictionary<string, string> { ["actionUrl"] = "/notifications", ["notificationId"] = inApp.Id.ToString() },
                cancellationToken);

            await unitOfWork.DeliveryLogs.AddAsync(new NotificationDeliveryLog
            {
                NotificationItemId = inApp.Id,
                UserId = userId,
                RecipientName = currentUserService.FullName ?? currentUserService.Username ?? "User",
                RecipientPushToken = device.PushToken,
                TemplateCode = NotificationTemplateCodes.Generic,
                Category = NotificationCategories.System,
                Channel = DeliveryChannel.Push,
                Subject = title,
                BodyPreview = body,
                ActionUrl = "/notifications",
                Status = sendResult.Succeeded
                    ? (sendResult.IsSimulated ? DeliveryStatus.Simulated : DeliveryStatus.Sent)
                    : DeliveryStatus.Failed,
                ProviderName = sendResult.ProviderName,
                AttemptCount = 1,
                MaxAttempts = 1,
                LastError = sendResult.ErrorMessage,
                SentAt = sendResult.Succeeded ? DateTime.UtcNow : null,
                CreatedBy = currentUserService.Username
            }, cancellationToken);
        }

        await unitOfWork.SaveChangesAsync(cancellationToken);
        await cacheService.RemoveAsync(CacheKeys.NotificationUnreadCount(userId), cancellationToken);
        var unreadCount = await GetUnreadCountCachedAsync(userId, cancellationToken);
        await realtimeNotifier.NotifyUserAsync(userId, MapNotification(inApp), unreadCount, cancellationToken);

        return Result<int>.Success(devices.Count, $"Tes notifikasi dikirim (In-App SignalR + {devices.Count} perangkat push terdaftar).");
    }

    public async Task<Result<IReadOnlyList<NotificationTemplateDto>>> GetTemplatesAsync(CancellationToken cancellationToken = default)
    {
        var templates = await cacheService.GetOrCreateAsync(
            CacheKeys.NotificationTemplates(),
            async ct =>
            {
                var entities = await unitOfWork.Templates.GetListAsync(cancellationToken: ct);
                return entities
                    .OrderBy(t => t.Category)
                    .ThenBy(t => t.Name)
                    .Select(MapTemplate)
                    .ToList();
            },
            TimeSpan.FromMinutes(15),
            cancellationToken);

        return Result<IReadOnlyList<NotificationTemplateDto>>.Success(templates);
    }

    public async Task<Result<NotificationTemplateDto>> GetTemplateByCodeAsync(string code, CancellationToken cancellationToken = default)
    {
        var normalized = code.Trim().ToUpperInvariant();
        var template = await unitOfWork.Templates.FirstOrDefaultAsync(t => t.Code == normalized, cancellationToken);
        if (template is null)
        {
            return Result<NotificationTemplateDto>.Failure($"Template '{normalized}' tidak ditemukan.", 404);
        }

        return Result<NotificationTemplateDto>.Success(MapTemplate(template));
    }

    public async Task<Result<NotificationTemplateDto>> UpdateTemplateAsync(
        string code,
        UpdateNotificationTemplateRequest request,
        CancellationToken cancellationToken = default)
    {
        var normalized = code.Trim().ToUpperInvariant();
        var template = await unitOfWork.Templates.FirstOrDefaultAsync(t => t.Code == normalized, cancellationToken);
        if (template is null)
        {
            return Result<NotificationTemplateDto>.Failure($"Template '{normalized}' tidak ditemukan.", 404);
        }

        if (string.IsNullOrWhiteSpace(request.SubjectTemplate) || string.IsNullOrWhiteSpace(request.BodyHtmlTemplate))
        {
            return Result<NotificationTemplateDto>.Failure("Subject dan Body HTML template wajib diisi.", 400);
        }

        template.Name = string.IsNullOrWhiteSpace(request.Name) ? template.Name : request.Name.Trim();
        template.Description = request.Description?.Trim() ?? string.Empty;
        template.SubjectTemplate = request.SubjectTemplate.Trim();
        template.BodyHtmlTemplate = request.BodyHtmlTemplate;
        template.AccentColor = string.IsNullOrWhiteSpace(request.AccentColor) ? template.AccentColor : request.AccentColor.Trim();
        template.ActionLabel = string.IsNullOrWhiteSpace(request.ActionLabel) ? template.ActionLabel : request.ActionLabel.Trim();
        template.DefaultSendInApp = request.DefaultSendInApp;
        template.DefaultSendEmail = request.DefaultSendEmail;
        template.DefaultSendPush = request.DefaultSendPush;
        template.IsActive = request.IsActive;
        template.UpdatedAt = DateTime.UtcNow;
        template.UpdatedBy = currentUserService.Username;

        unitOfWork.Templates.Update(template);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        await cacheService.RemoveByPrefixAsync(CacheKeys.NotificationsPrefix, cancellationToken);

        await eventBus.PublishAuditAsync(new AuditLogIntegrationEvent(
            currentUserService.UserId,
            currentUserService.Username ?? "System",
            "UPDATE_NOTIFICATION_TEMPLATE",
            "Notifications",
            template.Code,
            $"[Notification.Api] Memperbarui template email '{template.Code}' ({template.Name}).",
            currentUserService.IpAddress,
            "Notification.Api"), cancellationToken);

        return Result<NotificationTemplateDto>.Success(MapTemplate(template), "Template email berhasil diperbarui.");
    }

    public async Task<Result<NotificationTemplateDto>> ResetTemplateToDefaultAsync(
        string code,
        CancellationToken cancellationToken = default)
    {
        var normalized = code.Trim().ToUpperInvariant();
        var template = await unitOfWork.Templates.FirstOrDefaultAsync(t => t.Code == normalized, cancellationToken);
        if (template is null)
        {
            return Result<NotificationTemplateDto>.Failure($"Template '{normalized}' tidak ditemukan.", 404);
        }

        var def = NotificationDatabaseSeeder.GetDefaultTemplateDefinitions()
            .FirstOrDefault(d => d.Code.Equals(normalized, StringComparison.OrdinalIgnoreCase));

        var defaultHtml = await templateRenderer.LoadDefaultBodyHtmlAsync(template.DefaultFileName, cancellationToken);
        if (string.IsNullOrWhiteSpace(defaultHtml))
        {
            return Result<NotificationTemplateDto>.Failure($"File template default '{template.DefaultFileName}' tidak ditemukan.", 404);
        }

        if (def is not null)
        {
            template.Name = def.Name;
            template.Description = def.Description;
            template.SubjectTemplate = def.SubjectTemplate;
            template.AccentColor = def.AccentColor;
            template.ActionLabel = def.ActionLabel;
        }

        template.BodyHtmlTemplate = defaultHtml;
        template.UpdatedAt = DateTime.UtcNow;
        template.UpdatedBy = currentUserService.Username;

        unitOfWork.Templates.Update(template);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        await cacheService.RemoveByPrefixAsync(CacheKeys.NotificationsPrefix, cancellationToken);

        return Result<NotificationTemplateDto>.Success(MapTemplate(template), "Template berhasil dikembalikan ke file HTML bawaan.");
    }

    public async Task<Result<RenderedEmailResult>> PreviewTemplateAsync(
        string code,
        PreviewTemplateRequest? request = null,
        CancellationToken cancellationToken = default)
    {
        var normalized = code.Trim().ToUpperInvariant();
        var template = await unitOfWork.Templates.FirstOrDefaultAsync(t => t.Code == normalized, cancellationToken);
        if (template is null)
        {
            return Result<RenderedEmailResult>.Failure($"Template '{normalized}' tidak ditemukan.", 404);
        }

        var variables = MergeSampleVariables(template.SampleDataJson, request?.Variables);
        variables["category"] = template.Category;

        var rendered = await templateRenderer.RenderAsync(
            request?.SubjectTemplate ?? template.SubjectTemplate,
            request?.BodyHtmlTemplate ?? template.BodyHtmlTemplate,
            request?.AccentColor ?? template.AccentColor,
            request?.ActionLabel ?? template.ActionLabel,
            "/notifications",
            variables,
            devRedirectOriginalEmail: string.IsNullOrWhiteSpace(_emailSettings.DevOverrideRecipient)
                ? null
                : "preview.target@starterpack.local (Mode Preview)",
            cancellationToken);

        return Result<RenderedEmailResult>.Success(rendered);
    }

    public async Task<Result<NotificationDeliveryLogDto>> SendTestEmailAsync(
        string code,
        SendTestEmailRequest? request = null,
        CancellationToken cancellationToken = default)
    {
        var normalized = code.Trim().ToUpperInvariant();
        var template = await unitOfWork.Templates.FirstOrDefaultAsync(t => t.Code == normalized, cancellationToken);
        if (template is null)
        {
            return Result<NotificationDeliveryLogDto>.Failure($"Template '{normalized}' tidak ditemukan.", 404);
        }

        var targetEmail = !string.IsNullOrWhiteSpace(request?.RecipientEmail)
            ? request.RecipientEmail.Trim()
            : (!string.IsNullOrWhiteSpace(_emailSettings.DevOverrideRecipient)
                ? _emailSettings.DevOverrideRecipient.Trim()
                : "ronysamuel19@gmail.com");

        var variables = MergeSampleVariables(template.SampleDataJson, request?.Variables);
        variables["category"] = template.Category;

        var rendered = await templateRenderer.RenderAsync(
            template.SubjectTemplate,
            template.BodyHtmlTemplate,
            template.AccentColor,
            template.ActionLabel,
            "/notifications",
            variables,
            devRedirectOriginalEmail: null,
            cancellationToken);

        var sendResult = await emailSender.SendAsync(
            targetEmail,
            variables.GetValueOrDefault("recipient_name", "Test Recipient"),
            $"[TEST] {rendered.Subject}",
            rendered.HtmlBody,
            cancellationToken);

        var log = new NotificationDeliveryLog
        {
            UserId = currentUserService.UserId,
            RecipientName = variables.GetValueOrDefault("recipient_name", "Test Recipient"),
            RecipientEmail = targetEmail,
            EffectiveRecipientEmail = sendResult.EffectiveRecipient,
            TemplateCode = template.Code,
            Category = template.Category,
            Channel = DeliveryChannel.Email,
            Subject = $"[TEST] {rendered.Subject}",
            BodyPreview = rendered.PlainTextPreview,
            RenderedHtml = rendered.HtmlBody,
            ActionUrl = "/notifications",
            Status = sendResult.Succeeded
                ? (sendResult.IsSimulated ? DeliveryStatus.Simulated : DeliveryStatus.Sent)
                : DeliveryStatus.Failed,
            ProviderName = sendResult.ProviderName,
            AttemptCount = 1,
            MaxAttempts = 1,
            LastError = sendResult.ErrorMessage,
            SentAt = sendResult.Succeeded ? DateTime.UtcNow : null,
            CreatedBy = currentUserService.Username ?? "System"
        };

        await unitOfWork.DeliveryLogs.AddAsync(log, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        var message = sendResult.Succeeded
            ? (sendResult.IsSimulated
                ? $"Test email disimulasikan (kredensial SMTP '{_emailSettings.ActiveProvider}' belum diisi). Cek log konsol/delivery log."
                : $"Test email berhasil dikirim ke {sendResult.EffectiveRecipient} via {sendResult.ProviderName}.")
            : $"Gagal mengirim test email via {sendResult.ProviderName}: {sendResult.ErrorMessage}";

        return sendResult.Succeeded
            ? Result<NotificationDeliveryLogDto>.Success(MapDeliveryLog(log), message)
            : Result<NotificationDeliveryLogDto>.Failure(message, 502);
    }

    public async Task<Result<IReadOnlyList<NotificationDeliveryLogDto>>> GetDeliveryLogsAsync(
        string? channel = null,
        string? status = null,
        int limit = 100,
        CancellationToken cancellationToken = default)
    {
        limit = Math.Clamp(limit, 1, 250);
        var query = unitOfWork.DeliveryLogs.Query(asNoTracking: true);

        if (!string.IsNullOrWhiteSpace(channel) && Enum.TryParse<DeliveryChannel>(channel, true, out var parsedChannel))
        {
            query = query.Where(d => d.Channel == parsedChannel);
        }

        if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<DeliveryStatus>(status, true, out var parsedStatus))
        {
            query = query.Where(d => d.Status == parsedStatus);
        }

        var logs = await query
            .OrderByDescending(d => d.CreatedAt)
            .Take(limit)
            .ToListAsync(cancellationToken);

        return Result<IReadOnlyList<NotificationDeliveryLogDto>>.Success(logs.Select(MapDeliveryLog).ToList());
    }

    public async Task<Result<NotificationDeliveryLogDto>> RetryDeliveryAsync(
        Guid deliveryLogId,
        CancellationToken cancellationToken = default)
    {
        var log = await unitOfWork.DeliveryLogs.GetByIdAsync(deliveryLogId, cancellationToken);
        if (log is null)
        {
            return Result<NotificationDeliveryLogDto>.Failure("Log pengiriman tidak ditemukan.", 404);
        }

        log.Status = DeliveryStatus.Pending;
        log.AttemptCount = 0;
        log.NextRetryAt = DateTime.UtcNow;
        log.LastError = null;
        log.UpdatedAt = DateTime.UtcNow;
        log.UpdatedBy = currentUserService.Username;

        unitOfWork.DeliveryLogs.Update(log);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        return Result<NotificationDeliveryLogDto>.Success(MapDeliveryLog(log), "Pengiriman dijadwalkan ulang ke antrean worker.");
    }

    public Task<Result<EmailProviderStatusDto>> GetProviderStatusAsync(CancellationToken cancellationToken = default) =>
        Task.FromResult(Result<EmailProviderStatusDto>.Success(emailSender.GetProviderStatus()));

    public async Task<Result<NotificationStatsDto>> GetStatsAsync(CancellationToken cancellationToken = default)
    {
        var stats = await cacheService.GetOrCreateAsync(
            CacheKeys.NotificationStats(),
            async ct =>
            {
                var totalNotifs = await unitOfWork.Notifications.CountAsync(cancellationToken: ct);
                var unreadNotifs = await unitOfWork.Notifications.CountAsync(n => !n.IsRead, ct);
                var pendingDeliveries = await unitOfWork.DeliveryLogs.CountAsync(d => d.Status == DeliveryStatus.Pending || d.Status == DeliveryStatus.Processing, ct);
                var sentDeliveries = await unitOfWork.DeliveryLogs.CountAsync(d => d.Status == DeliveryStatus.Sent || d.Status == DeliveryStatus.Simulated, ct);
                var failedDeliveries = await unitOfWork.DeliveryLogs.CountAsync(d => d.Status == DeliveryStatus.Failed, ct);
                var activeTemplates = await unitOfWork.Templates.CountAsync(t => t.IsActive, ct);
                var registeredDevices = await unitOfWork.PushDevices.CountAsync(d => d.IsActive, ct);

                return new NotificationStatsDto(
                    totalNotifs,
                    unreadNotifs,
                    pendingDeliveries,
                    sentDeliveries,
                    failedDeliveries,
                    activeTemplates,
                    registeredDevices);
            },
            TimeSpan.FromMinutes(2),
            cancellationToken);

        return Result<NotificationStatsDto>.Success(stats);
    }

    private async Task<int> GetUnreadCountCachedAsync(Guid userId, CancellationToken cancellationToken) =>
        await cacheService.GetOrCreateAsync(
            CacheKeys.NotificationUnreadCount(userId),
            ct => unitOfWork.Notifications.CountAsync(n => n.UserId == userId && !n.IsRead, ct),
            TimeSpan.FromMinutes(5),
            cancellationToken);

    private async Task<NotificationTemplate> GetTemplateEntityOrFallbackAsync(string templateCode, CancellationToken cancellationToken)
    {
        var code = string.IsNullOrWhiteSpace(templateCode)
            ? NotificationTemplateCodes.Generic
            : templateCode.Trim().ToUpperInvariant();

        var template = await unitOfWork.Templates.FirstOrDefaultAsync(t => t.Code == code && t.IsActive, cancellationToken)
                       ?? await unitOfWork.Templates.FirstOrDefaultAsync(t => t.Code == NotificationTemplateCodes.Generic, cancellationToken);

        return template ?? new NotificationTemplate
        {
            Code = code,
            Name = code,
            Category = NotificationCategories.System,
            SubjectTemplate = "[NetStarterPack] {{ title }}",
            BodyHtmlTemplate = "<p>Halo <strong>{{ recipient_name }}</strong>,</p><p>{{ message }}</p>",
            AccentColor = "#0D9488",
            ActionLabel = "Buka Aplikasi",
            DefaultSendInApp = true,
            DefaultSendEmail = true,
            DefaultSendPush = true,
            IsActive = true
        };
    }

    private static Dictionary<string, string> BuildVariables(
        NotificationIntegrationEvent evt,
        ResolvedRecipientDto recipient,
        string category)
    {
        var vars = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["recipient_name"] = recipient.FullName,
            ["recipient_email"] = recipient.Email,
            ["recipient_username"] = recipient.Username,
            ["title"] = evt.Title,
            ["message"] = evt.Message,
            ["category"] = category,
            ["source_service"] = evt.SourceService
        };

        if (evt.Variables is not null)
        {
            foreach (var (key, value) in evt.Variables)
            {
                vars[key] = value ?? string.Empty;
            }
        }

        return vars;
    }

    private static Dictionary<string, string> MergeSampleVariables(
        string sampleJson,
        Dictionary<string, string>? overrides)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        try
        {
            var parsed = JsonSerializer.Deserialize<Dictionary<string, string>>(sampleJson);
            if (parsed is not null)
            {
                foreach (var (k, v) in parsed)
                {
                    result[k] = v ?? string.Empty;
                }
            }
        }
        catch
        {
            // Ignore malformed sample JSON
        }

        if (overrides is not null)
        {
            foreach (var (k, v) in overrides)
            {
                result[k] = v ?? string.Empty;
            }
        }

        return result;
    }

    private bool ShouldShowDevRedirectBanner(string originalEmail) =>
        !string.IsNullOrWhiteSpace(_emailSettings.DevOverrideRecipient) &&
        !string.Equals(_emailSettings.DevOverrideRecipient.Trim(), originalEmail.Trim(), StringComparison.OrdinalIgnoreCase);

    private static string Truncate(string text, int maxLength) =>
        text.Length <= maxLength ? text : text[..maxLength] + "...";

    private static NotificationItemDto MapNotification(NotificationItem n) =>
        new(n.Id, n.UserId, n.Category, n.TemplateCode, n.Title, n.Message, n.Severity,
            n.ActionUrl, n.EntityId, n.SourceService, n.IsRead, n.ReadAt, n.CreatedAt);

    private static UserPushDeviceDto MapDevice(UserPushDevice d) =>
        new(d.Id, d.PushToken, d.Platform, d.DeviceName, d.IsActive, d.LastSeenAt);

    private static NotificationTemplateDto MapTemplate(NotificationTemplate t) =>
        new(t.Id, t.Code, t.Name, t.Category, t.Description, t.SubjectTemplate, t.BodyHtmlTemplate,
            t.AccentColor, t.ActionLabel, t.DefaultFileName, t.SampleDataJson,
            t.DefaultSendInApp, t.DefaultSendEmail, t.DefaultSendPush, t.IsActive, t.UpdatedAt ?? t.CreatedAt);

    private static NotificationDeliveryLogDto MapDeliveryLog(NotificationDeliveryLog d) =>
        new(d.Id, d.NotificationItemId, d.UserId, d.RecipientName, d.RecipientEmail, d.EffectiveRecipientEmail,
            d.RecipientPushToken, d.TemplateCode, d.Category, d.Channel.ToString(), d.Subject, d.BodyPreview,
            d.Status.ToString(), d.ProviderName, d.AttemptCount, d.MaxAttempts, d.NextRetryAt,
            d.LastError, d.SentAt, d.CreatedAt);
}
