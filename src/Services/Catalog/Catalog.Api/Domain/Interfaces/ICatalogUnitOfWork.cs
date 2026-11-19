using BuildingBlocks.Core.Interfaces;
using Catalog.Api.Domain.Entities;

namespace Catalog.Api.Domain.Interfaces;

/// <summary>
/// Kontrak Unit of Work khusus untuk database Catalog Microservice.
/// </summary>
public interface ICatalogUnitOfWork
{
    IRepository<Product> Products { get; }
    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
