namespace Order.Api.Application.DTOs;

public record OrderDto(
    Guid Id,
    string OrderNumber,
    string CustomerName,
    string CustomerEmail,
    string ProductSku,
    string ProductName,
    int Quantity,
    decimal UnitPrice,
    decimal TotalAmount,
    string Status,
    string Notes,
    DateTime CreatedAt,
    string? CreatedBy
);

public record CreateOrUpdateOrderRequest(
    string OrderNumber,
    string CustomerName,
    string CustomerEmail,
    string ProductSku,
    string ProductName,
    int Quantity,
    decimal UnitPrice,
    string Status,
    string Notes
);
