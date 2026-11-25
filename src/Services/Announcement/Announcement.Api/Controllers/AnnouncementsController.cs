using Announcement.Api.Application.DTOs;
using Announcement.Api.Application.Interfaces;
using BuildingBlocks.Core.Attributes;
using BuildingBlocks.Core.Common;
using BuildingBlocks.Core.Constants;
using BuildingBlocks.Core.Interfaces;
using BuildingBlocks.Infrastructure.Controllers;
using BuildingBlocks.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Announcement.Api.Controllers;

public class AnnouncementsController(
    IAnnouncementService announcementService,
    IFileStorageService fileStorage) : BaseApiController
{
    private const string StorageFolder = "announcements";
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

    /// <summary>Statistik ringkas pengumuman untuk Dashboard Aggregator (membutuhkan JWT atau X-Internal-Api-Key).</summary>
    [HttpGet("stats")]
    [AllowAnonymous]
    [RequireAuthenticatedOrInternalApiKey]
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

    /// <summary>Upload banner, lampiran gambar, atau lampiran file dokumen (validasi magic-bytes + Unified IFileStorageService LocalDisk/S3, maks 10 MB, khusus Tim HR).</summary>
    [HttpPost("upload")]
    [HasPermission(Permissions.Announcements.Manage)]
    [RequestSizeLimit(MaxUploadSizeBytes + 1024 * 1024)]
    public async Task<IActionResult> UploadFile(
        IFormFile? file,
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

        var isImageOnlyRequest =
            kind.Equals("Banner", StringComparison.OrdinalIgnoreCase) ||
            kind.Equals("Image", StringComparison.OrdinalIgnoreCase);

        var policy = isImageOnlyRequest
            ? FileValidationPolicy.BannerOrImage
            : FileValidationPolicy.DocumentOrImage;

        await using var buffer = new MemoryStream();
        await file.CopyToAsync(buffer, cancellationToken);

        var bytes = buffer.GetBuffer().AsSpan(0, (int)buffer.Length);
        var validation = FileSignatureValidator.Validate(bytes, file.FileName, policy);
        if (!validation.Succeeded || validation.Data is null)
        {
            return ToActionResult(Result<UploadedFileDto>.Failure(validation.Message, 400));
        }

        var validated = validation.Data;
        var normalizedKind = kind.Equals("Banner", StringComparison.OrdinalIgnoreCase)
            ? "Banner"
            : validated.IsImage && kind.Equals("Image", StringComparison.OrdinalIgnoreCase)
                ? "Image"
                : "File";

        var storedFileName = $"{DateTime.UtcNow:yyyyMMddHHmmss}_{Guid.NewGuid():N}{validated.Extension}";
        buffer.Position = 0;

        var stored = await fileStorage.UploadAsync(
            StorageFolder,
            storedFileName,
            buffer,
            validated.ContentType,
            cancellationToken);

        var dto = new UploadedFileDto(
            FileName: validated.SafeFileName,
            StoredFileName: stored.StoredFileName,
            ContentType: stored.ContentType,
            FileSizeBytes: stored.SizeBytes,
            Kind: normalizedKind,
            Url: $"/api/v1/announcements/files/{stored.StoredFileName}");

        return ToActionResult(Result<UploadedFileDto>.Success(
            dto,
            $"File berhasil diunggah ({stored.Provider}).",
            201));
    }

    /// <summary>Mengambil gambar banner/lampiran atau mengunduh file lampiran secara aman dari IFileStorageService (LocalDisk / MinIO / S3).</summary>
    [HttpGet("files/{storedFileName}")]
    [AllowAnonymous]
    public async Task<IActionResult> GetUploadedFile(
        string storedFileName,
        [FromQuery] bool download = false,
        CancellationToken cancellationToken = default)
    {
        var safeName = Path.GetFileName(storedFileName);
        if (string.IsNullOrWhiteSpace(safeName) || safeName != storedFileName || safeName.Contains("..", StringComparison.Ordinal))
        {
            return BadRequest("Nama file tidak valid.");
        }

        var objectKey = FileSignatureValidator.NormalizeObjectKey(StorageFolder, safeName);
        var stored = await fileStorage.OpenReadAsync(objectKey, cancellationToken);
        if (stored is null)
        {
            return NotFound("File lampiran tidak ditemukan.");
        }

        Response.RegisterForDisposeAsync(stored);
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        Response.Headers.CacheControl = "public,max-age=86400";

        return download
            ? File(stored.Content, stored.ContentType, safeName)
            : File(stored.Content, stored.ContentType);
    }
}
