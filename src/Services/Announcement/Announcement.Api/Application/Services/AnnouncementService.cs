using System.Text.RegularExpressions;
using Announcement.Api.Application.DTOs;
using Announcement.Api.Application.Interfaces;
using Announcement.Api.Domain.Entities;
using Announcement.Api.Domain.Interfaces;
using BuildingBlocks.Core.Common;
using BuildingBlocks.Core.Constants;
using BuildingBlocks.Core.Contracts;
using BuildingBlocks.Core.Interfaces;
using Ganss.Xss;

namespace Announcement.Api.Application.Services;

public partial class AnnouncementService(
    IAnnouncementUnitOfWork unitOfWork,
    ICurrentUserService currentUserService,
    ICacheService cacheService,
    IEventBus eventBus,
    IAnnouncementRealtimeNotifier? realtimeNotifier = null) : IAnnouncementService
{
    private static readonly HashSet<string> AllowedHrPublisherRoles = new(StringComparer.OrdinalIgnoreCase)
    {
        RoleNames.SuperAdmin,
        RoleNames.HRStaff,
        RoleNames.HRSupervisor,
        RoleNames.HRManager
    };

    public async Task<Result<PagedAnnouncementsDto>> GetAnnouncementsAsync(
        int page = 1,
        int pageSize = 10,
        string? type = null,
        string? search = null,
        CancellationToken cancellationToken = default)
    {
        var normalizedPage = Math.Max(1, page);
        var normalizedPageSize = Math.Clamp(pageSize, 1, 50);

        var (items, totalCount) = await unitOfWork.Announcements.GetPagedAsync(
            normalizedPage, normalizedPageSize, type, search, cancellationToken);

        var userId = currentUserService.UserId ?? Guid.Empty;
        var allPublished = await unitOfWork.Announcements.GetPublishedWithInteractionsAsync(cancellationToken);
        var unreadCount = allPublished.Count(a => !a.Reads.Any(r => r.UserId == userId));

        var mapped = items.Select(a => MapSummary(a, userId)).ToList();
        var totalPages = totalCount == 0 ? 1 : (int)Math.Ceiling(totalCount / (double)normalizedPageSize);

        return Result<PagedAnnouncementsDto>.Success(new PagedAnnouncementsDto(
            Items: mapped,
            Page: normalizedPage,
            PageSize: normalizedPageSize,
            TotalCount: totalCount,
            TotalPages: totalPages,
            UnreadCount: unreadCount));
    }

    public async Task<Result<AnnouncementBellResponseDto>> GetBellFeedAsync(CancellationToken cancellationToken = default)
    {
        var userId = currentUserService.UserId ?? Guid.Empty;
        var allPublished = await unitOfWork.Announcements.GetPublishedWithInteractionsAsync(cancellationToken);

        var unreadList = allPublished
            .Where(a => !a.Reads.Any(r => r.UserId == userId))
            .OrderByDescending(a => a.PublishedAt)
            .ToList();

        // Tampilkan pengumuman yang belum dibaca (maksimal 5 terbaru), atau jika semua sudah dibaca tampilkan 3 terbaru
        var bellItems = unreadList.Count > 0
            ? unreadList.Take(5).Select(a => MapSummary(a, userId)).ToList()
            : allPublished.OrderByDescending(a => a.PublishedAt).Take(3).Select(a => MapSummary(a, userId)).ToList();

        return Result<AnnouncementBellResponseDto>.Success(new AnnouncementBellResponseDto(
            UnreadCount: unreadList.Count,
            Items: bellItems));
    }

    public async Task<Result<AnnouncementDetailDto>> GetAnnouncementByIdAsync(
        Guid id,
        bool markAsRead = true,
        CancellationToken cancellationToken = default)
    {
        var announcement = await unitOfWork.Announcements.GetByIdWithDetailsAsync(id, cancellationToken);
        if (announcement is null)
        {
            return Result<AnnouncementDetailDto>.Failure("Pengumuman tidak ditemukan.", 404);
        }

        var userId = currentUserService.UserId ?? Guid.Empty;
        if (markAsRead && userId != Guid.Empty && !announcement.Reads.Any(r => r.UserId == userId))
        {
            var readEntry = new AnnouncementRead
            {
                AnnouncementId = announcement.Id,
                UserId = userId,
                ReadAt = DateTime.UtcNow,
                CreatedBy = currentUserService.Username ?? "System"
            };
            await unitOfWork.Reads.AddAsync(readEntry, cancellationToken);
            if (!announcement.Reads.Any(r => r.UserId == userId))
            {
                announcement.Reads.Add(readEntry);
            }
            await unitOfWork.SaveChangesAsync(cancellationToken);
        }

        return Result<AnnouncementDetailDto>.Success(MapDetail(announcement, userId));
    }

    public async Task<Result<AnnouncementDetailDto>> CreateAnnouncementAsync(
        CreateOrUpdateAnnouncementRequest request,
        CancellationToken cancellationToken = default)
    {
        if (!IsAuthorizedHrPublisher())
        {
            return Result<AnnouncementDetailDto>.Failure(
                "Hanya tim HR (HRStaff, HRSupervisor, HRManager) yang diizinkan membuat pengumuman.", 403);
        }

        if (string.IsNullOrWhiteSpace(request.Title))
        {
            return Result<AnnouncementDetailDto>.Failure("Judul pengumuman wajib diisi.", 400);
        }

        var sanitizedHtml = SanitizeRichHtml(request.ContentHtml);
        if (string.IsNullOrWhiteSpace(StripHtmlTags(sanitizedHtml)))
        {
            return Result<AnnouncementDetailDto>.Failure("Isi konten pengumuman tidak boleh kosong.", 400);
        }

        if (!Enum.TryParse<AnnouncementType>(request.Type, true, out var announcementType))
        {
            announcementType = AnnouncementType.General;
        }

        var authorId = currentUserService.UserId ?? Guid.Empty;
        var authorUsername = currentUserService.Username ?? "hrstaff";
        var authorFullName = currentUserService.FullName ?? authorUsername;
        var authorRole = currentUserService.Roles.FirstOrDefault() ?? RoleNames.HRStaff;

        var summary = string.IsNullOrWhiteSpace(request.Summary)
            ? BuildExcerpt(sanitizedHtml, 170)
            : request.Summary.Trim();

        var sanitizedBannerUrl = NormalizeSafeAssetUrl(request.BannerUrl);
        if (!string.IsNullOrWhiteSpace(request.BannerUrl) && sanitizedBannerUrl is null)
        {
            return Result<AnnouncementDetailDto>.Failure("URL banner tidak valid. Gunakan file yang diunggah melalui endpoint upload internal.", 400);
        }

        var entity = new Domain.Entities.Announcement
        {
            Title = request.Title.Trim(),
            Summary = summary,
            Type = announcementType,
            ContentHtml = sanitizedHtml,
            BannerUrl = sanitizedBannerUrl,
            AllowComments = request.AllowComments,
            IsPinned = request.IsPinned,
            IsPublished = true,
            PublishedAt = DateTime.UtcNow,
            AuthorUserId = authorId,
            AuthorUsername = authorUsername,
            AuthorFullName = authorFullName,
            AuthorRole = authorRole,
            CreatedBy = authorUsername
        };

        if (request.Attachments is { Count: > 0 })
        {
            foreach (var att in request.Attachments)
            {
                var safeAttachmentUrl = NormalizeSafeAssetUrl(att.Url);
                if (safeAttachmentUrl is null)
                {
                    return Result<AnnouncementDetailDto>.Failure(
                        $"URL lampiran '{att.FileName}' tidak valid. Gunakan file yang diunggah melalui endpoint upload internal.", 400);
                }

                if (!Enum.TryParse<AttachmentKind>(att.Kind, true, out var kind))
                {
                    kind = AttachmentKind.File;
                }

                entity.Attachments.Add(new AnnouncementAttachment
                {
                    AnnouncementId = entity.Id,
                    FileName = att.FileName.Trim(),
                    StoredFileName = att.StoredFileName.Trim(),
                    ContentType = att.ContentType,
                    FileSizeBytes = att.FileSizeBytes,
                    Kind = kind,
                    Url = safeAttachmentUrl,
                    CreatedBy = authorUsername
                });
            }
        }

        // Pembuat pengumuman otomatis dianggap sudah membaca pengumumannya sendiri
        if (authorId != Guid.Empty)
        {
            entity.Reads.Add(new AnnouncementRead
            {
                AnnouncementId = entity.Id,
                UserId = authorId,
                ReadAt = DateTime.UtcNow,
                CreatedBy = authorUsername
            });
        }

        await unitOfWork.Announcements.AddAsync(entity, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        await InvalidateCacheAsync(cancellationToken);

        await eventBus.PublishAuditAsync(new AuditLogIntegrationEvent(
            UserId: authorId,
            UserName: authorUsername,
            Action: "PUBLISH_ANNOUNCEMENT",
            Module: "Announcements",
            EntityId: entity.Id.ToString(),
            Details: $"[Announcement.Api] {authorFullName} ({authorRole}) menerbitkan pengumuman '{entity.Title}' ({entity.Type}, Komentar: {(entity.AllowComments ? "Aktif" : "Nonaktif")}).",
            IpAddress: currentUserService.IpAddress,
            SourceService: "Announcement.Api"), cancellationToken);

        if (realtimeNotifier is not null)
        {
            await realtimeNotifier.NotifyAnnouncementPublishedAsync(MapSummary(entity, Guid.Empty), cancellationToken);
        }

        return Result<AnnouncementDetailDto>.Success(
            MapDetail(entity, authorId),
            "Pengumuman berhasil diterbitkan.",
            201);
    }

    public async Task<Result<AnnouncementDetailDto>> UpdateAnnouncementAsync(
        Guid id,
        CreateOrUpdateAnnouncementRequest request,
        CancellationToken cancellationToken = default)
    {
        if (!IsAuthorizedHrPublisher())
        {
            return Result<AnnouncementDetailDto>.Failure(
                "Hanya tim HR (HRStaff, HRSupervisor, HRManager) yang diizinkan mengubah pengumuman.", 403);
        }

        var entity = await unitOfWork.Announcements.GetByIdWithDetailsAsync(id, cancellationToken);
        if (entity is null)
        {
            return Result<AnnouncementDetailDto>.Failure("Pengumuman tidak ditemukan.", 404);
        }

        if (string.IsNullOrWhiteSpace(request.Title))
        {
            return Result<AnnouncementDetailDto>.Failure("Judul pengumuman wajib diisi.", 400);
        }

        var sanitizedHtml = SanitizeRichHtml(request.ContentHtml);
        if (string.IsNullOrWhiteSpace(StripHtmlTags(sanitizedHtml)))
        {
            return Result<AnnouncementDetailDto>.Failure("Isi konten pengumuman tidak boleh kosong.", 400);
        }

        if (!Enum.TryParse<AnnouncementType>(request.Type, true, out var announcementType))
        {
            announcementType = entity.Type;
        }

        var sanitizedBannerUrl = NormalizeSafeAssetUrl(request.BannerUrl);
        if (!string.IsNullOrWhiteSpace(request.BannerUrl) && sanitizedBannerUrl is null)
        {
            return Result<AnnouncementDetailDto>.Failure("URL banner tidak valid. Gunakan file yang diunggah melalui endpoint upload internal.", 400);
        }

        if (request.Attachments is not null)
        {
            foreach (var att in request.Attachments)
            {
                if (NormalizeSafeAssetUrl(att.Url) is null)
                {
                    return Result<AnnouncementDetailDto>.Failure(
                        $"URL lampiran '{att.FileName}' tidak valid. Gunakan file yang diunggah melalui endpoint upload internal.", 400);
                }
            }
        }

        var username = currentUserService.Username ?? "hrstaff";
        entity.Title = request.Title.Trim();
        entity.Summary = string.IsNullOrWhiteSpace(request.Summary)
            ? BuildExcerpt(sanitizedHtml, 170)
            : request.Summary.Trim();
        entity.Type = announcementType;
        entity.ContentHtml = sanitizedHtml;
        entity.BannerUrl = sanitizedBannerUrl;
        entity.AllowComments = request.AllowComments;
        entity.IsPinned = request.IsPinned;
        entity.UpdatedAt = DateTime.UtcNow;
        entity.UpdatedBy = username;

        if (request.Attachments is not null)
        {
            foreach (var oldAtt in entity.Attachments.ToList())
            {
                unitOfWork.Attachments.Remove(oldAtt);
            }

            foreach (var att in request.Attachments)
            {
                if (!Enum.TryParse<AttachmentKind>(att.Kind, true, out var kind))
                {
                    kind = AttachmentKind.File;
                }

                await unitOfWork.Attachments.AddAsync(new AnnouncementAttachment
                {
                    AnnouncementId = entity.Id,
                    FileName = att.FileName.Trim(),
                    StoredFileName = att.StoredFileName.Trim(),
                    ContentType = att.ContentType,
                    FileSizeBytes = att.FileSizeBytes,
                    Kind = kind,
                    Url = NormalizeSafeAssetUrl(att.Url)!,
                    CreatedBy = username
                }, cancellationToken);
            }
        }

        unitOfWork.Announcements.Update(entity);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        await InvalidateCacheAsync(cancellationToken);

        await eventBus.PublishAuditAsync(new AuditLogIntegrationEvent(
            UserId: currentUserService.UserId,
            UserName: username,
            Action: "UPDATE_ANNOUNCEMENT",
            Module: "Announcements",
            EntityId: entity.Id.ToString(),
            Details: $"[Announcement.Api] {username} memperbarui pengumuman '{entity.Title}'.",
            IpAddress: currentUserService.IpAddress,
            SourceService: "Announcement.Api"), cancellationToken);

        var refreshed = await unitOfWork.Announcements.GetByIdWithDetailsAsync(id, cancellationToken);
        return Result<AnnouncementDetailDto>.Success(
            MapDetail(refreshed ?? entity, currentUserService.UserId ?? Guid.Empty),
            "Pengumuman berhasil diperbarui.");
    }

    public async Task<Result> DeleteAnnouncementAsync(Guid id, CancellationToken cancellationToken = default)
    {
        if (!IsAuthorizedHrPublisher())
        {
            return Result.Failure(
                "Hanya tim HR (HRStaff, HRSupervisor, HRManager) yang diizinkan menghapus pengumuman.", 403);
        }

        var entity = await unitOfWork.Announcements.GetByIdAsync(id, cancellationToken);
        if (entity is null)
        {
            return Result.Failure("Pengumuman tidak ditemukan.", 404);
        }

        entity.UpdatedBy = currentUserService.Username ?? "System";
        unitOfWork.Announcements.Remove(entity);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        await InvalidateCacheAsync(cancellationToken);

        await eventBus.PublishAuditAsync(new AuditLogIntegrationEvent(
            UserId: currentUserService.UserId,
            UserName: currentUserService.Username ?? "System",
            Action: "DELETE_ANNOUNCEMENT",
            Module: "Announcements",
            EntityId: entity.Id.ToString(),
            Details: $"[Announcement.Api] Menghapus (soft-delete) pengumuman '{entity.Title}'.",
            IpAddress: currentUserService.IpAddress,
            SourceService: "Announcement.Api"), cancellationToken);

        return Result.Success("Pengumuman berhasil dihapus.");
    }

    public async Task<Result<AnnouncementDetailDto>> ToggleCommentsAsync(
        Guid id,
        ToggleCommentsRequest request,
        CancellationToken cancellationToken = default)
    {
        if (!IsAuthorizedHrPublisher())
        {
            return Result<AnnouncementDetailDto>.Failure(
                "Hanya tim HR (HRStaff, HRSupervisor, HRManager) yang dapat mengubah status komentar pengumuman.", 403);
        }

        var entity = await unitOfWork.Announcements.GetByIdWithDetailsAsync(id, cancellationToken);
        if (entity is null)
        {
            return Result<AnnouncementDetailDto>.Failure("Pengumuman tidak ditemukan.", 404);
        }

        var username = currentUserService.Username ?? "hrstaff";
        entity.AllowComments = request.AllowComments;
        entity.UpdatedAt = DateTime.UtcNow;
        entity.UpdatedBy = username;

        unitOfWork.Announcements.Update(entity);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        await InvalidateCacheAsync(cancellationToken);

        await eventBus.PublishAuditAsync(new AuditLogIntegrationEvent(
            UserId: currentUserService.UserId,
            UserName: username,
            Action: "TOGGLE_ANNOUNCEMENT_COMMENTS",
            Module: "Announcements",
            EntityId: entity.Id.ToString(),
            Details: $"[Announcement.Api] {username} mengubah komentar pada '{entity.Title}' menjadi {(entity.AllowComments ? "AKTIF" : "NONAKTIF")}.",
            IpAddress: currentUserService.IpAddress,
            SourceService: "Announcement.Api"), cancellationToken);

        if (realtimeNotifier is not null)
        {
            await realtimeNotifier.NotifyCommentsToggledAsync(entity.Id, entity.AllowComments, cancellationToken);
        }

        return Result<AnnouncementDetailDto>.Success(
            MapDetail(entity, currentUserService.UserId ?? Guid.Empty),
            entity.AllowComments ? "Komentar berhasil diaktifkan kembali." : "Komentar berhasil dinonaktifkan.");
    }

    public async Task<Result<ToggleLikeResponseDto>> ToggleLikeAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var userId = currentUserService.UserId ?? Guid.Empty;
        if (userId == Guid.Empty)
        {
            return Result<ToggleLikeResponseDto>.Failure("Sesi pengguna tidak valid.", 401);
        }

        var entity = await unitOfWork.Announcements.GetByIdWithDetailsAsync(id, cancellationToken);
        if (entity is null)
        {
            return Result<ToggleLikeResponseDto>.Failure("Pengumuman tidak ditemukan.", 404);
        }

        var existingLike = entity.Likes.FirstOrDefault(l => l.UserId == userId && !l.IsDeleted);
        bool isLiked;
        if (existingLike is not null)
        {
            unitOfWork.Likes.Remove(existingLike);
            isLiked = false;
        }
        else
        {
            var newLike = new AnnouncementLike
            {
                AnnouncementId = entity.Id,
                UserId = userId,
                Username = currentUserService.Username ?? "user",
                FullName = currentUserService.FullName ?? currentUserService.Username ?? "User",
                CreatedBy = currentUserService.Username ?? "user"
            };
            await unitOfWork.Likes.AddAsync(newLike, cancellationToken);
            if (!entity.Likes.Any(l => l.Id == newLike.Id))
            {
                entity.Likes.Add(newLike);
            }
            isLiked = true;
        }

        await unitOfWork.SaveChangesAsync(cancellationToken);
        await InvalidateCacheAsync(cancellationToken);

        var updatedLikeCount = entity.Likes.Count(l => !l.IsDeleted);
        if (realtimeNotifier is not null)
        {
            await realtimeNotifier.NotifyLikeUpdatedAsync(entity.Id, updatedLikeCount, userId, isLiked, cancellationToken);
        }

        return Result<ToggleLikeResponseDto>.Success(new ToggleLikeResponseDto(
            AnnouncementId: entity.Id,
            IsLiked: isLiked,
            LikeCount: updatedLikeCount));
    }

    public async Task<Result<AnnouncementCommentDto>> AddCommentAsync(
        Guid id,
        CreateCommentRequest request,
        CancellationToken cancellationToken = default)
    {
        var userId = currentUserService.UserId ?? Guid.Empty;
        if (userId == Guid.Empty)
        {
            return Result<AnnouncementCommentDto>.Failure("Sesi pengguna tidak valid.", 401);
        }

        if (string.IsNullOrWhiteSpace(request.Content))
        {
            return Result<AnnouncementCommentDto>.Failure("Isi komentar tidak boleh kosong.", 400);
        }

        var entity = await unitOfWork.Announcements.GetByIdAsync(id, cancellationToken);
        if (entity is null)
        {
            return Result<AnnouncementCommentDto>.Failure("Pengumuman tidak ditemukan.", 404);
        }

        if (!entity.AllowComments)
        {
            return Result<AnnouncementCommentDto>.Failure(
                "Komentar untuk pengumuman ini sedang dinonaktifkan oleh tim HR.", 400);
        }

        Guid? resolvedParentId = null;
        if (request.ParentCommentId.HasValue)
        {
            var parentComment = await unitOfWork.Comments.GetByIdAsync(request.ParentCommentId.Value, cancellationToken);
            if (parentComment is null || parentComment.AnnouncementId != entity.Id)
            {
                return Result<AnnouncementCommentDto>.Failure("Komentar induk yang ingin dibalas tidak ditemukan.", 404);
            }

            // Jaga kedalaman thread tetap 1 level (jika membalas sebuah reply, arahkan ke root comment)
            resolvedParentId = parentComment.ParentCommentId ?? parentComment.Id;
        }

        var username = currentUserService.Username ?? "user";
        var comment = new AnnouncementComment
        {
            AnnouncementId = entity.Id,
            ParentCommentId = resolvedParentId,
            UserId = userId,
            Username = username,
            FullName = currentUserService.FullName ?? username,
            UserRole = currentUserService.Roles.FirstOrDefault() ?? RoleNames.Staff,
            Content = request.Content.Trim(),
            CreatedBy = username
        };

        await unitOfWork.Comments.AddAsync(comment, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        await InvalidateCacheAsync(cancellationToken);

        var commentDto = new AnnouncementCommentDto(
            comment.Id,
            comment.ParentCommentId,
            comment.UserId,
            comment.Username,
            comment.FullName,
            comment.UserRole,
            comment.Content,
            comment.CreatedAt);

        if (realtimeNotifier is not null)
        {
            var totalComments = await unitOfWork.Comments.CountAsync(c => c.AnnouncementId == entity.Id, cancellationToken);
            await realtimeNotifier.NotifyCommentAddedAsync(entity.Id, commentDto, totalComments, cancellationToken);
        }

        return Result<AnnouncementCommentDto>.Success(
            commentDto,
            resolvedParentId.HasValue ? "Balasan komentar berhasil ditambahkan." : "Komentar berhasil ditambahkan.",
            201);
    }

    public async Task<Result> DeleteCommentAsync(
        Guid announcementId,
        Guid commentId,
        CancellationToken cancellationToken = default)
    {
        var comment = await unitOfWork.Comments.GetByIdAsync(commentId, cancellationToken);
        if (comment is null || comment.AnnouncementId != announcementId)
        {
            return Result.Failure("Komentar tidak ditemukan.", 404);
        }

        var userId = currentUserService.UserId ?? Guid.Empty;
        if (comment.UserId != userId && !IsAuthorizedHrPublisher())
        {
            return Result.Failure("Anda hanya dapat menghapus komentar milik sendiri.", 403);
        }

        var actor = currentUserService.Username ?? "System";
        comment.UpdatedBy = actor;
        unitOfWork.Comments.Remove(comment);

        var deletedIds = new List<Guid> { comment.Id };

        // Jika komentar induk dihapus, ikut soft-delete semua balasan di bawahnya agar tidak yatim
        var childReplies = await unitOfWork.Comments.GetListAsync(
            c => c.AnnouncementId == announcementId && c.ParentCommentId == commentId,
            cancellationToken);
        foreach (var child in childReplies)
        {
            child.UpdatedBy = actor;
            unitOfWork.Comments.Remove(child);
            deletedIds.Add(child.Id);
        }

        await unitOfWork.SaveChangesAsync(cancellationToken);
        await InvalidateCacheAsync(cancellationToken);

        if (realtimeNotifier is not null)
        {
            var totalComments = await unitOfWork.Comments.CountAsync(c => c.AnnouncementId == announcementId, cancellationToken);
            await realtimeNotifier.NotifyCommentDeletedAsync(announcementId, deletedIds, totalComments, cancellationToken);
        }

        return Result.Success("Komentar berhasil dihapus.");
    }

    public async Task<Result> MarkAllAsReadAsync(CancellationToken cancellationToken = default)
    {
        var userId = currentUserService.UserId ?? Guid.Empty;
        if (userId == Guid.Empty)
        {
            return Result.Failure("Sesi pengguna tidak valid.", 401);
        }

        var allPublished = await unitOfWork.Announcements.GetPublishedWithInteractionsAsync(cancellationToken);
        var unreadIds = allPublished
            .Where(a => !a.Reads.Any(r => r.UserId == userId))
            .Select(a => a.Id)
            .ToList();

        foreach (var annId in unreadIds)
        {
            await unitOfWork.Reads.AddAsync(new AnnouncementRead
            {
                AnnouncementId = annId,
                UserId = userId,
                ReadAt = DateTime.UtcNow,
                CreatedBy = currentUserService.Username ?? "user"
            }, cancellationToken);
        }

        if (unreadIds.Count > 0)
        {
            await unitOfWork.SaveChangesAsync(cancellationToken);
        }

        return Result.Success("Semua pengumuman ditandai sudah dibaca.");
    }

    public async Task<Result<AnnouncementStatsDto>> GetStatsAsync(CancellationToken cancellationToken = default)
    {
        var stats = await cacheService.GetOrCreateAsync(
            CacheKeys.AnnouncementStats(),
            async ct =>
            {
                var all = await unitOfWork.Announcements.GetPublishedWithInteractionsAsync(ct);
                return new AnnouncementStatsDto(
                    TotalAnnouncements: all.Count,
                    PublishedAnnouncements: all.Count(a => a.IsPublished),
                    TotalLikes: all.Sum(a => a.Likes.Count),
                    TotalComments: all.Sum(a => a.Comments.Count));
            },
            TimeSpan.FromMinutes(5),
            cancellationToken);

        return Result<AnnouncementStatsDto>.Success(stats);
    }

    private bool IsAuthorizedHrPublisher() =>
        currentUserService.Roles.Any(r => AllowedHrPublisherRoles.Contains(r)) ||
        currentUserService.Permissions.Contains(Permissions.Announcements.Manage, StringComparer.OrdinalIgnoreCase);

    private async Task InvalidateCacheAsync(CancellationToken cancellationToken)
    {
        await cacheService.RemoveByPrefixAsync(CacheKeys.AnnouncementsPrefix, cancellationToken);
        await cacheService.RemoveByPrefixAsync(CacheKeys.DashboardPrefix, cancellationToken);
    }

    private static AnnouncementSummaryDto MapSummary(Domain.Entities.Announcement a, Guid currentUserId) =>
        new(
            Id: a.Id,
            Title: a.Title,
            Summary: a.Summary,
            Type: a.Type.ToString(),
            BannerUrl: a.BannerUrl,
            AllowComments: a.AllowComments,
            IsPinned: a.IsPinned,
            PublishedAt: a.PublishedAt,
            AuthorUserId: a.AuthorUserId,
            AuthorUsername: a.AuthorUsername,
            AuthorFullName: a.AuthorFullName,
            AuthorRole: a.AuthorRole,
            LikeCount: a.Likes.Count,
            CommentCount: a.Comments.Count,
            ImageCount: a.Attachments.Count(att => att.Kind == AttachmentKind.Image),
            FileCount: a.Attachments.Count(att => att.Kind == AttachmentKind.File),
            IsLikedByMe: currentUserId != Guid.Empty && a.Likes.Any(l => l.UserId == currentUserId),
            IsReadByMe: currentUserId != Guid.Empty && a.Reads.Any(r => r.UserId == currentUserId));

    private static AnnouncementDetailDto MapDetail(Domain.Entities.Announcement a, Guid currentUserId) =>
        new(
            Id: a.Id,
            Title: a.Title,
            Summary: a.Summary,
            Type: a.Type.ToString(),
            ContentHtml: a.ContentHtml,
            BannerUrl: a.BannerUrl,
            AllowComments: a.AllowComments,
            IsPinned: a.IsPinned,
            PublishedAt: a.PublishedAt,
            AuthorUserId: a.AuthorUserId,
            AuthorUsername: a.AuthorUsername,
            AuthorFullName: a.AuthorFullName,
            AuthorRole: a.AuthorRole,
            LikeCount: a.Likes.Count,
            CommentCount: a.Comments.Count,
            IsLikedByMe: currentUserId != Guid.Empty && a.Likes.Any(l => l.UserId == currentUserId),
            IsReadByMe: currentUserId != Guid.Empty && a.Reads.Any(r => r.UserId == currentUserId),
            Attachments: a.Attachments
                .OrderBy(att => att.Kind)
                .ThenBy(att => att.CreatedAt)
                .Select(att => new AnnouncementAttachmentDto(
                    att.Id,
                    att.FileName,
                    att.StoredFileName,
                    att.ContentType,
                    att.FileSizeBytes,
                    att.Kind.ToString(),
                    att.Url))
                .ToList(),
            Comments: a.Comments
                .OrderByDescending(c => c.CreatedAt)
                .Select(c => new AnnouncementCommentDto(
                    c.Id,
                    c.ParentCommentId,
                    c.UserId,
                    c.Username,
                    c.FullName,
                    c.UserRole,
                    c.Content,
                    c.CreatedAt))
                .ToList());

    private static HtmlSanitizer CreateHtmlSanitizer()
    {
        var sanitizer = new HtmlSanitizer();
        sanitizer.AllowedTags.Clear();
        foreach (var tag in new[] { "p", "br", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "blockquote", "h1", "h2", "h3", "h4", "a", "span", "div", "hr" })
        {
            sanitizer.AllowedTags.Add(tag);
        }

        sanitizer.AllowedAttributes.Clear();
        foreach (var attr in new[] { "href", "title", "target", "rel" })
        {
            sanitizer.AllowedAttributes.Add(attr);
        }

        sanitizer.AllowedSchemes.Clear();
        sanitizer.AllowedSchemes.Add("http");
        sanitizer.AllowedSchemes.Add("https");
        sanitizer.AllowedSchemes.Add("mailto");

        sanitizer.AllowedCssProperties.Clear();
        return sanitizer;
    }

    /// <summary>
    /// Sanitasi HTML berbasis parser DOM allowlist (HtmlSanitizer / AngleSharp) di sisi server untuk mencegah Stored XSS
    /// sambil tetap mempertahankan format rich-text aman (bold, italic, underline, list, heading, link).
    /// </summary>
    public static string SanitizeRichHtml(string? rawHtml)
    {
        if (string.IsNullOrWhiteSpace(rawHtml))
        {
            return string.Empty;
        }

        var sanitizer = CreateHtmlSanitizer();
        return sanitizer.Sanitize(rawHtml).Trim();
    }

    /// <summary>
    /// Memastikan URL banner dan lampiran hanya menunjuk ke endpoint file internal Announcement.Api (anti-phishing / anti-javascript: URL).
    /// </summary>
    public static string? NormalizeSafeAssetUrl(string? rawUrl)
    {
        if (string.IsNullOrWhiteSpace(rawUrl))
        {
            return null;
        }

        var trimmed = rawUrl.Trim();
        if (trimmed.Contains("..", StringComparison.Ordinal) || trimmed.Contains('\\'))
        {
            return null;
        }

        if (trimmed.StartsWith("/api/v1/announcements/files/", StringComparison.OrdinalIgnoreCase) ||
            trimmed.StartsWith("/api/announcements/files/", StringComparison.OrdinalIgnoreCase))
        {
            return trimmed;
        }

        return null;
    }

    private static string StripHtmlTags(string html) =>
        HtmlTagRegex().Replace(html, " ").Replace("&nbsp;", " ").Trim();

    private static string BuildExcerpt(string html, int maxLength)
    {
        var text = MultiSpaceRegex().Replace(StripHtmlTags(html), " ").Trim();
        return text.Length <= maxLength ? text : text[..maxLength].TrimEnd() + "...";
    }

    [GeneratedRegex(@"<[^>]+>")]
    private static partial Regex HtmlTagRegex();

    [GeneratedRegex(@"\s{2,}")]
    private static partial Regex MultiSpaceRegex();
}
