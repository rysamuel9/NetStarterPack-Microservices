using BuildingBlocks.Core.Common;
using BuildingBlocks.Core.Contracts;
using Tracking.Api.Application.DTOs;

namespace Tracking.Api.Application.Interfaces;

public interface ITrackingService
{
    Task<Result<IReadOnlyList<TrackingSummaryDto>>> GetAssignmentsAsync(
        string? status = null,
        string? taskType = null,
        string? search = null,
        bool mineOnly = false,
        CancellationToken cancellationToken = default);

    Task<Result<TrackingDetailDto>> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<Result<TrackingDetailDto>> CreateAssignmentAsync(CreateTrackingAssignmentRequest request, CancellationToken cancellationToken = default);
    Task<Result<TrackingDetailDto>> StartTripAsync(Guid id, StartTripRequest? request, CancellationToken cancellationToken = default);
    Task<Result<TrackingPingResultDto>> RecordLocationPingAsync(Guid id, LocationPingRequest request, CancellationToken cancellationToken = default);
    Task<Result<TrackingDetailDto>> ReportIssueAsync(Guid id, ReportIssueRequest request, CancellationToken cancellationToken = default);
    Task<Result<TrackingDetailDto>> ResumeTripAsync(Guid id, CancellationToken cancellationToken = default);
    Task<Result<TrackingDetailDto>> MarkArrivedAsync(Guid id, StartTripRequest? request, CancellationToken cancellationToken = default);
    Task<Result<TrackingDetailDto>> CompleteAssignmentAsync(Guid id, CompleteAssignmentRequest request, CancellationToken cancellationToken = default);
    Task<Result<TrackingDetailDto>> VerifyAssignmentAsync(Guid id, VerifyAssignmentRequest request, CancellationToken cancellationToken = default);
    Task<Result<TrackingDetailDto>> CancelAssignmentAsync(Guid id, CancelAssignmentRequest? request, CancellationToken cancellationToken = default);
    Task<Result<TrackingStatsDto>> GetStatsAsync(CancellationToken cancellationToken = default);
}

public interface ITrackingRealtimeNotifier
{
    Task NotifyLocationUpdatedAsync(LivePositionCacheDto position, CancellationToken cancellationToken = default);
    Task NotifyStatusChangedAsync(TrackingSummaryDto summary, string action, string? note = null, CancellationToken cancellationToken = default);
    Task NotifyAssignmentCreatedAsync(TrackingSummaryDto summary, CancellationToken cancellationToken = default);
}
