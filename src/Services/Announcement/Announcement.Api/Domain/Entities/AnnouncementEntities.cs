using BuildingBlocks.Core.Common;

namespace Announcement.Api.Domain.Entities;

public enum AnnouncementType
{
    General = 0,
    HRPolicy = 1,
    Event = 2,
    Urgent = 3,
    Maintenance = 4,
    Celebration = 5
}

public enum AttachmentKind
{
    Banner = 0,
    Image = 1,
    File = 2
}

/// <summary>
/// Entitas utama pengumuman internal perusahaan dengan konten rich text ringkas, banner, lampiran, like, dan kontrol komentar.
/// </summary>
public class Announcement : BaseEntity
{
    public string Title { get; set; } = string.Empty;
    public string Summary { get; set; } = string.Empty;
    public AnnouncementType Type { get; set; } = AnnouncementType.General;
    public string ContentHtml { get; set; } = string.Empty;
    public string? BannerUrl { get; set; }
    public bool AllowComments { get; set; } = true;
    public bool IsPinned { get; set; }
    public bool IsPublished { get; set; } = true;
    public DateTime PublishedAt { get; set; } = DateTime.UtcNow;

    // Snapshot identitas pembuat pengumuman dari JWT Identity.Api (tanpa SQL JOIN lintas DB)
    public Guid AuthorUserId { get; set; }
    public string AuthorUsername { get; set; } = string.Empty;
    public string AuthorFullName { get; set; } = string.Empty;
    public string AuthorRole { get; set; } = string.Empty;

    public ICollection<AnnouncementAttachment> Attachments { get; set; } = new List<AnnouncementAttachment>();
    public ICollection<AnnouncementLike> Likes { get; set; } = new List<AnnouncementLike>();
    public ICollection<AnnouncementComment> Comments { get; set; } = new List<AnnouncementComment>();
    public ICollection<AnnouncementRead> Reads { get; set; } = new List<AnnouncementRead>();
}

/// <summary>
/// Lampiran gambar atau dokumen file pada sebuah pengumuman.
/// </summary>
public class AnnouncementAttachment : BaseEntity
{
    public Guid AnnouncementId { get; set; }
    public Announcement Announcement { get; set; } = null!;

    public string FileName { get; set; } = string.Empty;
    public string StoredFileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = "application/octet-stream";
    public long FileSizeBytes { get; set; }
    public AttachmentKind Kind { get; set; } = AttachmentKind.File;
    public string Url { get; set; } = string.Empty;
}

/// <summary>
/// Data like per user pada sebuah pengumuman (unik per AnnouncementId + UserId).
/// </summary>
public class AnnouncementLike : BaseEntity
{
    public Guid AnnouncementId { get; set; }
    public Announcement Announcement { get; set; } = null!;

    public Guid UserId { get; set; }
    public string Username { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
}

/// <summary>
/// Komentar user pada sebuah pengumuman (hanya diizinkan jika AllowComments == true).
/// </summary>
public class AnnouncementComment : BaseEntity
{
    public Guid AnnouncementId { get; set; }
    public Announcement Announcement { get; set; } = null!;

    public Guid? ParentCommentId { get; set; }

    public Guid UserId { get; set; }
    public string Username { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string UserRole { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
}

/// <summary>
/// Penanda bahwa user tertentu sudah membaca pengumuman (untuk badge dan dropdown notifikasi bel).
/// </summary>
public class AnnouncementRead : BaseEntity
{
    public Guid AnnouncementId { get; set; }
    public Announcement Announcement { get; set; } = null!;

    public Guid UserId { get; set; }
    public DateTime ReadAt { get; set; } = DateTime.UtcNow;
}
