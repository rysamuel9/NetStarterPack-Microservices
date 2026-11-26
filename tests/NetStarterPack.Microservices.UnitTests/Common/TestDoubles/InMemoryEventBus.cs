using BuildingBlocks.Core.Contracts;
using BuildingBlocks.Core.Interfaces;

namespace NetStarterPack.Microservices.UnitTests.Common.TestDoubles;

/// <summary>
/// Pengganti HttpEventBus di unit test untuk merekam seluruh AuditLogIntegrationEvent
/// yang di-publish oleh microservice ke memori RAM.
/// </summary>
public sealed class InMemoryEventBus : IEventBus
{
    public List<AuditLogIntegrationEvent> PublishedEvents { get; } = new();
    public List<NotificationIntegrationEvent> PublishedNotifications { get; } = new();

    public Task PublishAuditAsync(AuditLogIntegrationEvent auditEvent, CancellationToken cancellationToken = default)
    {
        PublishedEvents.Add(auditEvent);
        return Task.CompletedTask;
    }

    public Task PublishNotificationAsync(NotificationIntegrationEvent notificationEvent, CancellationToken cancellationToken = default)
    {
        PublishedNotifications.Add(notificationEvent);
        return Task.CompletedTask;
    }
}
