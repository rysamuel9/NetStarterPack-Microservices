namespace Tracking.Api.Application.DTOs;

public record LivePositionCacheDto(
    Guid AssignmentId,
    string AssignmentCode,
    string AssigneeUsername,
    string AssigneeFullName,
    double Latitude,
    double Longitude,
    double AccuracyMeters,
    double SpeedKmh,
    double DistanceToDestinationMeters,
    bool IsInsideGeofence,
    bool IsSuspicious,
    string? SuspiciousReason,
    DateTime RecordedAtUtc
);

public record TrackingBreadcrumbDto(
    Guid Id,
    double Latitude,
    double Longitude,
    double AccuracyMeters,
    double SpeedKmh,
    double DistanceToDestinationMeters,
    bool IsMocked,
    bool IsSuspicious,
    string EventTag,
    DateTime RecordedAt
);

public record TrackingStatusLogDto(
    Guid Id,
    string FromStatus,
    string ToStatus,
    string ActorUsername,
    string ActorFullName,
    string? Notes,
    double? Latitude,
    double? Longitude,
    DateTime Timestamp
);

public record TrackingSummaryDto(
    Guid Id,
    string AssignmentCode,
    string Title,
    string TaskType,
    string? ReferenceCode,
    string? Notes,
    Guid DispatcherUserId,
    string DispatcherUsername,
    string DispatcherFullName,
    Guid AssigneeUserId,
    string AssigneeUsername,
    string AssigneeFullName,
    string OriginLabel,
    double OriginLatitude,
    double OriginLongitude,
    string DestinationLabel,
    string DestinationAddress,
    double DestinationLatitude,
    double DestinationLongitude,
    int GeofenceRadiusMeters,
    string Status,
    double? LastLatitude,
    double? LastLongitude,
    double? LastAccuracyMeters,
    double? LastSpeedKmh,
    double? LastDistanceToDestinationMeters,
    DateTime? LastPingAt,
    double TotalDistanceMeters,
    bool IsInsideGeofence,
    bool IsSuspicious,
    string? SuspiciousReason,
    string? IssueNote,
    string? PodPhotoUrl,
    DateTime CreatedAt,
    DateTime? StartedAt,
    DateTime? ArrivedAt,
    DateTime? CompletedAt,
    int BreadcrumbCount
);

public record TrackingDetailDto(
    TrackingSummaryDto Summary,
    string? PodRecipientName,
    string? PodNotes,
    string? VerificationNotes,
    string? VerifiedByUsername,
    DateTime? VerifiedAt,
    IReadOnlyList<TrackingBreadcrumbDto> Breadcrumbs,
    IReadOnlyList<TrackingStatusLogDto> StatusLogs
);

public record TrackingPingResultDto(
    Guid AssignmentId,
    double Latitude,
    double Longitude,
    double SpeedKmh,
    double DistanceToDestinationMeters,
    bool IsInsideGeofence,
    bool PersistedToDatabase,
    bool IsSuspicious,
    string? SuspiciousReason,
    DateTime RecordedAt
);

public record PodUploadResponseDto(
    string FileName,
    string StoredFileName,
    string ContentType,
    long FileSizeBytes,
    string Url
);

public record CreateTrackingAssignmentRequest(
    string Title,
    string TaskType,
    string? ReferenceCode,
    string? Notes,
    Guid AssigneeUserId,
    string AssigneeUsername,
    string AssigneeFullName,
    string? OriginLabel,
    double? OriginLatitude,
    double? OriginLongitude,
    string DestinationLabel,
    string DestinationAddress,
    double DestinationLatitude,
    double DestinationLongitude,
    int GeofenceRadiusMeters = 150
);

public record LocationPingRequest(
    double Latitude,
    double Longitude,
    double AccuracyMeters = 15,
    double? SpeedMps = null,
    bool IsMocked = false
);

public record StartTripRequest(
    double? Latitude = null,
    double? Longitude = null,
    double AccuracyMeters = 15,
    bool IsMocked = false
);

public record ReportIssueRequest(
    string IssueNote,
    double? Latitude = null,
    double? Longitude = null
);

public record CompleteAssignmentRequest(
    string RecipientName,
    string? Notes,
    string? PodPhotoUrl,
    double? Latitude = null,
    double? Longitude = null,
    double AccuracyMeters = 15,
    bool IsMocked = false
);

public record VerifyAssignmentRequest(
    bool Approved,
    string? VerificationNotes
);

public record CancelAssignmentRequest(
    string? Reason
);
