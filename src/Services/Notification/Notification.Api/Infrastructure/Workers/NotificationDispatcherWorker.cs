using Microsoft.EntityFrameworkCore;
using Notification.Api.Application.Interfaces;
using Notification.Api.Domain.Entities;
using Notification.Api.Infrastructure.Persistence;

namespace Notification.Api.Infrastructure.Workers;

/// <summary>
/// Background Worker (Outbox Dispatcher) yang memproses antrean Email SMTP (Office 365 / Gmail)
/// dan Mobile Push Notification (Expo Push API) secara asinkron di belakang layar dengan retry bertahap.
/// </summary>
public class NotificationDispatcherWorker(
    IServiceScopeFactory scopeFactory,
    ILogger<NotificationDispatcherWorker> logger) : BackgroundService
{
    private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(5);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("[NotificationDispatcherWorker] Background dispatcher started (poll every {Seconds}s).", PollInterval.TotalSeconds);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ProcessPendingDeliveriesAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "[NotificationDispatcherWorker] Terjadi error saat memproses batch antrean notifikasi.");
            }

            try
            {
                await Task.Delay(PollInterval, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    public async Task<int> ProcessPendingDeliveriesAsync(CancellationToken cancellationToken = default)
    {
        using var scope = scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<NotificationDbContext>();
        var emailSender = scope.ServiceProvider.GetRequiredService<IEmailSender>();
        var pushSender = scope.ServiceProvider.GetRequiredService<IPushNotificationSender>();

        var now = DateTime.UtcNow;
        var dueItems = await dbContext.DeliveryLogs
            .Where(d =>
                d.Status == DeliveryStatus.Pending &&
                (d.NextRetryAt == null || d.NextRetryAt <= now))
            .OrderBy(d => d.CreatedAt)
            .Take(20)
            .ToListAsync(cancellationToken);

        if (dueItems.Count == 0)
        {
            return 0;
        }

        foreach (var item in dueItems)
        {
            item.Status = DeliveryStatus.Processing;
            item.AttemptCount++;
            item.UpdatedAt = DateTime.UtcNow;
        }
        await dbContext.SaveChangesAsync(cancellationToken);

        foreach (var item in dueItems)
        {
            if (item.Channel == DeliveryChannel.Email)
            {
                await DispatchEmailItemAsync(item, emailSender, cancellationToken);
            }
            else if (item.Channel == DeliveryChannel.Push)
            {
                await DispatchPushItemAsync(item, pushSender, cancellationToken);
            }

            item.UpdatedAt = DateTime.UtcNow;
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return dueItems.Count;
    }

    private static async Task DispatchEmailItemAsync(
        NotificationDeliveryLog item,
        IEmailSender emailSender,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(item.RecipientEmail))
        {
            item.Status = DeliveryStatus.Skipped;
            item.LastError = "Alamat email penerima kosong.";
            return;
        }

        var result = await emailSender.SendAsync(
            item.RecipientEmail,
            item.RecipientName,
            item.Subject,
            item.RenderedHtml ?? item.BodyPreview,
            cancellationToken);

        item.ProviderName = result.ProviderName;
        item.EffectiveRecipientEmail = result.EffectiveRecipient;

        if (result.Succeeded)
        {
            item.Status = result.IsSimulated ? DeliveryStatus.Simulated : DeliveryStatus.Sent;
            item.SentAt = DateTime.UtcNow;
            item.LastError = null;
            item.NextRetryAt = null;
        }
        else
        {
            ScheduleRetryOrFail(item, result.ErrorMessage ?? "Gagal mengirim email SMTP.");
        }
    }

    private static async Task DispatchPushItemAsync(
        NotificationDeliveryLog item,
        IPushNotificationSender pushSender,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(item.RecipientPushToken))
        {
            item.Status = DeliveryStatus.Skipped;
            item.LastError = "Push token perangkat kosong.";
            return;
        }

        var data = new Dictionary<string, string>
        {
            ["templateCode"] = item.TemplateCode,
            ["category"] = item.Category,
            ["actionUrl"] = item.ActionUrl ?? "/notifications",
            ["notificationId"] = item.NotificationItemId?.ToString() ?? string.Empty
        };

        var result = await pushSender.SendAsync(
            item.RecipientPushToken,
            item.Subject,
            item.BodyPreview,
            data,
            cancellationToken);

        item.ProviderName = result.ProviderName;

        if (result.Succeeded)
        {
            item.Status = result.IsSimulated ? DeliveryStatus.Simulated : DeliveryStatus.Sent;
            item.SentAt = DateTime.UtcNow;
            item.LastError = null;
            item.NextRetryAt = null;
        }
        else
        {
            ScheduleRetryOrFail(item, result.ErrorMessage ?? "Gagal mengirim Expo Push Notification.");
        }
    }

    private static void ScheduleRetryOrFail(NotificationDeliveryLog item, string errorMessage)
    {
        item.LastError = errorMessage.Length <= 1000 ? errorMessage : errorMessage[..1000];
        if (item.AttemptCount < item.MaxAttempts)
        {
            var backoffSeconds = item.AttemptCount switch
            {
                1 => 15,
                2 => 60,
                _ => 180
            };
            item.Status = DeliveryStatus.Pending;
            item.NextRetryAt = DateTime.UtcNow.AddSeconds(backoffSeconds);
        }
        else
        {
            item.Status = DeliveryStatus.Failed;
            item.NextRetryAt = null;
        }
    }
}
