using BuildingBlocks.Core.Attributes;
using BuildingBlocks.Core.Constants;
using BuildingBlocks.Infrastructure.Controllers;
using BuildingBlocks.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Order.Api.Application.DTOs;
using Order.Api.Application.Interfaces;

namespace Order.Api.Controllers;

[Authorize]
public class OrdersController(IOrderService orderService) : BaseApiController
{
    /// <summary>
    /// Mengambil daftar transaksi pesanan dari Order Microservice (NetStarterPack_OrderDb).
    /// </summary>
    [HasPermission(Permissions.Orders.View)]
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? search,
        [FromQuery] string? status,
        CancellationToken cancellationToken) =>
        ToActionResult(await orderService.GetAllOrdersAsync(search, status, cancellationToken));

    /// <summary>
    /// Mengambil ringkasan statistik pesanan (TotalOrders, TotalRevenue, Pending, Completed).
    /// Membutuhkan JWT login atau header X-Internal-Api-Key yang valid.
    /// </summary>
    [AllowAnonymous]
    [RequireAuthenticatedOrInternalApiKey]
    [HttpGet("stats")]
    public async Task<IActionResult> GetStats(CancellationToken cancellationToken) =>
        ToActionResult(await orderService.GetOrderStatsAsync(cancellationToken));

    /// <summary>
    /// Mengambil detail pesanan berdasarkan ID.
    /// </summary>
    [HasPermission(Permissions.Orders.View)]
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken cancellationToken) =>
        ToActionResult(await orderService.GetOrderByIdAsync(id, cancellationToken));

    /// <summary>
    /// Membuat pesanan baru di Order Microservice dan mengirim AuditLogIntegrationEvent ke Identity.Api.
    /// </summary>
    [HasPermission(Permissions.Orders.Create)]
    [HttpPost]
    [Idempotent]
    public async Task<IActionResult> Create([FromBody] CreateOrUpdateOrderRequest request, CancellationToken cancellationToken) =>
        ToActionResult(await orderService.CreateOrderAsync(request, cancellationToken));

    /// <summary>
    /// Memperbarui data/status pesanan di Order Microservice dan mengirim AuditLogIntegrationEvent.
    /// </summary>
    [HasPermission(Permissions.Orders.Edit)]
    [HttpPut("{id:guid}")]
    [Idempotent]
    public async Task<IActionResult> Update(Guid id, [FromBody] CreateOrUpdateOrderRequest request, CancellationToken cancellationToken) =>
        ToActionResult(await orderService.UpdateOrderAsync(id, request, cancellationToken));

    /// <summary>
    /// Menghapus pesanan (soft-delete) di Order Microservice dan mengirim AuditLogIntegrationEvent.
    /// </summary>
    [HasPermission(Permissions.Orders.Delete)]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken) =>
        ToActionResult(await orderService.DeleteOrderAsync(id, cancellationToken));
}
