using Announcement.Api.Application.DTOs;
using Announcement.Api.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace Announcement.Api.Infrastructure.Realtime;

/// <summary>
/// ASP.NET Core SignalR Hub untuk pembaruan realtime pengumuman (komentar, balasan, like, toggle komentar, &amp; notifikasi bel).
/// Diautentikasi menggunakan Zero-Trust JWT yang sama (via query string ?access_token= pada koneksi WebSocket).
/// </summary>
[Authorize]
public class AnnouncementHub : Hub
{
    public static string RoomName(Guid announcementId) => $"announcement-{announcementId:N}";
    public static string RoomName(string announcementId) =>
        Guid.TryParse(announcementId, out var parsed) ? RoomName(parsed) : $"announcement-{announcementId}";

    public Task JoinAnnouncementRoom(string announcementId) =>
        Groups.AddToGroupAsync(Context.ConnectionId, RoomName(announcementId));

    public Task LeaveAnnouncementRoom(string announcementId) =>
        Groups.RemoveFromGroupAsync(Context.ConnectionId, RoomName(announcementId));
}

/// <summary>
/// Implementasi IAnnouncementRealtimeNotifier berbasis SignalR dengan try-catch safe fallback
/// agar gangguan WebSocket sementara tidak pernah menggagalkan transaksi utama di database.
/// </summary>
public class SignalRAnnouncementRealtimeNotifier(
    IHubContext<AnnouncementHub> hubContext,
    ILogger<SignalRAnnouncementRealtimeNotifier> logger) : IAnnouncementRealtimeNotifier
{
    public async Task NotifyAnnouncementPublishedAsync(AnnouncementSummaryDto summary, CancellationToken cancellationToken = default)
    {
        try
        {
            await hubContext.Clients.All.SendAsync("AnnouncementPublished", summary, cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "[SignalR] Gagal broadcast AnnouncementPublished untuk {AnnouncementId}.", summary.Id);
        }
    }

    public async Task NotifyCommentAddedAsync(
        Guid announcementId,
        AnnouncementCommentDto comment,
        int totalCommentCount,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var payload = new
            {
                announcementId,
                comment,
                commentCount = totalCommentCount
            };

            // Kirim payload komentar lengkap ke user yang sedang membuka detail pengumuman ini
            await hubContext.Clients.Group(AnnouncementHub.RoomName(announcementId))
                .SendAsync("CommentAdded", payload, cancellationToken);

            // Kirim update angka komentar ringan ke semua user di halaman list feed
            await hubContext.Clients.All.SendAsync("AnnouncementStatsChanged", new
            {
                announcementId,
                commentCount = totalCommentCount
            }, cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "[SignalR] Gagal broadcast CommentAdded untuk {AnnouncementId}.", announcementId);
        }
    }

    public async Task NotifyCommentDeletedAsync(
        Guid announcementId,
        IReadOnlyList<Guid> deletedCommentIds,
        int totalCommentCount,
        CancellationToken cancellationToken = default)
    {
        try
        {
            await hubContext.Clients.Group(AnnouncementHub.RoomName(announcementId))
                .SendAsync("CommentDeleted", new
                {
                    announcementId,
                    deletedCommentIds,
                    commentCount = totalCommentCount
                }, cancellationToken);

            await hubContext.Clients.All.SendAsync("AnnouncementStatsChanged", new
            {
                announcementId,
                commentCount = totalCommentCount
            }, cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "[SignalR] Gagal broadcast CommentDeleted untuk {AnnouncementId}.", announcementId);
        }
    }

    public async Task NotifyLikeUpdatedAsync(
        Guid announcementId,
        int likeCount,
        Guid actorUserId,
        bool isLiked,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var payload = new
            {
                announcementId,
                likeCount,
                actorUserId,
                isLiked
            };

            await hubContext.Clients.Group(AnnouncementHub.RoomName(announcementId))
                .SendAsync("LikeUpdated", payload, cancellationToken);

            await hubContext.Clients.All.SendAsync("AnnouncementStatsChanged", new
            {
                announcementId,
                likeCount,
                actorUserId,
                isLiked
            }, cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "[SignalR] Gagal broadcast LikeUpdated untuk {AnnouncementId}.", announcementId);
        }
    }

    public async Task NotifyCommentsToggledAsync(
        Guid announcementId,
        bool allowComments,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var payload = new { announcementId, allowComments };

            await hubContext.Clients.Group(AnnouncementHub.RoomName(announcementId))
                .SendAsync("CommentsToggled", payload, cancellationToken);

            await hubContext.Clients.All.SendAsync("AnnouncementStatsChanged", payload, cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "[SignalR] Gagal broadcast CommentsToggled untuk {AnnouncementId}.", announcementId);
        }
    }
}
