using Announcement.Api.Application.DTOs;

namespace Announcement.Api.Application.Interfaces;

/// <summary>
/// Abstraksi notifikasi realtime pada Application Layer (mengikuti Onion Architecture agar Application tidak terikat langsung pada SignalR).
/// </summary>
public interface IAnnouncementRealtimeNotifier
{
    Task NotifyAnnouncementPublishedAsync(AnnouncementSummaryDto summary, CancellationToken cancellationToken = default);
    Task NotifyCommentAddedAsync(Guid announcementId, AnnouncementCommentDto comment, int totalCommentCount, CancellationToken cancellationToken = default);
    Task NotifyCommentDeletedAsync(Guid announcementId, IReadOnlyList<Guid> deletedCommentIds, int totalCommentCount, CancellationToken cancellationToken = default);
    Task NotifyLikeUpdatedAsync(Guid announcementId, int likeCount, Guid actorUserId, bool isLiked, CancellationToken cancellationToken = default);
    Task NotifyCommentsToggledAsync(Guid announcementId, bool allowComments, CancellationToken cancellationToken = default);
}
