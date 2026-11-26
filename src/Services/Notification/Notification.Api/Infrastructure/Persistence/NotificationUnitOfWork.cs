using BuildingBlocks.Core.Interfaces;
using BuildingBlocks.Infrastructure.Persistence;
using Notification.Api.Domain.Entities;
using Notification.Api.Domain.Interfaces;

namespace Notification.Api.Infrastructure.Persistence;

public class NotificationUnitOfWork(NotificationDbContext dbContext) : INotificationUnitOfWork
{
    public IRepository<NotificationItem> Notifications { get; } = new GenericRepository<NotificationItem, NotificationDbContext>(dbContext);
    public IRepository<NotificationTemplate> Templates { get; } = new GenericRepository<NotificationTemplate, NotificationDbContext>(dbContext);
    public IRepository<NotificationPreference> Preferences { get; } = new GenericRepository<NotificationPreference, NotificationDbContext>(dbContext);
    public IRepository<UserPushDevice> PushDevices { get; } = new GenericRepository<UserPushDevice, NotificationDbContext>(dbContext);
    public IRepository<NotificationDeliveryLog> DeliveryLogs { get; } = new GenericRepository<NotificationDeliveryLog, NotificationDbContext>(dbContext);

    public Task<int> SaveChangesAsync(CancellationToken cancellationToken = default) =>
        dbContext.SaveChangesAsync(cancellationToken);

    public void Dispose()
    {
        dbContext.Dispose();
        GC.SuppressFinalize(this);
    }
}
