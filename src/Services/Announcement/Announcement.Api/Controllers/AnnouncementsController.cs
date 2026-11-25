using Announcement.Api.Application.DTOs;
using Announcement.Api.Application.Interfaces;
using Announcement.Api.Infrastructure.Persistence;
using BuildingBlocks.Core.Attributes;
using BuildingBlocks.Core.Common;
using BuildingBlocks.Core.Constants;
using BuildingBlocks.Infrastructure.Controllers;
using BuildingBlocks.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.StaticFiles;

namespace Announcement.Api.Controllers;

public class AnnouncementsController(
    IAnnouncementService announcementService,
    IHostEnvironment hostEnvironment) : BaseApiController
{
    private static readonly HashSet<string> AllowedImageExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"
    };

    private static readonly HashSet<string> AllowedFileExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".csv", ".zip"
    };

    private const long MaxUploadSizeBytes = 10 * 1024 * 1024; // 10 MB

    /// <summary>Daftar pengumuman berhalaman (default 10 item per halaman) dengan filter tipe dan pencarian.</summary>
    [HttpGet]
    [HasPermission(Permissions.Announcements.View)]
    public async Task<IActionResult> GetPaged(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10,
        [FromQuery] string? type = null,
        [FromQuery] string? search = null,
        CancellationToken cancellationToken = default) =>
        ToActionResult(await announcementService.GetAnnouncementsAsync(page, pageSize, type, search, cancellationToken));

    /// <summary>Feed notifikasi bel di topbar: jumlah belum dibaca dan daftar pengumuman belum dibaca / 3 terbaru.</summary>
    [HttpGet("bell")]
    [Authorize]
    public async Task<IActionResult> GetBellFeed(CancellationToken cancellationToken = default) =>
        ToActionResult(await announcementService.GetBellFeedAsync(cancellationToken));

    /// <summary>Statistik ringkas pengumuman untuk Dashboard Aggregator.</summary>
    [HttpGet("stats")]
    [AllowAnonymous]
    public async Task<IActionResult> GetStats(CancellationToken cancellationToken = default) =>
        ToActionResult(await announcementService.GetStatsAsync(cancellationToken));

    /// <summary>Detail lengkap pengumuman (otomatis menandai sudah dibaca untuk user login).</summary>
    [HttpGet("{id:guid}")]
    [HasPermission(Permissions.Announcements.View)]
    public async Task<IActionResult> GetById(
        Guid id,
        [FromQuery] bool markAsRead = true,
        CancellationToken cancellationToken = default) =>
        ToActionResult(await announcementService.GetAnnouncementByIdAsync(id, markAsRead, cancellationToken));

    /// <summary>Membuat dan menerbitkan pengumuman baru (khusus HRStaff, HRSupervisor, HRManager).</summary>
    [HttpPost]
    [HasPermission(Permissions.Announcements.Manage)]
    [Idempotent]
    public async Task<IActionResult> Create(
        [FromBody] CreateOrUpdateAnnouncementRequest request,
        CancellationToken cancellationToken = default) =>
        ToActionResult(await announcementService.CreateAnnouncementAsync(request, cancellationToken));

    /// <summary>Memperbarui isi pengumuman, banner, lampiran, atau pengaturan komentar (khusus Tim HR).</summary>
    [HttpPut("{id:guid}")]
    [HasPermission(Permissions.Announcements.Manage)]
    [Idempotent]
    public async Task<IActionResult> Update(
        Guid id,
        [FromBody] CreateOrUpdateAnnouncementRequest request,
        CancellationToken cancellationToken = default) =>
        ToActionResult(await announcementService.UpdateAnnouncementAsync(id, request, cancellationToken));

    /// <summary>Menghapus pengumuman secara soft-delete (khusus Tim HR).</summary>
    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.Announcements.Manage)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken = default) =>
        ToActionResult(await announcementService.DeleteAnnouncementAsync(id, cancellationToken));

    /// <summary>Mengaktifkan atau menonaktifkan komentar kapan saja setelah pengumuman diterbitkan (khusus Tim HR).</summary>
    [HttpPatch("{id:guid}/toggle-comments")]
    [HasPermission(Permissions.Announcements.Manage)]
    public async Task<IActionResult> ToggleComments(
        Guid id,
        [FromBody] ToggleCommentsRequest request,
        CancellationToken cancellationToken = default) =>
        ToActionResult(await announcementService.ToggleCommentsAsync(id, request, cancellationToken));

    /// <summary>Toggle like atau unlike pengumuman oleh user yang sedang login.</summary>
    [HttpPost("{id:guid}/like")]
    [HasPermission(Permissions.Announcements.View)]
    public async Task<IActionResult> ToggleLike(Guid id, CancellationToken cancellationToken = default) =>
        ToActionResult(await announcementService.ToggleLikeAsync(id, cancellationToken));

    /// <summary>Menambahkan komentar baru pada pengumuman (ditolak jika komentar sedang nonaktif).</summary>
    [HttpPost("{id:guid}/comments")]
    [HasPermission(Permissions.Announcements.View)]
    [Idempotent]
    public async Task<IActionResult> AddComment(
        Guid id,
        [FromBody] CreateCommentRequest request,
        CancellationToken cancellationToken = default) =>
        ToActionResult(await announcementService.AddCommentAsync(id, request, cancellationToken));

    /// <summary>Menghapus komentar (hanya pemilik komentar atau Tim HR).</summary>
    [HttpDelete("{id:guid}/comments/{commentId:guid}")]
    [HasPermission(Permissions.Announcements.View)]
    public async Task<IActionResult> DeleteComment(
        Guid id,
        Guid commentId,
        CancellationToken cancellationToken = default) =>
        ToActionResult(await announcementService.DeleteCommentAsync(id, commentId, cancellationToken));

    /// <summary>Menandai seluruh pengumuman sudah dibaca oleh user login.</summary>
    [HttpPost("mark-all-read")]
    [Authorize]
    public async Task<IActionResult> MarkAllRead(CancellationToken cancellationToken = default) =>
        ToActionResult(await announcementService.MarkAllAsReadAsync(cancellationToken));

    /// <summary>Upload banner, lampiran gambar, atau lampiran file dokumen (maksimal 10 MB, khusus Tim HR).</summary>
    [HttpPost("upload")]
    [HasPermission(Permissions.Announcements.Manage)]
    [RequestSizeLimit(MaxUploadSizeBytes)]
    public async Task<IActionResult> UploadFile(
        IFormFile file,
        [FromQuery] string kind = "File",
        CancellationToken cancellationToken = default)
    {
        if (file is null || file.Length == 0)
        {
            return ToActionResult(Result<UploadedFileDto>.Failure("File upload tidak boleh kosong.", 400));
        }

        if (file.Length > MaxUploadSizeBytes)
        {
            return ToActionResult(Result<UploadedFileDto>.Failure("Ukuran file maksimal 10 MB.", 400));
        }

        var ext = Path.GetExtension(file.FileName);
        var isImage = AllowedImageExtensions.Contains(ext);
        var isAllowedDoc = AllowedFileExtensions.Contains(ext);

        if ((kind.Equals("Banner", StringComparison.OrdinalIgnoreCase) || kind.Equals("Image", StringComparison.OrdinalIgnoreCase)) && !isImage)
        {
            return ToActionResult(Result<UploadedFileDto>.Failure(
                "Format banner/gambar wajib berupa .jpg, .jpeg, .png, .webp, .gif, atau .svg.", 400));
        }

        if (!isImage && !isAllowedDoc)
        {
            return ToActionResult(Result<UploadedFileDto>.Failure(
                "Tipe file tidak diizinkan. Gunakan gambar atau dokumen (.pdf, .docx, .xlsx, .pptx, .txt, .csv, .zip).", 400));
        }

        var normalizedKind = kind.Equals("Banner", StringComparison.OrdinalIgnoreCase)
            ? "Banner"
            : isImage && kind.Equals("Image", StringComparison.OrdinalIgnoreCase)
                ? "Image"
                : "File";

        var storedFileName = $"{DateTime.UtcNow:yyyyMMddHHmmss}_{Guid.NewGuid():N}{ext.ToLowerInvariant()}";
        var uploadsDir = AnnouncementStorageHelper.GetUploadsDirectory(hostEnvironment);
        var fullPath = Path.Combine(uploadsDir, storedFileName);

        await using (var stream = new FileStream(fullPath, FileMode.Create))
        {
            await file.CopyToAsync(stream, cancellationToken);
        }

        var dto = new UploadedFileDto(
            FileName: Path.GetFileName(file.FileName),
            StoredFileName: storedFileName,
            ContentType: string.IsNullOrWhiteSpace(file.ContentType) ? "application/octet-stream" : file.ContentType,
            FileSizeBytes: file.Length,
            Kind: normalizedKind,
            Url: $"/api/announcements/files/{storedFileName}");

        return ToActionResult(Result<UploadedFileDto>.Success(dto, "File berhasil diunggah.", 201));
    }

    /// <summary>Mengambil gambar banner/lampiran atau mengunduh file lampiran secara aman (anti path-traversal).</summary>
    [HttpGet("files/{storedFileName}")]
    [AllowAnonymous]
    public IActionResult GetUploadedFile(string storedFileName, [FromQuery] bool download = false)
    {
        var safeName = Path.GetFileName(storedFileName);
        if (string.IsNullOrWhiteSpace(safeName) || safeName != storedFileName)
        {
            return BadRequest("Nama file tidak valid.");
        }

        var uploadsDir = AnnouncementStorageHelper.GetUploadsDirectory(hostEnvironment);
        var fullPath = Path.Combine(uploadsDir, safeName);
        if (!System.IO.File.Exists(fullPath))
        {
            return NotFound("File lampiran tidak ditemukan.");
        }

        var provider = new FileExtensionContentTypeProvider();
        if (!provider.TryGetContentType(fullPath, out var contentType))
        {
            contentType = "application/octet-stream";
        }

        return download
            ? PhysicalFile(fullPath, contentType, safeName)
            : PhysicalFile(fullPath, contentType);
    }
}
