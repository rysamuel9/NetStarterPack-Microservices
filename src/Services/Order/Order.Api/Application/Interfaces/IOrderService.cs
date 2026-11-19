using BuildingBlocks.Core.Common;
using BuildingBlocks.Core.Contracts;
using Order.Api.Application.DTOs;

namespace Order.Api.Application.Interfaces;

public interface IOrderService
{
    Task<Result<IReadOnlyList<OrderDto>>> GetAllOrdersAsync(string? search = null, string? status = null, CancellationToken cancellationToken = default);
    Task<Result<OrderDto>> GetOrderByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<Result<OrderDto>> CreateOrderAsync(CreateOrUpdateOrderRequest request, CancellationToken cancellationToken = default);
    Task<Result<OrderDto>> UpdateOrderAsync(Guid id, CreateOrUpdateOrderRequest request, CancellationToken cancellationToken = default);
    Task<Result> DeleteOrderAsync(Guid id, CancellationToken cancellationToken = default);
    Task<Result<OrderStatsDto>> GetOrderStatsAsync(CancellationToken cancellationToken = default);
}
