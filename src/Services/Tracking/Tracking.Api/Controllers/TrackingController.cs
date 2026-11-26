using BuildingBlocks.Core.Attributes;
using BuildingBlocks.Core.Common;
using BuildingBlocks.Core.Constants;
using BuildingBlocks.Core.Interfaces;
using BuildingBlocks.Infrastructure.Controllers;
using BuildingBlocks.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Tracking.Api.Application.DTOs;
using Tracking.Api.Application.Interfaces;

namespace Tracking.Api.Controllers;

public class TrackingController(
    ITrackingService trackingService,
    IFileStorageService fileStorage) : BaseApiController
{
    private const string StorageFolder = "tracking-pod";
    private const long MaxPodSizeBytes = 10 * 1024 * 1024; // 10 MB

    /// <summary>Daftar tugas lapangan / live tracking (Dispatcher melihat semua; Staff hanya melihat tugas miliknya).</summary>
    [HttpGet]
    [HasPermission(Permissions.Tracking.View)]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? status = null,
        [FromQuery] string? taskType = null,
        [FromQuery] string? search = null,
        [FromQuery] bool mineOnly = false,
        CancellationToken cancellationToken = default) =>
        ToActionResult(await trackingService.GetAssignmentsAsync(status, taskType, search, mineOnly, cancellationToken));

    /// <summary>Statistik ringkas Live Tracking untuk Dashboard &amp; Command Center (membutuhkan JWT atau X-Internal-Api-Key).</summary>
    [HttpGet("stats")]
    [AllowAnonymous]
    [RequireAuthenticatedOrInternalApiKey]
    public async Task<IActionResult> GetStats(CancellationToken cancellationToken = default) =>
        ToActionResult(await trackingService.GetStatsAsync(cancellationToken));

    /// <summary>Detail lengkap satu tugas beserta jejak rute (breadcrumbs) dan log transisi status.</summary>
    [HttpGet("{id:guid}")]
    [HasPermission(Permissions.Tracking.View)]
    public async Task<IActionResult> GetById(Guid id, CancellationToken cancellationToken = default) =>
        ToActionResult(await trackingService.GetByIdAsync(id, cancellationToken));

    /// <summary>Membuat tugas lapangan / pengiriman baru (khusus Dispatcher/Manager/Admin).</summary>
    [HttpPost]
    [HasPermission(Permissions.Tracking.Dispatch)]
    [Idempotent]
    public async Task<IActionResult> Create(
        [FromBody] CreateTrackingAssignmentRequest request,
        CancellationToken cancellationToken = default) =>
        ToActionResult(await trackingService.CreateAssignmentAsync(request, cancellationToken));

    /// <summary>Memulai perjalanan (status Assigned -&gt; InTransit) dan mengaktifkan Live GPS Tracking.</summary>
    [HttpPost("{id:guid}/start")]
    [HasPermission(Permissions.Tracking.Operate)]
    [Idempotent]
    public async Task<IActionResult> StartTrip(
        Guid id,
        [FromBody] StartTripRequest? request = null,
        CancellationToken cancellationToken = default) =>
        ToActionResult(await trackingService.StartTripAsync(id, request, cancellationToken));

    /// <summary>Menerima ping posisi GPS realtime dari petugas lapangan (Hot State Cache + Selective DB Trail + SignalR).</summary>
    [HttpPost("{id:guid}/ping")]
    [HasPermission(Permissions.Tracking.Operate)]
    public async Task<IActionResult> RecordPing(
        Guid id,
        [FromBody] LocationPingRequest request,
        CancellationToken cancellationToken = default) =>
        ToActionResult(await trackingService.RecordLocationPingAsync(id, request, cancellationToken));

    /// <summary>Melaporkan kendala di jalan (macet, alamat tutup, dsb.) dan langsung menyiarkan alert ke Command Center.</summary>
    [HttpPost("{id:guid}/issue")]
    [HasPermission(Permissions.Tracking.Operate)]
    [Idempotent]
    public async Task<IActionResult> ReportIssue(
        Guid id,
        [FromBody] ReportIssueRequest request,
        CancellationToken cancellationToken = default) =>
        ToActionResult(await trackingService.ReportIssueAsync(id, request, cancellationToken));

    /// <summary>Melanjutkan perjalanan kembali setelah kendala teratasi.</summary>
    [HttpPost("{id:guid}/resume")]
    [HasPermission(Permissions.Tracking.Operate)]
    [Idempotent]
    public async Task<IActionResult> ResumeTrip(Guid id, CancellationToken cancellationToken = default) =>
        ToActionResult(await trackingService.ResumeTripAsync(id, cancellationToken));

    /// <summary>Check-In tiba di lokasi tujuan (server menghitung ulang jarak Haversine ke radius geofence).</summary>
    [HttpPost("{id:guid}/arrive")]
    [HasPermission(Permissions.Tracking.Operate)]
    [Idempotent]
    public async Task<IActionResult> MarkArrived(
        Guid id,
        [FromBody] StartTripRequest? request = null,
        CancellationToken cancellationToken = default) =>
        ToActionResult(await trackingService.MarkArrivedAsync(id, request, cancellationToken));

    /// <summary>Menyelesaikan tugas dengan bukti POD (otomatis Completed jika dalam geofence, atau PendingVerification jika di luar/suspect).</summary>
    [HttpPost("{id:guid}/complete")]
    [HasPermission(Permissions.Tracking.Operate)]
    [Idempotent]
    public async Task<IActionResult> Complete(
        Guid id,
        [FromBody] CompleteAssignmentRequest request,
        CancellationToken cancellationToken = default) =>
        ToActionResult(await trackingService.CompleteAssignmentAsync(id, request, cancellationToken));

    /// <summary>Verifikasi (Approve/Reject) oleh Manager/Dispatcher untuk tugas berstatus PendingVerification.</summary>
    [HttpPost("{id:guid}/verify")]
    [HasPermission(Permissions.Tracking.Dispatch)]
    [Idempotent]
    public async Task<IActionResult> Verify(
        Guid id,
        [FromBody] VerifyAssignmentRequest request,
        CancellationToken cancellationToken = default) =>
        ToActionResult(await trackingService.VerifyAssignmentAsync(id, request, cancellationToken));

    /// <summary>Membatalkan tugas lapangan (khusus Dispatcher/Manager/Admin).</summary>
    [HttpPost("{id:guid}/cancel")]
    [HasPermission(Permissions.Tracking.Dispatch)]
    [Idempotent]
    public async Task<IActionResult> Cancel(
        Guid id,
        [FromBody] CancelAssignmentRequest? request = null,
        CancellationToken cancellationToken = default) =>
        ToActionResult(await trackingService.CancelAssignmentAsync(id, request, cancellationToken));

    /// <summary>Mengunggah foto Proof of Delivery (POD) dengan validasi Magic-Bytes + Unified IFileStorageService.</summary>
    [HttpPost("upload-pod")]
    [HasPermission(Permissions.Tracking.Operate)]
    [RequestSizeLimit(MaxPodSizeBytes + 1024 * 1024)]
    public async Task<IActionResult> UploadPodPhoto(IFormFile? file, CancellationToken cancellationToken = default)
    {
        if (file is null || file.Length == 0)
        {
            return ToActionResult(Result<PodUploadResponseDto>.Failure("File foto bukti POD tidak boleh kosong.", 400));
        }

        if (file.Length > MaxPodSizeBytes)
        {
            return ToActionResult(Result<PodUploadResponseDto>.Failure("Ukuran foto maksimal 10 MB.", 400));
        }

        await using var buffer = new MemoryStream();
        await file.CopyToAsync(buffer, cancellationToken);

        var bytes = buffer.GetBuffer().AsSpan(0, (int)buffer.Length);
        var validation = FileSignatureValidator.Validate(bytes, file.FileName, FileValidationPolicy.BannerOrImage);
        if (!validation.Succeeded || validation.Data is null)
        {
            return ToActionResult(Result<PodUploadResponseDto>.Failure(validation.Message, 400));
        }

        var validated = validation.Data;
        var storedFileName = $"pod_{DateTime.UtcNow:yyyyMMddHHmmss}_{Guid.NewGuid():N}{validated.Extension}";
        buffer.Position = 0;

        var stored = await fileStorage.UploadAsync(
            StorageFolder,
            storedFileName,
            buffer,
            validated.ContentType,
            cancellationToken);

        var dto = new PodUploadResponseDto(
            FileName: validated.SafeFileName,
            StoredFileName: stored.StoredFileName,
            ContentType: stored.ContentType,
            FileSizeBytes: stored.SizeBytes,
            Url: $"/api/v1/tracking/files/{stored.StoredFileName}");

        return ToActionResult(Result<PodUploadResponseDto>.Success(dto, $"Foto POD berhasil diunggah ({stored.Provider}).", 201));
    }

    /// <summary>Menyajikan foto POD secara aman dari Unified IFileStorageService.</summary>
    [HttpGet("files/{storedFileName}")]
    [AllowAnonymous]
    public async Task<IActionResult> GetPodFile(string storedFileName, CancellationToken cancellationToken = default)
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
            return NotFound("Foto POD tidak ditemukan.");
        }

        Response.RegisterForDisposeAsync(stored);
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        Response.Headers.CacheControl = "public,max-age=86400";
        return File(stored.Content, stored.ContentType);
    }
}
