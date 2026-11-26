using BuildingBlocks.Core.Common;
using BuildingBlocks.Core.Constants;
using BuildingBlocks.Core.Contracts;
using BuildingBlocks.Core.Interfaces;
using Tracking.Api.Application.DTOs;
using Tracking.Api.Application.Interfaces;
using Tracking.Api.Domain.Entities;
using Tracking.Api.Domain.Interfaces;

namespace Tracking.Api.Application.Services;

/// <summary>
/// Core Business Service untuk Field Dispatch &amp; Live Location Tracking (Port 5087).
/// Menerapkan:
/// 1. Hot State (Hybrid Cache L1/L2) untuk ping GPS realtime + Selective Downsampling (Cold Trail) ke DB.
/// 2. Server-Side Haversine Geofencing (tidak percaya jarak/status geofence dari client).
/// 3. Anti-Fraud Guard: validasi koordinat, deteksi Mock GPS, &amp; Impossible Travel velocity check (&gt; 300 km/jam).
/// 4. Anti-IDOR Guard: petugas hanya boleh mengakses &amp; memperbarui tugas miliknya sendiri.
/// 5. Workflow Verification otomatis jika penyelesaian di luar radius geofence atau terdeteksi anomali GPS.
/// </summary>
public class TrackingService(
    ITrackingUnitOfWork unitOfWork,
    ICurrentUserService currentUserService,
    ICacheService cacheService,
    IEventBus eventBus,
    ITrackingRealtimeNotifier? realtimeNotifier = null) : ITrackingService
{
    private const double MinPersistDistanceMeters = 30.0;
    private const double MinPersistIntervalSeconds = 60.0;
    private const double ImpossibleTravelSpeedKmh = 300.0;
    private const double ImpossibleTravelMinJumpMeters = 500.0;
    private const double DefaultOriginLat = -6.175392; // Monas / Jakarta Pusat default origin
    private const double DefaultOriginLng = 106.827153;

    public async Task<Result<IReadOnlyList<TrackingSummaryDto>>> GetAssignmentsAsync(
        string? status = null,
        string? taskType = null,
        string? search = null,
        bool mineOnly = false,
        CancellationToken cancellationToken = default)
    {
        var all = await unitOfWork.Assignments.GetAllWithSummaryAsync(cancellationToken);
        IEnumerable<TrackingAssignment> query = all;

        // Anti-IDOR: non-dispatcher hanya boleh melihat tugas yang ditugaskan ke dirinya sendiri
        if (mineOnly || !IsDispatcherOrAdmin())
        {
            query = query.Where(IsCurrentUserAssignee);
        }

        if (!string.IsNullOrWhiteSpace(status))
        {
            var statusFilter = status.Trim();
            query = query.Where(a => a.Status.ToString().Equals(statusFilter, StringComparison.OrdinalIgnoreCase));
        }

        if (!string.IsNullOrWhiteSpace(taskType))
        {
            var typeFilter = taskType.Trim();
            query = query.Where(a => a.TaskType.ToString().Equals(typeFilter, StringComparison.OrdinalIgnoreCase));
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(a =>
                a.AssignmentCode.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                a.Title.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                a.AssigneeFullName.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                a.AssigneeUsername.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                a.DestinationLabel.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                (a.ReferenceCode?.Contains(term, StringComparison.OrdinalIgnoreCase) ?? false));
        }

        var list = query.ToList();
        var dtos = new List<TrackingSummaryDto>(list.Count);
        foreach (var item in list)
        {
            var livePos = item.Status is TrackingStatus.InTransit or TrackingStatus.IssueReported or TrackingStatus.Arrived
                ? await cacheService.GetAsync<LivePositionCacheDto>(CacheKeys.TrackingLivePosition(item.Id), cancellationToken)
                : null;
            dtos.Add(MapSummary(item, livePos));
        }

        return Result<IReadOnlyList<TrackingSummaryDto>>.Success(dtos);
    }

    public async Task<Result<TrackingDetailDto>> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var entity = await unitOfWork.Assignments.GetByIdWithDetailsAsync(id, cancellationToken);
        if (entity is null)
        {
            return Result<TrackingDetailDto>.Failure("Tugas tracking tidak ditemukan.", 404);
        }

        if (!IsDispatcherOrAdmin() && !IsCurrentUserAssignee(entity))
        {
            return Result<TrackingDetailDto>.Failure("Akses ditolak. Anda hanya dapat melihat detail tugas lapangan milik Anda sendiri.", 403);
        }

        var livePos = await cacheService.GetAsync<LivePositionCacheDto>(CacheKeys.TrackingLivePosition(entity.Id), cancellationToken);
        return Result<TrackingDetailDto>.Success(MapDetail(entity, livePos));
    }

    public async Task<Result<TrackingDetailDto>> CreateAssignmentAsync(
        CreateTrackingAssignmentRequest request,
        CancellationToken cancellationToken = default)
    {
        if (!IsDispatcherOrAdmin())
        {
            return Result<TrackingDetailDto>.Failure("Akses ditolak. Hanya Dispatcher/Manager/Admin yang dapat membuat tugas tracking.", 403);
        }

        if (string.IsNullOrWhiteSpace(request.Title) || string.IsNullOrWhiteSpace(request.DestinationLabel))
        {
            return Result<TrackingDetailDto>.Failure("Judul tugas dan nama lokasi tujuan wajib diisi.", 400);
        }

        if (string.IsNullOrWhiteSpace(request.AssigneeUsername))
        {
            return Result<TrackingDetailDto>.Failure("Petugas lapangan (Assignee) wajib dipilih.", 400);
        }

        if (!GeoDistanceCalculator.IsValidCoordinate(request.DestinationLatitude, request.DestinationLongitude))
        {
            return Result<TrackingDetailDto>.Failure("Koordinat lokasi tujuan tidak valid.", 400);
        }

        var originLat = request.OriginLatitude ?? DefaultOriginLat;
        var originLng = request.OriginLongitude ?? DefaultOriginLng;
        if (!GeoDistanceCalculator.IsValidCoordinate(originLat, originLng))
        {
            originLat = DefaultOriginLat;
            originLng = DefaultOriginLng;
        }

        if (!Enum.TryParse<TrackingTaskType>(request.TaskType, true, out var taskType))
        {
            taskType = TrackingTaskType.Delivery;
        }

        var radius = Math.Clamp(request.GeofenceRadiusMeters, 30, 2000);
        var count = await unitOfWork.Assignments.CountAsync(cancellationToken: cancellationToken);
        var code = $"TRK-{DateTime.UtcNow:yyyy}-{(count + 1):D3}";

        var dispatcherId = currentUserService.UserId ?? Guid.Empty;
        var dispatcherUsername = currentUserService.Username ?? "manager";
        var dispatcherFullName = currentUserService.FullName ?? dispatcherUsername;

        var initialDistance = GeoDistanceCalculator.CalculateHaversineMeters(
            originLat, originLng, request.DestinationLatitude, request.DestinationLongitude);

        var entity = new TrackingAssignment
        {
            AssignmentCode = code,
            Title = request.Title.Trim(),
            TaskType = taskType,
            ReferenceCode = string.IsNullOrWhiteSpace(request.ReferenceCode) ? null : request.ReferenceCode.Trim().ToUpperInvariant(),
            Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
            DispatcherUserId = dispatcherId,
            DispatcherUsername = dispatcherUsername,
            DispatcherFullName = dispatcherFullName,
            AssigneeUserId = request.AssigneeUserId,
            AssigneeUsername = request.AssigneeUsername.Trim().ToLowerInvariant(),
            AssigneeFullName = string.IsNullOrWhiteSpace(request.AssigneeFullName) ? request.AssigneeUsername.Trim() : request.AssigneeFullName.Trim(),
            OriginLabel = string.IsNullOrWhiteSpace(request.OriginLabel) ? "Kantor Pusat" : request.OriginLabel.Trim(),
            OriginLatitude = originLat,
            OriginLongitude = originLng,
            DestinationLabel = request.DestinationLabel.Trim(),
            DestinationAddress = string.IsNullOrWhiteSpace(request.DestinationAddress) ? request.DestinationLabel.Trim() : request.DestinationAddress.Trim(),
            DestinationLatitude = request.DestinationLatitude,
            DestinationLongitude = request.DestinationLongitude,
            GeofenceRadiusMeters = radius,
            Status = TrackingStatus.Assigned,
            LastDistanceToDestinationMeters = initialDistance,
            CreatedBy = dispatcherUsername
        };

        entity.StatusLogs.Add(new TrackingStatusLog
        {
            TrackingAssignmentId = entity.Id,
            FromStatus = "None",
            ToStatus = TrackingStatus.Assigned.ToString(),
            ActorUsername = dispatcherUsername,
            ActorFullName = dispatcherFullName,
            Notes = $"Tugas ditugaskan ke {entity.AssigneeFullName} (@{entity.AssigneeUsername}) menuju {entity.DestinationLabel} (radius geofence {radius}m).",
            Latitude = originLat,
            Longitude = originLng,
            Timestamp = DateTime.UtcNow,
            CreatedBy = dispatcherUsername
        });

        await unitOfWork.Assignments.AddAsync(entity, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        await InvalidateStatsCacheAsync(cancellationToken);

        await eventBus.PublishAuditAsync(new AuditLogIntegrationEvent(
            UserId: dispatcherId,
            UserName: dispatcherUsername,
            Action: "CREATE_TRACKING_ASSIGNMENT",
            Module: "Tracking",
            EntityId: entity.Id.ToString(),
            Details: $"[Tracking.Api] {dispatcherUsername} membuat tugas '{entity.AssignmentCode}' ({entity.TaskType}) untuk @{entity.AssigneeUsername} menuju '{entity.DestinationLabel}'.",
            IpAddress: currentUserService.IpAddress,
            SourceService: "Tracking.Api"), cancellationToken);

        var summary = MapSummary(entity, null);
        if (realtimeNotifier is not null)
        {
            await realtimeNotifier.NotifyAssignmentCreatedAsync(summary, cancellationToken);
        }

        return Result<TrackingDetailDto>.Success(MapDetail(entity, null), $"Tugas {entity.AssignmentCode} berhasil dibuat.", 201);
    }

    public async Task<Result<TrackingDetailDto>> StartTripAsync(
        Guid id,
        StartTripRequest? request,
        CancellationToken cancellationToken = default)
    {
        var entity = await unitOfWork.Assignments.GetByIdWithDetailsAsync(id, cancellationToken);
        if (entity is null)
        {
            return Result<TrackingDetailDto>.Failure("Tugas tracking tidak ditemukan.", 404);
        }

        if (!IsAssigneeOrSuperAdmin(entity))
        {
            return Result<TrackingDetailDto>.Failure("Akses ditolak. Hanya petugas yang ditugaskan yang dapat memulai perjalanan ini.", 403);
        }

        if (entity.Status != TrackingStatus.Assigned)
        {
            return Result<TrackingDetailDto>.Failure($"Tugas berstatus '{entity.Status}' tidak dapat dimulai ulang.", 400);
        }

        var now = DateTime.UtcNow;
        var startLat = request?.Latitude is double lat && request.Longitude is double lng && GeoDistanceCalculator.IsValidCoordinate(lat, lng)
            ? lat
            : entity.OriginLatitude;
        var startLng = request?.Latitude is double lat2 && request.Longitude is double lng2 && GeoDistanceCalculator.IsValidCoordinate(lat2, lng2)
            ? lng2
            : entity.OriginLongitude;
        var accuracy = Math.Max(1, request?.AccuracyMeters ?? 15);
        var isMocked = request?.IsMocked ?? false;

        var distanceToDest = GeoDistanceCalculator.CalculateHaversineMeters(
            startLat, startLng, entity.DestinationLatitude, entity.DestinationLongitude);

        var prevStatus = entity.Status.ToString();
        entity.Status = TrackingStatus.InTransit;
        entity.StartedAt = now;
        entity.LastLatitude = startLat;
        entity.LastLongitude = startLng;
        entity.LastAccuracyMeters = accuracy;
        entity.LastSpeedKmh = 0;
        entity.LastDistanceToDestinationMeters = distanceToDest;
        entity.LastPingAt = now;
        entity.UpdatedAt = now;
        entity.UpdatedBy = currentUserService.Username ?? entity.AssigneeUsername;

        if (isMocked)
        {
            entity.IsSuspicious = true;
            entity.SuspiciousReason = "Mock GPS / Fake GPS terdeteksi saat memulai perjalanan.";
        }

        var actorUsername = currentUserService.Username ?? entity.AssigneeUsername;
        var actorFullName = currentUserService.FullName ?? entity.AssigneeFullName;

        var startCrumb = new TrackingBreadcrumb
        {
            TrackingAssignmentId = entity.Id,
            Latitude = startLat,
            Longitude = startLng,
            AccuracyMeters = accuracy,
            SpeedKmh = 0,
            DistanceToDestinationMeters = distanceToDest,
            IsMocked = isMocked,
            IsSuspicious = isMocked,
            EventTag = "START",
            RecordedAt = now,
            CreatedBy = actorUsername
        };
        await unitOfWork.Breadcrumbs.AddAsync(startCrumb, cancellationToken);
        entity.Breadcrumbs.Add(startCrumb);

        var statusLog = new TrackingStatusLog
        {
            TrackingAssignmentId = entity.Id,
            FromStatus = prevStatus,
            ToStatus = TrackingStatus.InTransit.ToString(),
            ActorUsername = actorUsername,
            ActorFullName = actorFullName,
            Notes = $"Perjalanan dimulai (jarak ke tujuan: {distanceToDest:F0} meter).",
            Latitude = startLat,
            Longitude = startLng,
            Timestamp = now,
            CreatedBy = actorUsername
        };
        await unitOfWork.StatusLogs.AddAsync(statusLog, cancellationToken);
        entity.StatusLogs.Add(statusLog);

        unitOfWork.Assignments.Update(entity);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        await InvalidateStatsCacheAsync(cancellationToken);

        var livePos = BuildLiveCacheDto(entity, startLat, startLng, accuracy, 0, distanceToDest, now);
        await cacheService.SetAsync(CacheKeys.TrackingLivePosition(entity.Id), livePos, TimeSpan.FromHours(2), cancellationToken);

        await eventBus.PublishAuditAsync(new AuditLogIntegrationEvent(
            UserId: currentUserService.UserId,
            UserName: actorUsername,
            Action: "START_TRACKING_TRIP",
            Module: "Tracking",
            EntityId: entity.Id.ToString(),
            Details: $"[Tracking.Api] {actorUsername} memulai perjalanan '{entity.AssignmentCode}' menuju '{entity.DestinationLabel}'.",
            IpAddress: currentUserService.IpAddress,
            SourceService: "Tracking.Api"), cancellationToken);

        if (realtimeNotifier is not null)
        {
            await realtimeNotifier.NotifyLocationUpdatedAsync(livePos, cancellationToken);
            await realtimeNotifier.NotifyStatusChangedAsync(MapSummary(entity, livePos), "STARTED", statusLog.Notes, cancellationToken);
        }

        return Result<TrackingDetailDto>.Success(MapDetail(entity, livePos), "Perjalanan dimulai. Live GPS tracking aktif.");
    }

    public async Task<Result<TrackingPingResultDto>> RecordLocationPingAsync(
        Guid id,
        LocationPingRequest request,
        CancellationToken cancellationToken = default)
    {
        if (!GeoDistanceCalculator.IsValidCoordinate(request.Latitude, request.Longitude))
        {
            return Result<TrackingPingResultDto>.Failure("Koordinat GPS tidak valid.", 400);
        }

        var entity = await unitOfWork.Assignments.GetByIdWithDetailsAsync(id, cancellationToken);
        if (entity is null)
        {
            return Result<TrackingPingResultDto>.Failure("Tugas tracking tidak ditemukan.", 404);
        }

        if (!IsAssigneeOrSuperAdmin(entity))
        {
            return Result<TrackingPingResultDto>.Failure("Akses ditolak. Hanya petugas yang ditugaskan yang dapat mengirim posisi GPS.", 403);
        }

        if (entity.Status is not (TrackingStatus.InTransit or TrackingStatus.Arrived or TrackingStatus.IssueReported))
        {
            return Result<TrackingPingResultDto>.Failure($"Ping GPS tidak diterima saat tugas berstatus '{entity.Status}'.", 400);
        }

        var now = DateTime.UtcNow;
        var accuracy = Math.Max(1, request.AccuracyMeters);
        var distanceToDest = GeoDistanceCalculator.CalculateHaversineMeters(
            request.Latitude, request.Longitude, entity.DestinationLatitude, entity.DestinationLongitude);
        var isInsideGeofence = distanceToDest <= entity.GeofenceRadiusMeters;

        // Ambil posisi sebelumnya dari Hot State (Cache) atau DB untuk hitung kecepatan & jarak tempuh
        var previousLive = await cacheService.GetAsync<LivePositionCacheDto>(CacheKeys.TrackingLivePosition(entity.Id), cancellationToken);
        var prevLat = previousLive?.Latitude ?? entity.LastLatitude;
        var prevLng = previousLive?.Longitude ?? entity.LastLongitude;
        var prevAt = previousLive?.RecordedAtUtc ?? entity.LastPingAt;

        double segmentMeters = 0;
        double computedSpeedKmh = request.SpeedMps.HasValue && request.SpeedMps.Value >= 0
            ? Math.Round(request.SpeedMps.Value * 3.6, 2)
            : 0;

        if (prevLat.HasValue && prevLng.HasValue && prevAt.HasValue)
        {
            segmentMeters = GeoDistanceCalculator.CalculateHaversineMeters(
                prevLat.Value, prevLng.Value, request.Latitude, request.Longitude);
            var elapsedSec = Math.Max(0.5, (now - prevAt.Value).TotalSeconds);
            var derivedSpeed = GeoDistanceCalculator.CalculateSpeedKmh(segmentMeters, elapsedSec);
            if (!request.SpeedMps.HasValue || derivedSpeed > computedSpeedKmh)
            {
                computedSpeedKmh = derivedSpeed;
            }
        }

        // Anti-Fraud Guard: Mock GPS + Impossible Travel Check
        var pingSuspicious = false;
        string? suspiciousReason = null;

        if (request.IsMocked)
        {
            pingSuspicious = true;
            suspiciousReason = "Mock GPS / Fake GPS terdeteksi pada perangkat.";
        }
        else if (segmentMeters >= ImpossibleTravelMinJumpMeters && computedSpeedKmh > ImpossibleTravelSpeedKmh)
        {
            pingSuspicious = true;
            suspiciousReason = $"Impossible Travel terdeteksi: berpindah {segmentMeters:F0}m dengan kecepatan {computedSpeedKmh:F0} km/jam.";
        }

        var newlyFlagged = pingSuspicious && !entity.IsSuspicious;
        if (pingSuspicious)
        {
            entity.IsSuspicious = true;
            entity.SuspiciousReason = suspiciousReason;
        }

        // 1. HOT STATE: selalu update ke Hybrid Cache L1/L2 (0 beban DB)
        var livePos = BuildLiveCacheDto(entity, request.Latitude, request.Longitude, accuracy, computedSpeedKmh, distanceToDest, now);
        await cacheService.SetAsync(CacheKeys.TrackingLivePosition(entity.Id), livePos, TimeSpan.FromHours(2), cancellationToken);

        // 2. COLD TRAIL (Selective Downsampling ke DB): simpan hanya jika bergerak >= 30m ATAU >= 60 detik ATAU suspect
        var lastPersisted = entity.Breadcrumbs.OrderByDescending(b => b.RecordedAt).FirstOrDefault();
        var distFromLastPersisted = lastPersisted is null
            ? double.MaxValue
            : GeoDistanceCalculator.CalculateHaversineMeters(
                lastPersisted.Latitude, lastPersisted.Longitude, request.Latitude, request.Longitude);
        var secFromLastPersisted = lastPersisted is null
            ? double.MaxValue
            : (now - lastPersisted.RecordedAt).TotalSeconds;

        var shouldPersist = lastPersisted is null ||
                            distFromLastPersisted >= MinPersistDistanceMeters ||
                            secFromLastPersisted >= MinPersistIntervalSeconds ||
                            pingSuspicious;

        if (shouldPersist)
        {
            if (lastPersisted is not null && !pingSuspicious)
            {
                entity.TotalDistanceMeters = Math.Round(entity.TotalDistanceMeters + distFromLastPersisted, 2);
            }

            entity.LastLatitude = request.Latitude;
            entity.LastLongitude = request.Longitude;
            entity.LastAccuracyMeters = accuracy;
            entity.LastSpeedKmh = computedSpeedKmh;
            entity.LastDistanceToDestinationMeters = distanceToDest;
            entity.LastPingAt = now;
            entity.UpdatedAt = now;
            entity.UpdatedBy = currentUserService.Username ?? entity.AssigneeUsername;

            await unitOfWork.Breadcrumbs.AddAsync(new TrackingBreadcrumb
            {
                TrackingAssignmentId = entity.Id,
                Latitude = request.Latitude,
                Longitude = request.Longitude,
                AccuracyMeters = accuracy,
                SpeedKmh = computedSpeedKmh,
                DistanceToDestinationMeters = distanceToDest,
                IsMocked = request.IsMocked,
                IsSuspicious = pingSuspicious,
                EventTag = pingSuspicious ? "SUSPICIOUS" : "PING",
                RecordedAt = now,
                CreatedBy = currentUserService.Username ?? entity.AssigneeUsername
            }, cancellationToken);

            unitOfWork.Assignments.Update(entity);
            await unitOfWork.SaveChangesAsync(cancellationToken);
            if (newlyFlagged)
            {
                await InvalidateStatsCacheAsync(cancellationToken);
            }
        }

        if (newlyFlagged)
        {
            await eventBus.PublishAuditAsync(new AuditLogIntegrationEvent(
                UserId: currentUserService.UserId,
                UserName: currentUserService.Username ?? entity.AssigneeUsername,
                Action: "GPS_ANOMALY_DETECTED",
                Module: "Tracking",
                EntityId: entity.Id.ToString(),
                Details: $"[SECURITY ALERT] {entity.AssignmentCode} (@{entity.AssigneeUsername}): {suspiciousReason}",
                IpAddress: currentUserService.IpAddress,
                SourceService: "Tracking.Api"), cancellationToken);
        }

        // 3. REALTIME BROADCAST via SignalR Hub
        if (realtimeNotifier is not null)
        {
            await realtimeNotifier.NotifyLocationUpdatedAsync(livePos, cancellationToken);
        }

        return Result<TrackingPingResultDto>.Success(new TrackingPingResultDto(
            AssignmentId: entity.Id,
            Latitude: request.Latitude,
            Longitude: request.Longitude,
            SpeedKmh: computedSpeedKmh,
            DistanceToDestinationMeters: distanceToDest,
            IsInsideGeofence: isInsideGeofence,
            PersistedToDatabase: shouldPersist,
            IsSuspicious: entity.IsSuspicious,
            SuspiciousReason: entity.SuspiciousReason,
            RecordedAt: now));
    }

    public async Task<Result<TrackingDetailDto>> ReportIssueAsync(
        Guid id,
        ReportIssueRequest request,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.IssueNote))
        {
            return Result<TrackingDetailDto>.Failure("Deskripsi kendala lapangan wajib diisi.", 400);
        }

        var entity = await unitOfWork.Assignments.GetByIdWithDetailsAsync(id, cancellationToken);
        if (entity is null)
        {
            return Result<TrackingDetailDto>.Failure("Tugas tracking tidak ditemukan.", 404);
        }

        if (!IsAssigneeOrSuperAdmin(entity))
        {
            return Result<TrackingDetailDto>.Failure("Akses ditolak. Hanya petugas yang ditugaskan yang dapat melaporkan kendala.", 403);
        }

        if (entity.Status is not (TrackingStatus.InTransit or TrackingStatus.Arrived))
        {
            return Result<TrackingDetailDto>.Failure($"Kendala hanya dapat dilaporkan saat tugas berstatus InTransit atau Arrived (saat ini: {entity.Status}).", 400);
        }

        var now = DateTime.UtcNow;
        var prevStatus = entity.Status.ToString();
        var lat = request.Latitude is double rLat && request.Longitude is double rLng && GeoDistanceCalculator.IsValidCoordinate(rLat, rLng)
            ? rLat : entity.LastLatitude;
        var lng = request.Latitude is double rLat2 && request.Longitude is double rLng2 && GeoDistanceCalculator.IsValidCoordinate(rLat2, rLng2)
            ? rLng2 : entity.LastLongitude;

        entity.Status = TrackingStatus.IssueReported;
        entity.IssueNote = request.IssueNote.Trim();
        entity.UpdatedAt = now;
        entity.UpdatedBy = currentUserService.Username ?? entity.AssigneeUsername;

        var actorUsername = currentUserService.Username ?? entity.AssigneeUsername;
        var actorFullName = currentUserService.FullName ?? entity.AssigneeFullName;

        var log = new TrackingStatusLog
        {
            TrackingAssignmentId = entity.Id,
            FromStatus = prevStatus,
            ToStatus = TrackingStatus.IssueReported.ToString(),
            ActorUsername = actorUsername,
            ActorFullName = actorFullName,
            Notes = $"Kendala dilaporkan: {entity.IssueNote}",
            Latitude = lat,
            Longitude = lng,
            Timestamp = now,
            CreatedBy = actorUsername
        };
        await unitOfWork.StatusLogs.AddAsync(log, cancellationToken);
        entity.StatusLogs.Add(log);

        unitOfWork.Assignments.Update(entity);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        await InvalidateStatsCacheAsync(cancellationToken);

        await eventBus.PublishAuditAsync(new AuditLogIntegrationEvent(
            UserId: currentUserService.UserId,
            UserName: actorUsername,
            Action: "REPORT_TRACKING_ISSUE",
            Module: "Tracking",
            EntityId: entity.Id.ToString(),
            Details: $"[Tracking.Api] {actorUsername} melaporkan kendala pada '{entity.AssignmentCode}': {entity.IssueNote}",
            IpAddress: currentUserService.IpAddress,
            SourceService: "Tracking.Api"), cancellationToken);

        var livePos = await cacheService.GetAsync<LivePositionCacheDto>(CacheKeys.TrackingLivePosition(entity.Id), cancellationToken);
        if (realtimeNotifier is not null)
        {
            await realtimeNotifier.NotifyStatusChangedAsync(MapSummary(entity, livePos), "ISSUE_REPORTED", entity.IssueNote, cancellationToken);
        }

        return Result<TrackingDetailDto>.Success(MapDetail(entity, livePos), "Kendala berhasil dilaporkan ke Command Center.");
    }

    public async Task<Result<TrackingDetailDto>> ResumeTripAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var entity = await unitOfWork.Assignments.GetByIdWithDetailsAsync(id, cancellationToken);
        if (entity is null)
        {
            return Result<TrackingDetailDto>.Failure("Tugas tracking tidak ditemukan.", 404);
        }

        if (!IsAssigneeOrSuperAdmin(entity))
        {
            return Result<TrackingDetailDto>.Failure("Akses ditolak.", 403);
        }

        if (entity.Status != TrackingStatus.IssueReported)
        {
            return Result<TrackingDetailDto>.Failure("Hanya tugas berstatus IssueReported yang dapat dilanjutkan.", 400);
        }

        var now = DateTime.UtcNow;
        var actorUsername = currentUserService.Username ?? entity.AssigneeUsername;
        var actorFullName = currentUserService.FullName ?? entity.AssigneeFullName;

        entity.Status = TrackingStatus.InTransit;
        entity.UpdatedAt = now;
        entity.UpdatedBy = actorUsername;

        var log = new TrackingStatusLog
        {
            TrackingAssignmentId = entity.Id,
            FromStatus = TrackingStatus.IssueReported.ToString(),
            ToStatus = TrackingStatus.InTransit.ToString(),
            ActorUsername = actorUsername,
            ActorFullName = actorFullName,
            Notes = "Kendala teratasi. Perjalanan dilanjutkan kembali.",
            Latitude = entity.LastLatitude,
            Longitude = entity.LastLongitude,
            Timestamp = now,
            CreatedBy = actorUsername
        };
        await unitOfWork.StatusLogs.AddAsync(log, cancellationToken);
        entity.StatusLogs.Add(log);

        unitOfWork.Assignments.Update(entity);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        await InvalidateStatsCacheAsync(cancellationToken);

        var livePos = await cacheService.GetAsync<LivePositionCacheDto>(CacheKeys.TrackingLivePosition(entity.Id), cancellationToken);
        if (realtimeNotifier is not null)
        {
            await realtimeNotifier.NotifyStatusChangedAsync(MapSummary(entity, livePos), "RESUMED", log.Notes, cancellationToken);
        }

        return Result<TrackingDetailDto>.Success(MapDetail(entity, livePos), "Perjalanan dilanjutkan kembali.");
    }

    public async Task<Result<TrackingDetailDto>> MarkArrivedAsync(
        Guid id,
        StartTripRequest? request,
        CancellationToken cancellationToken = default)
    {
        var entity = await unitOfWork.Assignments.GetByIdWithDetailsAsync(id, cancellationToken);
        if (entity is null)
        {
            return Result<TrackingDetailDto>.Failure("Tugas tracking tidak ditemukan.", 404);
        }

        if (!IsAssigneeOrSuperAdmin(entity))
        {
            return Result<TrackingDetailDto>.Failure("Akses ditolak. Hanya petugas yang ditugaskan yang dapat melakukan Check-In tiba.", 403);
        }

        if (entity.Status is not (TrackingStatus.InTransit or TrackingStatus.IssueReported))
        {
            return Result<TrackingDetailDto>.Failure($"Check-In tiba hanya berlaku saat tugas InTransit/IssueReported (saat ini: {entity.Status}).", 400);
        }

        var now = DateTime.UtcNow;
        var liveCache = await cacheService.GetAsync<LivePositionCacheDto>(CacheKeys.TrackingLivePosition(entity.Id), cancellationToken);
        var lat = request?.Latitude is double rLat && request.Longitude is double rLng && GeoDistanceCalculator.IsValidCoordinate(rLat, rLng)
            ? rLat : (liveCache?.Latitude ?? entity.LastLatitude ?? entity.DestinationLatitude);
        var lng = request?.Latitude is double rLat2 && request.Longitude is double rLng2 && GeoDistanceCalculator.IsValidCoordinate(rLat2, rLng2)
            ? rLng2 : (liveCache?.Longitude ?? entity.LastLongitude ?? entity.DestinationLongitude);
        var accuracy = Math.Max(1, request?.AccuracyMeters ?? liveCache?.AccuracyMeters ?? 15);
        var isMocked = request?.IsMocked ?? false;

        var distanceToDest = GeoDistanceCalculator.CalculateHaversineMeters(
            lat, lng, entity.DestinationLatitude, entity.DestinationLongitude);
        var insideGeofence = distanceToDest <= entity.GeofenceRadiusMeters;

        if (isMocked)
        {
            entity.IsSuspicious = true;
            entity.SuspiciousReason = "Mock GPS terdeteksi saat Check-In tiba.";
        }

        var prevStatus = entity.Status.ToString();
        entity.Status = TrackingStatus.Arrived;
        entity.ArrivedAt = now;
        entity.LastLatitude = lat;
        entity.LastLongitude = lng;
        entity.LastAccuracyMeters = accuracy;
        entity.LastDistanceToDestinationMeters = distanceToDest;
        entity.LastPingAt = now;
        entity.UpdatedAt = now;
        entity.UpdatedBy = currentUserService.Username ?? entity.AssigneeUsername;

        var actorUsername = currentUserService.Username ?? entity.AssigneeUsername;
        var actorFullName = currentUserService.FullName ?? entity.AssigneeFullName;

        var crumb = new TrackingBreadcrumb
        {
            TrackingAssignmentId = entity.Id,
            Latitude = lat,
            Longitude = lng,
            AccuracyMeters = accuracy,
            SpeedKmh = 0,
            DistanceToDestinationMeters = distanceToDest,
            IsMocked = isMocked,
            IsSuspicious = isMocked,
            EventTag = "ARRIVED",
            RecordedAt = now,
            CreatedBy = actorUsername
        };
        await unitOfWork.Breadcrumbs.AddAsync(crumb, cancellationToken);
        entity.Breadcrumbs.Add(crumb);

        var log = new TrackingStatusLog
        {
            TrackingAssignmentId = entity.Id,
            FromStatus = prevStatus,
            ToStatus = TrackingStatus.Arrived.ToString(),
            ActorUsername = actorUsername,
            ActorFullName = actorFullName,
            Notes = insideGeofence
                ? $"Petugas tiba di lokasi tujuan (dalam radius geofence: {distanceToDest:F0}m <= {entity.GeofenceRadiusMeters}m)."
                : $"Petugas melakukan Check-In di luar radius geofence ({distanceToDest:F0}m > {entity.GeofenceRadiusMeters}m).",
            Latitude = lat,
            Longitude = lng,
            Timestamp = now,
            CreatedBy = actorUsername
        };
        await unitOfWork.StatusLogs.AddAsync(log, cancellationToken);
        entity.StatusLogs.Add(log);

        unitOfWork.Assignments.Update(entity);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        await InvalidateStatsCacheAsync(cancellationToken);

        var livePos = BuildLiveCacheDto(entity, lat, lng, accuracy, 0, distanceToDest, now);
        await cacheService.SetAsync(CacheKeys.TrackingLivePosition(entity.Id), livePos, TimeSpan.FromHours(2), cancellationToken);

        if (realtimeNotifier is not null)
        {
            await realtimeNotifier.NotifyLocationUpdatedAsync(livePos, cancellationToken);
            await realtimeNotifier.NotifyStatusChangedAsync(MapSummary(entity, livePos), "ARRIVED", log.Notes, cancellationToken);
        }

        return Result<TrackingDetailDto>.Success(MapDetail(entity, livePos), "Check-In tiba tercatat. Silakan unggah foto bukti (POD) untuk menyelesaikan tugas.");
    }

    public async Task<Result<TrackingDetailDto>> CompleteAssignmentAsync(
        Guid id,
        CompleteAssignmentRequest request,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.RecipientName))
        {
            return Result<TrackingDetailDto>.Failure("Nama penerima / PIC di lokasi wajib diisi.", 400);
        }

        var safePodUrl = NormalizeSafePodUrl(request.PodPhotoUrl);
        if (!string.IsNullOrWhiteSpace(request.PodPhotoUrl) && safePodUrl is null)
        {
            return Result<TrackingDetailDto>.Failure("URL foto POD tidak valid. Gunakan foto yang diunggah melalui endpoint upload internal.", 400);
        }

        var entity = await unitOfWork.Assignments.GetByIdWithDetailsAsync(id, cancellationToken);
        if (entity is null)
        {
            return Result<TrackingDetailDto>.Failure("Tugas tracking tidak ditemukan.", 404);
        }

        if (!IsAssigneeOrSuperAdmin(entity))
        {
            return Result<TrackingDetailDto>.Failure("Akses ditolak. Hanya petugas yang ditugaskan yang dapat menyelesaikan tugas ini.", 403);
        }

        if (entity.Status is not (TrackingStatus.InTransit or TrackingStatus.Arrived or TrackingStatus.IssueReported))
        {
            return Result<TrackingDetailDto>.Failure($"Tugas berstatus '{entity.Status}' tidak dapat diselesaikan.", 400);
        }

        var now = DateTime.UtcNow;
        var liveCache = await cacheService.GetAsync<LivePositionCacheDto>(CacheKeys.TrackingLivePosition(entity.Id), cancellationToken);
        var lat = request.Latitude is double rLat && request.Longitude is double rLng && GeoDistanceCalculator.IsValidCoordinate(rLat, rLng)
            ? rLat : (liveCache?.Latitude ?? entity.LastLatitude ?? entity.OriginLatitude);
        var lng = request.Latitude is double rLat2 && request.Longitude is double rLng2 && GeoDistanceCalculator.IsValidCoordinate(rLat2, rLng2)
            ? rLng2 : (liveCache?.Longitude ?? entity.LastLongitude ?? entity.OriginLongitude);
        var accuracy = Math.Max(1, request.AccuracyMeters);

        var distanceToDest = GeoDistanceCalculator.CalculateHaversineMeters(
            lat, lng, entity.DestinationLatitude, entity.DestinationLongitude);
        var isInsideGeofence = distanceToDest <= entity.GeofenceRadiusMeters;

        if (request.IsMocked)
        {
            entity.IsSuspicious = true;
            entity.SuspiciousReason = "Mock GPS terdeteksi saat menyelesaikan tugas (POD).";
        }

        // Server-side decision: jika di luar radius geofence ATAU GPS suspect -> wajib PendingVerification oleh Manager/Dispatcher
        var requiresVerification = !isInsideGeofence || entity.IsSuspicious;
        var nextStatus = requiresVerification ? TrackingStatus.PendingVerification : TrackingStatus.Completed;
        var prevStatus = entity.Status.ToString();

        entity.Status = nextStatus;
        entity.ArrivedAt ??= now;
        entity.CompletedAt = nextStatus == TrackingStatus.Completed ? now : null;
        entity.LastLatitude = lat;
        entity.LastLongitude = lng;
        entity.LastAccuracyMeters = accuracy;
        entity.LastDistanceToDestinationMeters = distanceToDest;
        entity.LastPingAt = now;
        entity.PodRecipientName = request.RecipientName.Trim();
        entity.PodNotes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        entity.PodPhotoUrl = safePodUrl;
        entity.UpdatedAt = now;
        entity.UpdatedBy = currentUserService.Username ?? entity.AssigneeUsername;

        var actorUsername = currentUserService.Username ?? entity.AssigneeUsername;
        var actorFullName = currentUserService.FullName ?? entity.AssigneeFullName;

        var crumb = new TrackingBreadcrumb
        {
            TrackingAssignmentId = entity.Id,
            Latitude = lat,
            Longitude = lng,
            AccuracyMeters = accuracy,
            SpeedKmh = 0,
            DistanceToDestinationMeters = distanceToDest,
            IsMocked = request.IsMocked,
            IsSuspicious = entity.IsSuspicious,
            EventTag = "COMPLETED",
            RecordedAt = now,
            CreatedBy = actorUsername
        };
        await unitOfWork.Breadcrumbs.AddAsync(crumb, cancellationToken);
        entity.Breadcrumbs.Add(crumb);

        var reasonNote = requiresVerification
            ? (!isInsideGeofence
                ? $"POD disubmit di luar radius geofence ({distanceToDest:F0}m > {entity.GeofenceRadiusMeters}m). Menunggu verifikasi Manager/Dispatcher."
                : $"POD disubmit namun terdapat flag anomali GPS ({entity.SuspiciousReason}). Menunggu verifikasi Manager/Dispatcher.")
            : $"Tugas selesai & terverifikasi otomatis di dalam radius geofence ({distanceToDest:F0}m). Penerima: {entity.PodRecipientName}.";

        var log = new TrackingStatusLog
        {
            TrackingAssignmentId = entity.Id,
            FromStatus = prevStatus,
            ToStatus = nextStatus.ToString(),
            ActorUsername = actorUsername,
            ActorFullName = actorFullName,
            Notes = reasonNote,
            Latitude = lat,
            Longitude = lng,
            Timestamp = now,
            CreatedBy = actorUsername
        };
        await unitOfWork.StatusLogs.AddAsync(log, cancellationToken);
        entity.StatusLogs.Add(log);

        unitOfWork.Assignments.Update(entity);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        // Hapus hot-state live cache begitu perjalanan selesai (privasi & efisiensi memori)
        await cacheService.RemoveAsync(CacheKeys.TrackingLivePosition(entity.Id), cancellationToken);
        await InvalidateStatsCacheAsync(cancellationToken);

        await eventBus.PublishAuditAsync(new AuditLogIntegrationEvent(
            UserId: currentUserService.UserId,
            UserName: actorUsername,
            Action: requiresVerification ? "SUBMIT_TRACKING_FOR_VERIFICATION" : "COMPLETE_TRACKING_ASSIGNMENT",
            Module: "Tracking",
            EntityId: entity.Id.ToString(),
            Details: $"[Tracking.Api] {actorUsername} menyelesaikan '{entity.AssignmentCode}' -> {nextStatus}. {reasonNote}",
            IpAddress: currentUserService.IpAddress,
            SourceService: "Tracking.Api"), cancellationToken);

        var summary = MapSummary(entity, null);
        if (realtimeNotifier is not null)
        {
            await realtimeNotifier.NotifyStatusChangedAsync(summary, nextStatus.ToString().ToUpperInvariant(), reasonNote, cancellationToken);
        }

        return Result<TrackingDetailDto>.Success(
            MapDetail(entity, null),
            requiresVerification
                ? "Bukti POD terkirim dan masuk antrean verifikasi Manager (di luar radius geofence atau GPS suspect)."
                : "Tugas selesai & terverifikasi otomatis! Live GPS dimatikan.");
    }

    public async Task<Result<TrackingDetailDto>> VerifyAssignmentAsync(
        Guid id,
        VerifyAssignmentRequest request,
        CancellationToken cancellationToken = default)
    {
        if (!IsDispatcherOrAdmin())
        {
            return Result<TrackingDetailDto>.Failure("Akses ditolak. Hanya Dispatcher/Manager/Admin yang dapat memverifikasi POD.", 403);
        }

        var entity = await unitOfWork.Assignments.GetByIdWithDetailsAsync(id, cancellationToken);
        if (entity is null)
        {
            return Result<TrackingDetailDto>.Failure("Tugas tracking tidak ditemukan.", 404);
        }

        if (entity.Status != TrackingStatus.PendingVerification)
        {
            return Result<TrackingDetailDto>.Failure($"Hanya tugas berstatus PendingVerification yang dapat diverifikasi (saat ini: {entity.Status}).", 400);
        }

        if (!request.Approved && string.IsNullOrWhiteSpace(request.VerificationNotes))
        {
            return Result<TrackingDetailDto>.Failure("Alasan penolakan verifikasi wajib diisi.", 400);
        }

        var now = DateTime.UtcNow;
        var actorUsername = currentUserService.Username ?? "manager";
        var actorFullName = currentUserService.FullName ?? actorUsername;

        var nextStatus = request.Approved ? TrackingStatus.Completed : TrackingStatus.Rejected;
        entity.Status = nextStatus;
        entity.VerifiedByUsername = actorUsername;
        entity.VerifiedAt = now;
        entity.VerificationNotes = string.IsNullOrWhiteSpace(request.VerificationNotes)
            ? (request.Approved ? "Disetujui setelah tinjauan peta & foto POD." : "Ditolak oleh verifikator.")
            : request.VerificationNotes.Trim();
        entity.CompletedAt = request.Approved ? now : null;
        entity.UpdatedAt = now;
        entity.UpdatedBy = actorUsername;

        var log = new TrackingStatusLog
        {
            TrackingAssignmentId = entity.Id,
            FromStatus = TrackingStatus.PendingVerification.ToString(),
            ToStatus = nextStatus.ToString(),
            ActorUsername = actorUsername,
            ActorFullName = actorFullName,
            Notes = $"Verifikasi {(request.Approved ? "DISETUJUI" : "DITOLAK")}: {entity.VerificationNotes}",
            Latitude = entity.LastLatitude,
            Longitude = entity.LastLongitude,
            Timestamp = now,
            CreatedBy = actorUsername
        };
        await unitOfWork.StatusLogs.AddAsync(log, cancellationToken);
        entity.StatusLogs.Add(log);

        unitOfWork.Assignments.Update(entity);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        await InvalidateStatsCacheAsync(cancellationToken);

        await eventBus.PublishAuditAsync(new AuditLogIntegrationEvent(
            UserId: currentUserService.UserId,
            UserName: actorUsername,
            Action: request.Approved ? "VERIFY_TRACKING_APPROVED" : "VERIFY_TRACKING_REJECTED",
            Module: "Tracking",
            EntityId: entity.Id.ToString(),
            Details: $"[Tracking.Api] {actorUsername} {(request.Approved ? "menyetujui" : "menolak")} verifikasi '{entity.AssignmentCode}': {entity.VerificationNotes}",
            IpAddress: currentUserService.IpAddress,
            SourceService: "Tracking.Api"), cancellationToken);

        var summary = MapSummary(entity, null);
        if (realtimeNotifier is not null)
        {
            await realtimeNotifier.NotifyStatusChangedAsync(summary, nextStatus.ToString().ToUpperInvariant(), log.Notes, cancellationToken);
        }

        return Result<TrackingDetailDto>.Success(
            MapDetail(entity, null),
            request.Approved ? "Verifikasi disetujui. Tugas selesai." : "Verifikasi ditolak.");
    }

    public async Task<Result<TrackingDetailDto>> CancelAssignmentAsync(
        Guid id,
        CancelAssignmentRequest? request,
        CancellationToken cancellationToken = default)
    {
        if (!IsDispatcherOrAdmin())
        {
            return Result<TrackingDetailDto>.Failure("Akses ditolak. Hanya Dispatcher/Manager/Admin yang dapat membatalkan tugas.", 403);
        }

        var entity = await unitOfWork.Assignments.GetByIdWithDetailsAsync(id, cancellationToken);
        if (entity is null)
        {
            return Result<TrackingDetailDto>.Failure("Tugas tracking tidak ditemukan.", 404);
        }

        if (entity.Status is TrackingStatus.Completed or TrackingStatus.Cancelled)
        {
            return Result<TrackingDetailDto>.Failure($"Tugas berstatus '{entity.Status}' tidak dapat dibatalkan.", 400);
        }

        var now = DateTime.UtcNow;
        var prevStatus = entity.Status.ToString();
        var actorUsername = currentUserService.Username ?? "manager";
        var actorFullName = currentUserService.FullName ?? actorUsername;
        var reason = string.IsNullOrWhiteSpace(request?.Reason) ? "Dibatalkan oleh Dispatcher." : request.Reason.Trim();

        entity.Status = TrackingStatus.Cancelled;
        entity.UpdatedAt = now;
        entity.UpdatedBy = actorUsername;

        var log = new TrackingStatusLog
        {
            TrackingAssignmentId = entity.Id,
            FromStatus = prevStatus,
            ToStatus = TrackingStatus.Cancelled.ToString(),
            ActorUsername = actorUsername,
            ActorFullName = actorFullName,
            Notes = reason,
            Timestamp = now,
            CreatedBy = actorUsername
        };
        await unitOfWork.StatusLogs.AddAsync(log, cancellationToken);
        entity.StatusLogs.Add(log);

        unitOfWork.Assignments.Update(entity);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        await cacheService.RemoveAsync(CacheKeys.TrackingLivePosition(entity.Id), cancellationToken);
        await InvalidateStatsCacheAsync(cancellationToken);

        await eventBus.PublishAuditAsync(new AuditLogIntegrationEvent(
            UserId: currentUserService.UserId,
            UserName: actorUsername,
            Action: "CANCEL_TRACKING_ASSIGNMENT",
            Module: "Tracking",
            EntityId: entity.Id.ToString(),
            Details: $"[Tracking.Api] {actorUsername} membatalkan '{entity.AssignmentCode}': {reason}",
            IpAddress: currentUserService.IpAddress,
            SourceService: "Tracking.Api"), cancellationToken);

        var summary = MapSummary(entity, null);
        if (realtimeNotifier is not null)
        {
            await realtimeNotifier.NotifyStatusChangedAsync(summary, "CANCELLED", reason, cancellationToken);
        }

        return Result<TrackingDetailDto>.Success(MapDetail(entity, null), "Tugas tracking berhasil dibatalkan.");
    }

    public async Task<Result<TrackingStatsDto>> GetStatsAsync(CancellationToken cancellationToken = default)
    {
        var stats = await cacheService.GetOrCreateAsync(
            CacheKeys.TrackingStats(),
            async ct =>
            {
                var all = await unitOfWork.Assignments.GetListAsync(cancellationToken: ct);
                return new TrackingStatsDto(
                    TotalAssignments: all.Count,
                    ActiveInTransit: all.Count(a => a.Status is TrackingStatus.InTransit or TrackingStatus.IssueReported or TrackingStatus.Arrived),
                    PendingVerification: all.Count(a => a.Status == TrackingStatus.PendingVerification),
                    CompletedAssignments: all.Count(a => a.Status == TrackingStatus.Completed),
                    SuspiciousFlags: all.Count(a => a.IsSuspicious));
            },
            TimeSpan.FromMinutes(2),
            cancellationToken);

        return Result<TrackingStatsDto>.Success(stats);
    }

    public static string? NormalizeSafePodUrl(string? rawUrl)
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

        if (trimmed.StartsWith("/api/v1/tracking/files/", StringComparison.OrdinalIgnoreCase) ||
            trimmed.StartsWith("/api/tracking/files/", StringComparison.OrdinalIgnoreCase))
        {
            return trimmed;
        }

        return null;
    }

    private bool IsDispatcherOrAdmin() =>
        currentUserService.Roles.Any(r =>
            r.Equals(RoleNames.SuperAdmin, StringComparison.OrdinalIgnoreCase) ||
            r.Equals(RoleNames.Admin, StringComparison.OrdinalIgnoreCase) ||
            r.Equals(RoleNames.Manager, StringComparison.OrdinalIgnoreCase)) ||
        currentUserService.Permissions.Contains(Permissions.Tracking.Dispatch, StringComparer.OrdinalIgnoreCase);

    private bool IsCurrentUserAssignee(TrackingAssignment a) =>
        (currentUserService.UserId is not null && a.AssigneeUserId == currentUserService.UserId.Value) ||
        (!string.IsNullOrWhiteSpace(currentUserService.Username) &&
         string.Equals(a.AssigneeUsername, currentUserService.Username, StringComparison.OrdinalIgnoreCase));

    private bool IsAssigneeOrSuperAdmin(TrackingAssignment a) =>
        IsCurrentUserAssignee(a) ||
        currentUserService.Roles.Contains(RoleNames.SuperAdmin, StringComparer.OrdinalIgnoreCase);

    private async Task InvalidateStatsCacheAsync(CancellationToken cancellationToken)
    {
        await cacheService.RemoveAsync(CacheKeys.TrackingStats(), cancellationToken);
        await cacheService.RemoveByPrefixAsync(CacheKeys.DashboardPrefix, cancellationToken);
    }

    private static LivePositionCacheDto BuildLiveCacheDto(
        TrackingAssignment entity,
        double lat,
        double lng,
        double accuracy,
        double speedKmh,
        double distanceToDest,
        DateTime recordedAtUtc) =>
        new(
            AssignmentId: entity.Id,
            AssignmentCode: entity.AssignmentCode,
            AssigneeUsername: entity.AssigneeUsername,
            AssigneeFullName: entity.AssigneeFullName,
            Latitude: lat,
            Longitude: lng,
            AccuracyMeters: accuracy,
            SpeedKmh: speedKmh,
            DistanceToDestinationMeters: distanceToDest,
            IsInsideGeofence: distanceToDest <= entity.GeofenceRadiusMeters,
            IsSuspicious: entity.IsSuspicious,
            SuspiciousReason: entity.SuspiciousReason,
            RecordedAtUtc: recordedAtUtc);

    private static TrackingSummaryDto MapSummary(TrackingAssignment a, LivePositionCacheDto? livePos)
    {
        var lat = livePos?.Latitude ?? a.LastLatitude;
        var lng = livePos?.Longitude ?? a.LastLongitude;
        var accuracy = livePos?.AccuracyMeters ?? a.LastAccuracyMeters;
        var speed = livePos?.SpeedKmh ?? a.LastSpeedKmh;
        var dist = livePos?.DistanceToDestinationMeters ?? a.LastDistanceToDestinationMeters;
        var pingAt = livePos?.RecordedAtUtc ?? a.LastPingAt;
        var inside = dist.HasValue && dist.Value <= a.GeofenceRadiusMeters;

        return new TrackingSummaryDto(
            Id: a.Id,
            AssignmentCode: a.AssignmentCode,
            Title: a.Title,
            TaskType: a.TaskType.ToString(),
            ReferenceCode: a.ReferenceCode,
            Notes: a.Notes,
            DispatcherUserId: a.DispatcherUserId,
            DispatcherUsername: a.DispatcherUsername,
            DispatcherFullName: a.DispatcherFullName,
            AssigneeUserId: a.AssigneeUserId,
            AssigneeUsername: a.AssigneeUsername,
            AssigneeFullName: a.AssigneeFullName,
            OriginLabel: a.OriginLabel,
            OriginLatitude: a.OriginLatitude,
            OriginLongitude: a.OriginLongitude,
            DestinationLabel: a.DestinationLabel,
            DestinationAddress: a.DestinationAddress,
            DestinationLatitude: a.DestinationLatitude,
            DestinationLongitude: a.DestinationLongitude,
            GeofenceRadiusMeters: a.GeofenceRadiusMeters,
            Status: a.Status.ToString(),
            LastLatitude: lat,
            LastLongitude: lng,
            LastAccuracyMeters: accuracy,
            LastSpeedKmh: speed,
            LastDistanceToDestinationMeters: dist,
            LastPingAt: pingAt,
            TotalDistanceMeters: a.TotalDistanceMeters,
            IsInsideGeofence: inside,
            IsSuspicious: a.IsSuspicious,
            SuspiciousReason: a.SuspiciousReason,
            IssueNote: a.IssueNote,
            PodPhotoUrl: a.PodPhotoUrl,
            CreatedAt: a.CreatedAt,
            StartedAt: a.StartedAt,
            ArrivedAt: a.ArrivedAt,
            CompletedAt: a.CompletedAt,
            BreadcrumbCount: a.Breadcrumbs.Count);
    }

    private static TrackingDetailDto MapDetail(TrackingAssignment a, LivePositionCacheDto? livePos) =>
        new(
            Summary: MapSummary(a, livePos),
            PodRecipientName: a.PodRecipientName,
            PodNotes: a.PodNotes,
            VerificationNotes: a.VerificationNotes,
            VerifiedByUsername: a.VerifiedByUsername,
            VerifiedAt: a.VerifiedAt,
            Breadcrumbs: a.Breadcrumbs
                .OrderBy(b => b.RecordedAt)
                .Select(b => new TrackingBreadcrumbDto(
                    b.Id,
                    b.Latitude,
                    b.Longitude,
                    b.AccuracyMeters,
                    b.SpeedKmh,
                    b.DistanceToDestinationMeters,
                    b.IsMocked,
                    b.IsSuspicious,
                    b.EventTag,
                    b.RecordedAt))
                .ToList(),
            StatusLogs: a.StatusLogs
                .OrderByDescending(l => l.Timestamp)
                .Select(l => new TrackingStatusLogDto(
                    l.Id,
                    l.FromStatus,
                    l.ToStatus,
                    l.ActorUsername,
                    l.ActorFullName,
                    l.Notes,
                    l.Latitude,
                    l.Longitude,
                    l.Timestamp))
                .ToList());
}
