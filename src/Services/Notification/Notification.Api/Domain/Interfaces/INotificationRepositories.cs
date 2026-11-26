using BuildingBlocks.Core.Interfaces;
using Notification.Api.Domain.Entities;

namespace Notification.Api.Domain.Interfaces;

public interface INotificationUnitOfWork : IDisposable
{
    IRepository<NotificationItem> Notifications { get; }
    IRepository<NotificationTemplate> Templates { get; }
    IRepository<NotificationPreference> Preferences { get; }
    IRepository<UserPushDevice> PushDevices { get; }
    IRepository<NotificationDeliveryLog> DeliveryLogs { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
