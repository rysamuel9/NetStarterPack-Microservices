using Microsoft.EntityFrameworkCore;
using NetStarterPack.Microservices.UnitTests.Common.Factories;
using NetStarterPack.Microservices.UnitTests.Common.TestDoubles;
using Order.Api.Application.DTOs;
using Order.Api.Application.Services;

namespace NetStarterPack.Microservices.UnitTests.Services.Order;

public class OrderServiceTests
{
    [Fact]
    public async Task CreateAndDeleteOrder_ShouldCalculateTotalInvalidateCacheSoftDelete_AndPublishAuditEvent()
    {
        using var ctx = await TestDbFactory.CreateOrderAsync();
        var currentUser = new FakeCurrentUserService { Username = "manager" };
        var cache = TestCacheFactory.CreateInMemory();
        var eventBus = new InMemoryEventBus();

        var orderService = new OrderService(ctx.Uow, currentUser, cache, eventBus);

        var initialList = await orderService.GetAllOrdersAsync();
        Assert.Equal(4, initialList.Data!.Count);

        var createResult = await orderService.CreateOrderAsync(new CreateOrUpdateOrderRequest(
            OrderNumber: "ord-2026-999",
            CustomerName: "PT Garuda Digital Nusantara",
            CustomerEmail: "finance@garudadigital.id",
            ProductSku: "PRD-CLOUD-001",
            ProductName: "Enterprise Cloud Server Instance",
            Quantity: 3,
            UnitPrice: 2000000m,
            Status: "Completed",
            Notes: "Unit test Order Microservice Example 2"));

        Assert.True(createResult.Succeeded);
        Assert.Equal(201, createResult.StatusCode);
        Assert.Equal("ORD-2026-999", createResult.Data!.OrderNumber);
        Assert.Equal(6000000m, createResult.Data.TotalAmount);

        var afterCreateList = await orderService.GetAllOrdersAsync();
        Assert.Equal(5, afterCreateList.Data!.Count);

        Assert.Single(eventBus.PublishedEvents);
        Assert.Equal("CREATE_ORDER", eventBus.PublishedEvents[0].Action);
        Assert.Equal("Order.Api", eventBus.PublishedEvents[0].SourceService);

        await orderService.DeleteOrderAsync(createResult.Data.Id);
        var deletedEntity = await ctx.Db.Orders.IgnoreQueryFilters().FirstOrDefaultAsync(o => o.Id == createResult.Data.Id);
        Assert.NotNull(deletedEntity);
        Assert.True(deletedEntity!.IsDeleted);
    }

    [Fact]
    public async Task CreateOrder_WithInvalidQuantityOrDuplicateOrderNumber_ShouldReturnError()
    {
        using var ctx = await TestDbFactory.CreateOrderAsync();
        var orderService = new OrderService(ctx.Uow, new FakeCurrentUserService(), TestCacheFactory.CreateInMemory(), new InMemoryEventBus());

        var invalidQty = await orderService.CreateOrderAsync(new CreateOrUpdateOrderRequest(
            OrderNumber: "ORD-INVALID-QTY",
            CustomerName: "PT Tes",
            CustomerEmail: "tes@company.id",
            ProductSku: "SKU-1",
            ProductName: "Item Tes",
            Quantity: 0,
            UnitPrice: 100000m,
            Status: "Pending",
            Notes: ""));

        Assert.False(invalidQty.Succeeded);
        Assert.Equal(400, invalidQty.StatusCode);

        var existingOrder = (await orderService.GetAllOrdersAsync()).Data!.First();
        var duplicate = await orderService.CreateOrderAsync(new CreateOrUpdateOrderRequest(
            OrderNumber: existingOrder.OrderNumber.ToLowerInvariant(),
            CustomerName: "PT Duplikat",
            CustomerEmail: "dup@company.id",
            ProductSku: "SKU-1",
            ProductName: "Item Duplikat",
            Quantity: 1,
            UnitPrice: 100000m,
            Status: "Pending",
            Notes: ""));

        Assert.False(duplicate.Succeeded);
        Assert.Equal(409, duplicate.StatusCode);
    }
}
