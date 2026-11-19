using BuildingBlocks.Core.Interfaces;

namespace Order.Api.Domain.Interfaces;

public interface IOrderUnitOfWork
{
    IRepository<Entities.Order> Orders { get; }
    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
