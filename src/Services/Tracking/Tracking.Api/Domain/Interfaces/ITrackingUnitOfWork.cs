using BuildingBlocks.Core.Interfaces;
using Tracking.Api.Domain.Entities;

namespace Tracking.Api.Domain.Interfaces;

public interface ITrackingAssignmentRepository : IRepository<TrackingAssignment>
{
    Task<List<TrackingAssignment>> GetAllWithSummaryAsync(CancellationToken cancellationToken = default);
    Task<TrackingAssignment?> GetByIdWithDetailsAsync(Guid id, CancellationToken cancellationToken = default);
}

public interface ITrackingUnitOfWork
{
    ITrackingAssignmentRepository Assignments { get; }
    IRepository<TrackingBreadcrumb> Breadcrumbs { get; }
    IRepository<TrackingStatusLog> StatusLogs { get; }
    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
