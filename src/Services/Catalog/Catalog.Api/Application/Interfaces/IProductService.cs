using BuildingBlocks.Core.Common;
using BuildingBlocks.Core.Contracts;
using Catalog.Api.Application.DTOs;

namespace Catalog.Api.Application.Interfaces;

public interface IProductService
{
    Task<Result<IReadOnlyList<ProductDto>>> GetAllProductsAsync(string? search = null, string? category = null, CancellationToken cancellationToken = default);
    Task<Result<ProductDto>> GetProductByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<Result<ProductDto>> CreateProductAsync(CreateOrUpdateProductRequest request, CancellationToken cancellationToken = default);
    Task<Result<ProductDto>> UpdateProductAsync(Guid id, CreateOrUpdateProductRequest request, CancellationToken cancellationToken = default);
    Task<Result> DeleteProductAsync(Guid id, CancellationToken cancellationToken = default);
    Task<Result<CatalogStatsDto>> GetCatalogStatsAsync(CancellationToken cancellationToken = default);
}
