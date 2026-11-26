using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Notification.Api.Application.DTOs;
using Notification.Api.Application.Interfaces;

namespace Notification.Api.Infrastructure.Realtime;

/// <summary>
/// SignalR Hub untuk Unified Notification Center (/hubs/notifications).
/// Setiap user yang terautentikasi otomatis masuk ke group personal 'user:{userId}'
/// agar notifikasi in-app dan angka badge lonceng ter-update instan di Web React maupun Mobile Expo.
/// </summary>
[Authorize]
public class NotificationHub : Hub
{
    public static string UserGroup(Guid userId) => $"notification-user-{userId:N}";

    public override async Task OnConnectedAsync()
    {
        var userIdClaim = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier)
                          ?? Context.User?.FindFirstValue("sub");

        if (Guid.TryParse(userIdClaim, out var userId))
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, UserGroup(userId));
        }

        await base.OnConnectedAsync();
    }
}

public class SignalRNotificationRealtimeNotifier(
    IHubContext<NotificationHub> hubContext,
    ILogger<SignalRNotificationRealtimeNotifier> logger) : INotificationRealtimeNotifier
{
    public async Task NotifyUserAsync(
        Guid userId,
        NotificationItemDto notification,
        int unreadCount,
        CancellationToken cancellationToken = default)
    {
        try
        {
            await hubContext.Clients.Group(NotificationHub.UserGroup(userId))
                .SendAsync("NotificationReceived", new { notification, unreadCount }, cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "[SignalR] Gagal mengirim NotificationReceived ke user {UserId}.", userId);
        }
    }

    public async Task NotifyUnreadCountAsync(
        Guid userId,
        int unreadCount,
        CancellationToken cancellationToken = default)
    {
        try
        {
            await hubContext.Clients.Group(NotificationHub.UserGroup(userId))
                .SendAsync("UnreadCountUpdated", new { unreadCount }, cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "[SignalR] Gagal mengirim UnreadCountUpdated ke user {UserId}.", userId);
        }
    }
}
