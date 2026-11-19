using Announcement.Api.Application.DTOs;
using Announcement.Api.Application.Interfaces;

namespace NetStarterPack.Microservices.UnitTests.Common.TestDoubles;

/// <summary>
/// Recorder untuk verifikasi event SignalR realtime dari AnnouncementService tanpa butuh Hub aktif.
/// </summary>
public sealed class FakeAnnouncementRealtimeNotifier : IAnnouncementRealtimeNotifier
{
    public List<string> Events { get; } = new();

    public Task NotifyAnnouncementPublishedAsync(AnnouncementSummaryDto summary, CancellationToken cancellationToken = default)
    {
        Events.Add($"Published:{summary.Id}");
        return Task.CompletedTask;
    }

    public Task NotifyCommentAddedAsync(Guid announcementId, AnnouncementCommentDto comment, int totalCommentCount, CancellationToken cancellationToken = default)
    {
        Events.Add($"CommentAdded:{comment.Id}:{totalCommentCount}");
        return Task.CompletedTask;
    }

    public Task NotifyCommentDeletedAsync(Guid announcementId, IReadOnlyList<Guid> deletedCommentIds, int totalCommentCount, CancellationToken cancellationToken = default)
    {
        Events.Add($"CommentDeleted:{deletedCommentIds.Count}:{totalCommentCount}");
        return Task.CompletedTask;
    }

    public Task NotifyLikeUpdatedAsync(Guid announcementId, int likeCount, Guid actorUserId, bool isLiked, CancellationToken cancellationToken = default)
    {
        Events.Add($"LikeUpdated:{likeCount}:{isLiked}");
        return Task.CompletedTask;
    }

    public Task NotifyCommentsToggledAsync(Guid announcementId, bool allowComments, CancellationToken cancellationToken = default)
    {
        Events.Add($"CommentsToggled:{allowComments}");
        return Task.CompletedTask;
    }
}
