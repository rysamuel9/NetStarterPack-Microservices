using BuildingBlocks.Core.Common;
using BuildingBlocks.Core.Interfaces;
using Announcement.Api.Domain.Entities;

namespace Announcement.Api.Domain.Interfaces;

public interface IAnnouncementRepository : IRepository<Entities.Announcement>
{
    Task<Entities.Announcement?> GetByIdWithDetailsAsync(Guid id, CancellationToken cancellationToken = default);
    Task<(IReadOnlyList<Entities.Announcement> Items, int TotalCount)> GetPagedAsync(
        int page,
        int pageSize,
        string? type,
        string? search,
        CancellationToken cancellationToken = default);
    Task<IReadOnlyList<Entities.Announcement>> GetPublishedWithInteractionsAsync(CancellationToken cancellationToken = default);
}

public interface IAnnouncementUnitOfWork
{
    IAnnouncementRepository Announcements { get; }
    IRepository<AnnouncementAttachment> Attachments { get; }
    IRepository<AnnouncementLike> Likes { get; }
    IRepository<AnnouncementComment> Comments { get; }
    IRepository<AnnouncementRead> Reads { get; }
    IRepository<T> Repository<T>() where T : BaseEntity;
    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
