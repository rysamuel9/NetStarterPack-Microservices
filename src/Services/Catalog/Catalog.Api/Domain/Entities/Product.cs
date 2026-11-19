using BuildingBlocks.Core.Common;

namespace Catalog.Api.Domain.Entities;

public enum ProductStatus
{
    Draft = 0,
    Active = 1,
    OutOfStock = 2,
    Archived = 3
}

/// <summary>
/// Entitas domain utama di Catalog Microservice (Database terpisah: NetStarterPack_CatalogDb).
/// </summary>
public class Product : BaseEntity
{
    public string Sku { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public decimal Price { get; set; }
    public int Stock { get; set; }
    public ProductStatus Status { get; set; } = ProductStatus.Active;
}
