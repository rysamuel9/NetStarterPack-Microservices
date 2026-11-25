using BuildingBlocks.Core.Interfaces;
using MasterData.Api.Domain.Entities;

namespace MasterData.Api.Domain.Interfaces;

public interface IMasterDataUnitOfWork
{
    IRepository<MasterLookup> Lookups { get; }
    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
