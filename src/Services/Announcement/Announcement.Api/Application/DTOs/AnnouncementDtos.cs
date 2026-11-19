namespace Announcement.Api.Application.DTOs;

public record AnnouncementAttachmentDto(
    Guid Id,
    string FileName,
    string StoredFileName,
    string ContentType,
    long FileSizeBytes,
    string Kind,
    string Url
);

public record AnnouncementAttachmentInputDto(
    string FileName,
    string StoredFileName,
    string ContentType,
    long FileSizeBytes,
    string Kind,
    string Url
);

public record AnnouncementCommentDto(
    Guid Id,
    Guid? ParentCommentId,
    Guid UserId,
    string Username,
    string FullName,
    string UserRole,
    string Content,
    DateTime CreatedAt
);

public record AnnouncementSummaryDto(
    Guid Id,
    string Title,
    string Summary,
    string Type,
    string? BannerUrl,
    bool AllowComments,
    bool IsPinned,
    DateTime PublishedAt,
    string AuthorUsername,
    string AuthorFullName,
    string AuthorRole,
    int LikeCount,
    int CommentCount,
    int ImageCount,
    int FileCount,
    bool IsLikedByMe,
    bool IsReadByMe
);

public record AnnouncementDetailDto(
    Guid Id,
    string Title,
    string Summary,
    string Type,
    string ContentHtml,
    string? BannerUrl,
    bool AllowComments,
    bool IsPinned,
    DateTime PublishedAt,
    Guid AuthorUserId,
    string AuthorUsername,
    string AuthorFullName,
    string AuthorRole,
    int LikeCount,
    int CommentCount,
    bool IsLikedByMe,
    bool IsReadByMe,
    IReadOnlyList<AnnouncementAttachmentDto> Attachments,
    IReadOnlyList<AnnouncementCommentDto> Comments
);

public record PagedAnnouncementsDto(
    IReadOnlyList<AnnouncementSummaryDto> Items,
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages,
    int UnreadCount
);

public record AnnouncementBellResponseDto(
    int UnreadCount,
    IReadOnlyList<AnnouncementSummaryDto> Items
);

public record CreateOrUpdateAnnouncementRequest(
    string Title,
    string? Summary,
    string Type,
    string ContentHtml,
    string? BannerUrl,
    bool AllowComments = true,
    bool IsPinned = false,
    List<AnnouncementAttachmentInputDto>? Attachments = null
);

public record ToggleCommentsRequest(
    bool AllowComments
);

public record CreateCommentRequest(
    string Content,
    Guid? ParentCommentId = null
);

public record ToggleLikeResponseDto(
    Guid AnnouncementId,
    bool IsLiked,
    int LikeCount
);

public record UploadedFileDto(
    string FileName,
    string StoredFileName,
    string ContentType,
    long FileSizeBytes,
    string Kind,
    string Url
);
