using BuildingBlocks.Core.Constants;
using BuildingBlocks.Security;
using Microsoft.AspNetCore.SignalR;
using Tracking.Api.Application.DTOs;
using Tracking.Api.Application.Interfaces;

namespace Tracking.Api.Infrastructure.Realtime;

/// <summary>
/// ASP.NET Core SignalR Hub untuk Live Location Tracking &amp; Field Dispatch Command Center.
/// Diautentikasi menggunakan Zero-Trust JWT + permission Tracking.View.
/// </summary>
[HasPermission(Permissions.Tracking.View)]
public class TrackingHub : Hub
{
    public const string CommandCenterGroup = "tracking-command-center";

    public static string AssignmentRoom(Guid assignmentId) => $"tracking-assignment-{assignmentId:N}";
    public static string AssignmentRoom(string assignmentId) =>
        Guid.TryParse(assignmentId, out var parsed) ? AssignmentRoom(parsed) : $"tracking-assignment-{assignmentId}";

    public Task JoinCommandCenter() =>
        Groups.AddToGroupAsync(Context.ConnectionId, CommandCenterGroup);

    public Task LeaveCommandCenter() =>
        Groups.RemoveFromGroupAsync(Context.ConnectionId, CommandCenterGroup);

    public Task JoinAssignmentRoom(string assignmentId) =>
        Groups.AddToGroupAsync(Context.ConnectionId, AssignmentRoom(assignmentId));

    public Task LeaveAssignmentRoom(string assignmentId) =>
        Groups.RemoveFromGroupAsync(Context.ConnectionId, AssignmentRoom(assignmentId));
}

public class SignalRTrackingRealtimeNotifier(
    IHubContext<TrackingHub> hubContext,
    ILogger<SignalRTrackingRealtimeNotifier> logger) : ITrackingRealtimeNotifier
{
    public async Task NotifyLocationUpdatedAsync(LivePositionCacheDto position, CancellationToken cancellationToken = default)
    {
        try
        {
            await hubContext.Clients.Group(TrackingHub.AssignmentRoom(position.AssignmentId))
                .SendAsync("LocationUpdated", position, cancellationToken);

            await hubContext.Clients.Group(TrackingHub.CommandCenterGroup)
                .SendAsync("LocationUpdated", position, cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "[SignalR] Gagal broadcast LocationUpdated untuk {AssignmentId}.", position.AssignmentId);
        }
    }

    public async Task NotifyStatusChangedAsync(
        TrackingSummaryDto summary,
        string action,
        string? note = null,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var payload = new { summary, action, note, timestamp = DateTime.UtcNow };

            await hubContext.Clients.Group(TrackingHub.AssignmentRoom(summary.Id))
                .SendAsync("AssignmentStatusChanged", payload, cancellationToken);

            await hubContext.Clients.Group(TrackingHub.CommandCenterGroup)
                .SendAsync("AssignmentStatusChanged", payload, cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "[SignalR] Gagal broadcast AssignmentStatusChanged untuk {AssignmentId}.", summary.Id);
        }
    }

    public async Task NotifyAssignmentCreatedAsync(TrackingSummaryDto summary, CancellationToken cancellationToken = default)
    {
        try
        {
            await hubContext.Clients.Group(TrackingHub.CommandCenterGroup)
                .SendAsync("AssignmentCreated", summary, cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "[SignalR] Gagal broadcast AssignmentCreated untuk {AssignmentId}.", summary.Id);
        }
    }
}
