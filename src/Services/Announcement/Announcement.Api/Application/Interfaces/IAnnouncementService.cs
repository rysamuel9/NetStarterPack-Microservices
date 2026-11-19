using BuildingBlocks.Core.Common;
using BuildingBlocks.Core.Contracts;
using Announcement.Api.Application.DTOs;

namespace Announcement.Api.Application.Interfaces;

public interface IAnnouncementService
{
    Task<Result<PagedAnnouncementsDto>> GetAnnouncementsAsync(
        int page = 1,
        int pageSize = 10,
        string? type = null,
        string? search = null,
        CancellationToken cancellationToken = default);

    Task<Result<AnnouncementBellResponseDto>> GetBellFeedAsync(CancellationToken cancellationToken = default);
    Task<Result<AnnouncementDetailDto>> GetAnnouncementByIdAsync(Guid id, bool markAsRead = true, CancellationToken cancellationToken = default);

    // HR Management Actions (HRStaff, HRSupervisor, HRManager, SuperAdmin)
    Task<Result<AnnouncementDetailDto>> CreateAnnouncementAsync(CreateOrUpdateAnnouncementRequest request, CancellationToken cancellationToken = default);
    Task<Result<AnnouncementDetailDto>> UpdateAnnouncementAsync(Guid id, CreateOrUpdateAnnouncementRequest request, CancellationToken cancellationToken = default);
    Task<Result> DeleteAnnouncementAsync(Guid id, CancellationToken cancellationToken = default);
    Task<Result<AnnouncementDetailDto>> ToggleCommentsAsync(Guid id, ToggleCommentsRequest request, CancellationToken cancellationToken = default);

    // User Interactions (Like, Comment, Mark Read)
    Task<Result<ToggleLikeResponseDto>> ToggleLikeAsync(Guid id, CancellationToken cancellationToken = default);
    Task<Result<AnnouncementCommentDto>> AddCommentAsync(Guid id, CreateCommentRequest request, CancellationToken cancellationToken = default);
    Task<Result> DeleteCommentAsync(Guid announcementId, Guid commentId, CancellationToken cancellationToken = default);
    Task<Result> MarkAllAsReadAsync(CancellationToken cancellationToken = default);

    // Stats for Dashboard
    Task<Result<AnnouncementStatsDto>> GetStatsAsync(CancellationToken cancellationToken = default);
}
