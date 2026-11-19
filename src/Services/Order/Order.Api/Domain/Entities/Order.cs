using BuildingBlocks.Core.Common;

namespace Order.Api.Domain.Entities;

public enum OrderStatus
{
    Pending = 0,
    Processing = 1,
    Completed = 2,
    Cancelled = 3
}

/// <summary>
/// Entitas domain utama di Order Microservice (Database terpisah: NetStarterPack_OrderDb).
/// Merupakan Contoh Referensi ke-2 (Example 2) pada docs/CUSTOMIZATION_GUIDE.md.
/// </summary>
public class Order : BaseEntity
{
    public string OrderNumber { get; set; } = string.Empty;
    public string CustomerName { get; set; } = string.Empty;
    public string CustomerEmail { get; set; } = string.Empty;
    public string ProductSku { get; set; } = string.Empty;
    public string ProductName { get; set; } = string.Empty;
    public int Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal TotalAmount { get; set; }
    public OrderStatus Status { get; set; } = OrderStatus.Pending;
    public string Notes { get; set; } = string.Empty;
}
