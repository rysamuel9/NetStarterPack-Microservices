using BuildingBlocks.Core.Common;
using BuildingBlocks.Core.Constants;
using BuildingBlocks.Core.Contracts;
using BuildingBlocks.Core.Interfaces;
using Catalog.Api.Application.DTOs;
using Catalog.Api.Application.Interfaces;
using Catalog.Api.Domain.Entities;
using Catalog.Api.Domain.Interfaces;

namespace Catalog.Api.Application.Services;

/// <summary>
/// Implementasi Service standar di Catalog Microservice (Compact Onion Architecture):
/// 1. Transaksi lokal ke NetStarterPack_CatalogDb lewat ICatalogUnitOfWork
/// 2. Cache-Aside dan Auto-Invalidation lewat ICacheService (InMemory / Redis)
/// 3. Pengiriman AuditLogIntegrationEvent secara asinkron ke Identity.Api lewat IEventBus
/// </summary>
public class ProductService(
    ICatalogUnitOfWork unitOfWork,
    ICurrentUserService currentUserService,
    ICacheService cacheService,
    IEventBus eventBus) : IProductService
{
    public async Task<Result<IReadOnlyList<ProductDto>>> GetAllProductsAsync(
        string? search = null,
        string? category = null,
        CancellationToken cancellationToken = default)
    {
        var baseKey = CacheKeys.ProductList(null, null);

        var allDtos = await cacheService.GetOrCreateAsync(
            baseKey,
            async ct =>
            {
                var products = await unitOfWork.Products.GetListAsync(cancellationToken: ct);
                return products
                    .OrderByDescending(p => p.CreatedAt)
                    .Select(MapToDto)
                    .ToList();
            },
            TimeSpan.FromMinutes(10),
            cancellationToken);

        IEnumerable<ProductDto> query = allDtos;

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(p =>
                p.Name.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                p.Sku.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                p.Description.Contains(term, StringComparison.OrdinalIgnoreCase));
        }

        if (!string.IsNullOrWhiteSpace(category))
        {
            var catTerm = category.Trim();
            query = query.Where(p => p.Category.Equals(catTerm, StringComparison.OrdinalIgnoreCase));
        }

        return Result<IReadOnlyList<ProductDto>>.Success(query.ToList());
    }

    public async Task<Result<ProductDto>> GetProductByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var cacheKey = CacheKeys.ProductById(id);

        var dto = await cacheService.GetOrCreateAsync<ProductDto?>(
            cacheKey,
            async ct =>
            {
                var product = await unitOfWork.Products.GetByIdAsync(id, ct);
                return product is null ? null : MapToDto(product);
            },
            TimeSpan.FromMinutes(10),
            cancellationToken);

        if (dto is null)
        {
            return Result<ProductDto>.Failure("Item katalog tidak ditemukan.", 404);
        }

        return Result<ProductDto>.Success(dto);
    }

    public async Task<Result<ProductDto>> CreateProductAsync(CreateOrUpdateProductRequest request, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.Sku) || string.IsNullOrWhiteSpace(request.Name))
        {
            return Result<ProductDto>.Failure("SKU dan Nama item wajib diisi.", 400);
        }

        var sku = request.Sku.Trim().ToUpperInvariant();
        if (await unitOfWork.Products.AnyAsync(p => p.Sku == sku, cancellationToken))
        {
            return Result<ProductDto>.Failure($"Item dengan SKU '{sku}' sudah ada.", 409);
        }

        if (!Enum.TryParse<ProductStatus>(request.Status, true, out var status))
        {
            status = ProductStatus.Active;
        }

        var product = new Product
        {
            Sku = sku,
            Name = request.Name.Trim(),
            Category = string.IsNullOrWhiteSpace(request.Category) ? "General" : request.Category.Trim(),
            Description = request.Description.Trim(),
            Price = request.Price,
            Stock = request.Stock,
            Status = status,
            CreatedBy = currentUserService.Username ?? "System"
        };

        await unitOfWork.Products.AddAsync(product, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        await cacheService.RemoveByPrefixAsync(CacheKeys.ProductsPrefix, cancellationToken);
        await cacheService.RemoveByPrefixAsync(CacheKeys.DashboardPrefix, cancellationToken);

        // Publish Cross-Service Audit Event ke Identity.Api
        await eventBus.PublishAuditAsync(new AuditLogIntegrationEvent(
            UserId: currentUserService.UserId,
            UserName: currentUserService.Username ?? "System",
            Action: "CREATE_PRODUCT",
            Module: "Products",
            EntityId: product.Id.ToString(),
            Details: $"[Catalog.Api] Menambahkan item katalog '{product.Name}' (SKU: {product.Sku}).",
            IpAddress: currentUserService.IpAddress,
            SourceService: "Catalog.Api"), cancellationToken);

        return Result<ProductDto>.Success(MapToDto(product), "Item katalog berhasil ditambahkan.", 201);
    }

    public async Task<Result<ProductDto>> UpdateProductAsync(Guid id, CreateOrUpdateProductRequest request, CancellationToken cancellationToken = default)
    {
        var product = await unitOfWork.Products.GetByIdAsync(id, cancellationToken);
        if (product is null)
        {
            return Result<ProductDto>.Failure("Item katalog tidak ditemukan.", 404);
        }

        var sku = request.Sku.Trim().ToUpperInvariant();
        if (await unitOfWork.Products.AnyAsync(p => p.Id != id && p.Sku == sku, cancellationToken))
        {
            return Result<ProductDto>.Failure($"Item lain dengan SKU '{sku}' sudah terdaftar.", 409);
        }

        if (Enum.TryParse<ProductStatus>(request.Status, true, out var status))
        {
            product.Status = status;
        }

        product.Sku = sku;
        product.Name = request.Name.Trim();
        product.Category = string.IsNullOrWhiteSpace(request.Category) ? "General" : request.Category.Trim();
        product.Description = request.Description.Trim();
        product.Price = request.Price;
        product.Stock = request.Stock;
        product.UpdatedAt = DateTime.UtcNow;
        product.UpdatedBy = currentUserService.Username ?? "System";

        unitOfWork.Products.Update(product);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        await cacheService.RemoveByPrefixAsync(CacheKeys.ProductsPrefix, cancellationToken);
        await cacheService.RemoveByPrefixAsync(CacheKeys.DashboardPrefix, cancellationToken);

        await eventBus.PublishAuditAsync(new AuditLogIntegrationEvent(
            UserId: currentUserService.UserId,
            UserName: currentUserService.Username ?? "System",
            Action: "UPDATE_PRODUCT",
            Module: "Products",
            EntityId: product.Id.ToString(),
            Details: $"[Catalog.Api] Memperbarui item katalog '{product.Name}' (SKU: {product.Sku}).",
            IpAddress: currentUserService.IpAddress,
            SourceService: "Catalog.Api"), cancellationToken);

        return Result<ProductDto>.Success(MapToDto(product), "Item katalog berhasil diperbarui.");
    }

    public async Task<Result> DeleteProductAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var product = await unitOfWork.Products.GetByIdAsync(id, cancellationToken);
        if (product is null)
        {
            return Result.Failure("Item katalog tidak ditemukan.", 404);
        }

        unitOfWork.Products.Remove(product);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        await cacheService.RemoveByPrefixAsync(CacheKeys.ProductsPrefix, cancellationToken);
        await cacheService.RemoveByPrefixAsync(CacheKeys.DashboardPrefix, cancellationToken);

        await eventBus.PublishAuditAsync(new AuditLogIntegrationEvent(
            UserId: currentUserService.UserId,
            UserName: currentUserService.Username ?? "System",
            Action: "DELETE_PRODUCT",
            Module: "Products",
            EntityId: product.Id.ToString(),
            Details: $"[Catalog.Api] Menghapus item katalog '{product.Name}' (SKU: {product.Sku}).",
            IpAddress: currentUserService.IpAddress,
            SourceService: "Catalog.Api"), cancellationToken);

        return Result.Success("Item katalog berhasil dihapus.");
    }

    public async Task<Result<CatalogStatsDto>> GetCatalogStatsAsync(CancellationToken cancellationToken = default)
    {
        var stats = await cacheService.GetOrCreateAsync(
            CacheKeys.ProductStats(),
            async ct =>
            {
                var products = await unitOfWork.Products.GetListAsync(cancellationToken: ct);
                return new CatalogStatsDto(
                    TotalProducts: products.Count,
                    TotalInventoryValue: products.Sum(p => p.Price * p.Stock),
                    ActiveProducts: products.Count(p => p.Status == ProductStatus.Active),
                    OutOfStockProducts: products.Count(p => p.Status == ProductStatus.OutOfStock || p.Stock <= 0));
            },
            TimeSpan.FromMinutes(10),
            cancellationToken);

        return Result<CatalogStatsDto>.Success(stats);
    }

    private static ProductDto MapToDto(Product product) =>
        new(
            product.Id,
            product.Sku,
            product.Name,
            product.Category,
            product.Description,
            product.Price,
            product.Stock,
            product.Status.ToString(),
            product.CreatedAt,
            product.CreatedBy);
}

