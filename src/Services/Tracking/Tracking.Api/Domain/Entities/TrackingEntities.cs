using BuildingBlocks.Core.Common;

namespace Tracking.Api.Domain.Entities;

public enum TrackingTaskType
{
    Delivery = 1,
    FieldVisit = 2,
    Maintenance = 3
}

public enum TrackingStatus
{
    Assigned = 1,
    InTransit = 2,
    IssueReported = 3,
    Arrived = 4,
    PendingVerification = 5,
    Completed = 6,
    Rejected = 7,
    Cancelled = 8
}

/// <summary>
/// Entitas utama tugas lapangan / pengiriman dengan pelacakan GPS realtime, geofence tujuan, dan bukti POD.
/// </summary>
public class TrackingAssignment : BaseEntity
{
    public string AssignmentCode { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public TrackingTaskType TaskType { get; set; } = TrackingTaskType.Delivery;
    public string? ReferenceCode { get; set; }
    public string? Notes { get; set; }

    public Guid DispatcherUserId { get; set; }
    public string DispatcherUsername { get; set; } = string.Empty;
    public string DispatcherFullName { get; set; } = string.Empty;

    public Guid AssigneeUserId { get; set; }
    public string AssigneeUsername { get; set; } = string.Empty;
    public string AssigneeFullName { get; set; } = string.Empty;

    public string OriginLabel { get; set; } = "Kantor Pusat";
    public double OriginLatitude { get; set; }
    public double OriginLongitude { get; set; }

    public string DestinationLabel { get; set; } = string.Empty;
    public string DestinationAddress { get; set; } = string.Empty;
    public double DestinationLatitude { get; set; }
    public double DestinationLongitude { get; set; }
    public int GeofenceRadiusMeters { get; set; } = 150;

    public TrackingStatus Status { get; set; } = TrackingStatus.Assigned;
    public DateTime? StartedAt { get; set; }
    public DateTime? ArrivedAt { get; set; }
    public DateTime? CompletedAt { get; set; }

    public double? LastLatitude { get; set; }
    public double? LastLongitude { get; set; }
    public double? LastAccuracyMeters { get; set; }
    public double? LastSpeedKmh { get; set; }
    public double? LastDistanceToDestinationMeters { get; set; }
    public DateTime? LastPingAt { get; set; }
    public double TotalDistanceMeters { get; set; }

    public bool IsSuspicious { get; set; }
    public string? SuspiciousReason { get; set; }

    public string? IssueNote { get; set; }
    public string? PodPhotoUrl { get; set; }
    public string? PodRecipientName { get; set; }
    public string? PodNotes { get; set; }

    public string? VerificationNotes { get; set; }
    public string? VerifiedByUsername { get; set; }
    public DateTime? VerifiedAt { get; set; }

    public ICollection<TrackingBreadcrumb> Breadcrumbs { get; set; } = new List<TrackingBreadcrumb>();
    public ICollection<TrackingStatusLog> StatusLogs { get; set; } = new List<TrackingStatusLog>();
}

/// <summary>
/// Titik jejak rute (cold trail) yang disimpan secara selektif (downsampling >= 30m atau >= 60 detik atau transisi status).
/// </summary>
public class TrackingBreadcrumb : BaseEntity
{
    public Guid TrackingAssignmentId { get; set; }
    public TrackingAssignment Assignment { get; set; } = null!;

    public double Latitude { get; set; }
    public double Longitude { get; set; }
    public double AccuracyMeters { get; set; }
    public double SpeedKmh { get; set; }
    public double DistanceToDestinationMeters { get; set; }
    public bool IsMocked { get; set; }
    public bool IsSuspicious { get; set; }
    public string EventTag { get; set; } = "PING";
    public DateTime RecordedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Riwayat transisi status tugas lapangan yang bersifat kronologis dan tidak dapat diubah.
/// </summary>
public class TrackingStatusLog : BaseEntity
{
    public Guid TrackingAssignmentId { get; set; }
    public TrackingAssignment Assignment { get; set; } = null!;

    public string FromStatus { get; set; } = string.Empty;
    public string ToStatus { get; set; } = string.Empty;
    public string ActorUsername { get; set; } = string.Empty;
    public string ActorFullName { get; set; } = string.Empty;
    public string? Notes { get; set; }
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}
