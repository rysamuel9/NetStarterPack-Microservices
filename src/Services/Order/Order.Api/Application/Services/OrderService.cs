using BuildingBlocks.Core.Common;
using BuildingBlocks.Core.Constants;
using BuildingBlocks.Core.Contracts;
using BuildingBlocks.Core.Interfaces;
using Order.Api.Application.DTOs;
using Order.Api.Application.Interfaces;
using Order.Api.Domain.Entities;
using Order.Api.Domain.Interfaces;

namespace Order.Api.Application.Services;

/// <summary>
/// Implementasi Service standar di Order Microservice (Port 5083 - Compact Onion Architecture):
/// 1. Transaksi lokal ke NetStarterPack_OrderDb lewat IOrderUnitOfWork
/// 2. Cache-Aside dan Auto-Invalidation lewat ICacheService
/// 3. Pengiriman AuditLogIntegrationEvent secara asinkron ke Identity.Api lewat IEventBus
/// </summary>
public class OrderService(
    IOrderUnitOfWork unitOfWork,
    ICurrentUserService currentUserService,
    ICacheService cacheService,
    IEventBus eventBus) : IOrderService
{
    public async Task<Result<IReadOnlyList<OrderDto>>> GetAllOrdersAsync(
        string? search = null,
        string? status = null,
        CancellationToken cancellationToken = default)
    {
        var baseKey = CacheKeys.OrderList(null, null);

        var allDtos = await cacheService.GetOrCreateAsync(
            baseKey,
            async ct =>
            {
                var orders = await unitOfWork.Orders.GetListAsync(cancellationToken: ct);
                return orders
                    .OrderByDescending(o => o.CreatedAt)
                    .Select(MapToDto)
                    .ToList();
            },
            TimeSpan.FromMinutes(10),
            cancellationToken);

        IEnumerable<OrderDto> query = allDtos;

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(o =>
                o.OrderNumber.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                o.CustomerName.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                o.ProductName.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                o.ProductSku.Contains(term, StringComparison.OrdinalIgnoreCase));
        }

        if (!string.IsNullOrWhiteSpace(status))
        {
            var statusTerm = status.Trim();
            query = query.Where(o => o.Status.Equals(statusTerm, StringComparison.OrdinalIgnoreCase));
        }

        return Result<IReadOnlyList<OrderDto>>.Success(query.ToList());
    }

    public async Task<Result<OrderDto>> GetOrderByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var dto = await cacheService.GetOrCreateAsync<OrderDto?>(
            CacheKeys.OrderById(id),
            async ct =>
            {
                var order = await unitOfWork.Orders.GetByIdAsync(id, ct);
                return order is null ? null : MapToDto(order);
            },
            TimeSpan.FromMinutes(10),
            cancellationToken);

        return dto is null
            ? Result<OrderDto>.Failure("Data pesanan tidak ditemukan.", 404)
            : Result<OrderDto>.Success(dto);
    }

    public async Task<Result<OrderDto>> CreateOrderAsync(
        CreateOrUpdateOrderRequest request,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.OrderNumber) ||
            string.IsNullOrWhiteSpace(request.CustomerName) ||
            string.IsNullOrWhiteSpace(request.ProductName))
        {
            return Result<OrderDto>.Failure("Nomor Order, Nama Pelanggan, dan Nama Produk wajib diisi.", 400);
        }

        if (request.Quantity <= 0)
        {
            return Result<OrderDto>.Failure("Jumlah (Quantity) pesanan minimal 1 unit.", 400);
        }

        var orderNo = request.OrderNumber.Trim().ToUpperInvariant();
        if (await unitOfWork.Orders.AnyAsync(o => o.OrderNumber == orderNo, cancellationToken))
        {
            return Result<OrderDto>.Failure($"Pesanan dengan nomor '{orderNo}' sudah terdaftar.", 409);
        }

        if (!Enum.TryParse<OrderStatus>(request.Status, true, out var status))
        {
            status = OrderStatus.Pending;
        }

        var order = new Domain.Entities.Order
        {
            OrderNumber = orderNo,
            CustomerName = request.CustomerName.Trim(),
            CustomerEmail = request.CustomerEmail.Trim(),
            ProductSku = string.IsNullOrWhiteSpace(request.ProductSku) ? "CUSTOM-ITEM" : request.ProductSku.Trim().ToUpperInvariant(),
            ProductName = request.ProductName.Trim(),
            Quantity = request.Quantity,
            UnitPrice = request.UnitPrice,
            TotalAmount = request.Quantity * request.UnitPrice,
            Status = status,
            Notes = request.Notes.Trim(),
            CreatedBy = currentUserService.Username ?? "System"
        };

        await unitOfWork.Orders.AddAsync(order, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        await cacheService.RemoveByPrefixAsync(CacheKeys.OrdersPrefix, cancellationToken);
        await cacheService.RemoveByPrefixAsync(CacheKeys.DashboardPrefix, cancellationToken);

        await eventBus.PublishAuditAsync(new AuditLogIntegrationEvent(
            UserId: currentUserService.UserId,
            UserName: currentUserService.Username ?? "System",
            Action: "CREATE_ORDER",
            Module: "Orders",
            EntityId: order.Id.ToString(),
            Details: $"[Order.Api] Membuat pesanan '{order.OrderNumber}' untuk '{order.CustomerName}' ({order.ProductName} x{order.Quantity}).",
            IpAddress: currentUserService.IpAddress,
            SourceService: "Order.Api"), cancellationToken);

        await eventBus.PublishNotificationAsync(new NotificationIntegrationEvent(
            TemplateCode: NotificationTemplateCodes.OrderCreated,
            Category: NotificationCategories.Order,
            Title: $"Pesanan Baru: {order.OrderNumber}",
            Message: $"{currentUserService.FullName ?? currentUserService.Username ?? "User"} membuat pesanan {order.OrderNumber} untuk {order.CustomerName} senilai Rp {order.TotalAmount:N0}.",
            TargetRoles: [RoleNames.Manager, RoleNames.FinanceDirector, RoleNames.Admin],
            ExcludeUserId: currentUserService.UserId,
            Variables: new()
            {
                ["order_number"] = order.OrderNumber,
                ["customer_name"] = order.CustomerName,
                ["total_amount"] = $"Rp {order.TotalAmount:N0}",
                ["status"] = order.Status.ToString(),
                ["actor_name"] = currentUserService.FullName ?? currentUserService.Username ?? "System"
            },
            ActionUrl: "/orders",
            EntityId: order.Id.ToString(),
            Severity: "Info",
            SourceService: "Order.Api"), cancellationToken);

        return Result<OrderDto>.Success(MapToDto(order), "Pesanan baru berhasil dibuat.", 201);
    }

    public async Task<Result<OrderDto>> UpdateOrderAsync(
        Guid id,
        CreateOrUpdateOrderRequest request,
        CancellationToken cancellationToken = default)
    {
        var order = await unitOfWork.Orders.GetByIdAsync(id, cancellationToken);
        if (order is null)
        {
            return Result<OrderDto>.Failure("Data pesanan tidak ditemukan.", 404);
        }

        var orderNo = request.OrderNumber.Trim().ToUpperInvariant();
        if (await unitOfWork.Orders.AnyAsync(o => o.Id != id && o.OrderNumber == orderNo, cancellationToken))
        {
            return Result<OrderDto>.Failure($"Pesanan lain dengan nomor '{orderNo}' sudah terdaftar.", 409);
        }

        var previousStatus = order.Status;
        if (Enum.TryParse<OrderStatus>(request.Status, true, out var status))
        {
            order.Status = status;
        }

        order.OrderNumber = orderNo;
        order.CustomerName = request.CustomerName.Trim();
        order.CustomerEmail = request.CustomerEmail.Trim();
        order.ProductSku = string.IsNullOrWhiteSpace(request.ProductSku) ? order.ProductSku : request.ProductSku.Trim().ToUpperInvariant();
        order.ProductName = request.ProductName.Trim();
        order.Quantity = Math.Max(1, request.Quantity);
        order.UnitPrice = request.UnitPrice;
        order.TotalAmount = order.Quantity * order.UnitPrice;
        order.Notes = request.Notes.Trim();
        order.UpdatedAt = DateTime.UtcNow;
        order.UpdatedBy = currentUserService.Username ?? "System";

        unitOfWork.Orders.Update(order);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        await cacheService.RemoveByPrefixAsync(CacheKeys.OrdersPrefix, cancellationToken);
        await cacheService.RemoveByPrefixAsync(CacheKeys.DashboardPrefix, cancellationToken);

        await eventBus.PublishAuditAsync(new AuditLogIntegrationEvent(
            UserId: currentUserService.UserId,
            UserName: currentUserService.Username ?? "System",
            Action: "UPDATE_ORDER",
            Module: "Orders",
            EntityId: order.Id.ToString(),
            Details: $"[Order.Api] Memperbarui pesanan '{order.OrderNumber}' (Status: {order.Status}).",
            IpAddress: currentUserService.IpAddress,
            SourceService: "Order.Api"), cancellationToken);

        if (previousStatus != order.Status)
        {
            await eventBus.PublishNotificationAsync(new NotificationIntegrationEvent(
                TemplateCode: NotificationTemplateCodes.OrderStatusChanged,
                Category: NotificationCategories.Order,
                Title: $"Status Pesanan {order.OrderNumber}: {order.Status}",
                Message: $"Pesanan {order.OrderNumber} ({order.CustomerName}) berubah status dari {previousStatus} menjadi {order.Status}.",
                TargetRoles: [RoleNames.Manager, RoleNames.FinanceDirector, RoleNames.Admin],
                ExcludeUserId: currentUserService.UserId,
                Variables: new()
                {
                    ["order_number"] = order.OrderNumber,
                    ["customer_name"] = order.CustomerName,
                    ["status"] = order.Status.ToString(),
                    ["actor_name"] = currentUserService.FullName ?? currentUserService.Username ?? "System"
                },
                ActionUrl: "/orders",
                EntityId: order.Id.ToString(),
                Severity: order.Status == OrderStatus.Cancelled ? "Warning" : "Success",
                SourceService: "Order.Api"), cancellationToken);
        }

        return Result<OrderDto>.Success(MapToDto(order), "Data pesanan berhasil diperbarui.");
    }

    public async Task<Result> DeleteOrderAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var order = await unitOfWork.Orders.GetByIdAsync(id, cancellationToken);
        if (order is null)
        {
            return Result.Failure("Data pesanan tidak ditemukan.", 404);
        }

        unitOfWork.Orders.Remove(order);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        await cacheService.RemoveByPrefixAsync(CacheKeys.OrdersPrefix, cancellationToken);
        await cacheService.RemoveByPrefixAsync(CacheKeys.DashboardPrefix, cancellationToken);

        await eventBus.PublishAuditAsync(new AuditLogIntegrationEvent(
            UserId: currentUserService.UserId,
            UserName: currentUserService.Username ?? "System",
            Action: "DELETE_ORDER",
            Module: "Orders",
            EntityId: order.Id.ToString(),
            Details: $"[Order.Api] Menghapus pesanan '{order.OrderNumber}' milik '{order.CustomerName}'.",
            IpAddress: currentUserService.IpAddress,
            SourceService: "Order.Api"), cancellationToken);

        return Result.Success("Data pesanan berhasil dihapus.");
    }

    public async Task<Result<OrderStatsDto>> GetOrderStatsAsync(CancellationToken cancellationToken = default)
    {
        var stats = await cacheService.GetOrCreateAsync(
            CacheKeys.OrderStats(),
            async ct =>
            {
                var orders = await unitOfWork.Orders.GetListAsync(cancellationToken: ct);
                return new OrderStatsDto(
                    TotalOrders: orders.Count,
                    TotalRevenue: orders.Where(o => o.Status != OrderStatus.Cancelled).Sum(o => o.TotalAmount),
                    PendingOrders: orders.Count(o => o.Status == OrderStatus.Pending || o.Status == OrderStatus.Processing),
                    CompletedOrders: orders.Count(o => o.Status == OrderStatus.Completed));
            },
            TimeSpan.FromMinutes(10),
            cancellationToken);

        return Result<OrderStatsDto>.Success(stats);
    }

    private static OrderDto MapToDto(Domain.Entities.Order o) =>
        new(
            o.Id,
            o.OrderNumber,
            o.CustomerName,
            o.CustomerEmail,
            o.ProductSku,
            o.ProductName,
            o.Quantity,
            o.UnitPrice,
            o.TotalAmount,
            o.Status.ToString(),
            o.Notes,
            o.CreatedAt,
            o.CreatedBy);
}
