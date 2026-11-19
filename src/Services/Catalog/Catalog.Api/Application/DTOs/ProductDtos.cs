namespace Catalog.Api.Application.DTOs;

public record ProductDto(
    Guid Id,
    string Sku,
    string Name,
    string Category,
    string Description,
    decimal Price,
    int Stock,
    string Status,
    DateTime CreatedAt,
    string? CreatedBy
);

public record CreateOrUpdateProductRequest(
    string Sku,
    string Name,
    string Category,
    string Description,
    decimal Price,
    int Stock,
    string Status
);
