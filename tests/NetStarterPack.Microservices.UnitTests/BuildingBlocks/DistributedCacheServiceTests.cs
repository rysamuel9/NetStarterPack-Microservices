using NetStarterPack.Microservices.UnitTests.Common.Factories;

namespace NetStarterPack.Microservices.UnitTests.BuildingBlocks;

public class DistributedCacheServiceTests
{
    [Fact]
    public async Task GetOrCreateAsync_ShouldInvokeFactoryOnce_AndReturnCachedValueOnSubsequentCalls()
    {
        var cache = TestCacheFactory.CreateInMemory();
        var callCount = 0;

        var first = await cache.GetOrCreateAsync("products:list:all", _ =>
        {
            callCount++;
            return Task.FromResult("cached-payload");
        });

        var second = await cache.GetOrCreateAsync("products:list:all", _ =>
        {
            callCount++;
            return Task.FromResult("fresh-payload");
        });

        Assert.Equal("cached-payload", first);
        Assert.Equal("cached-payload", second);
        Assert.Equal(1, callCount);
    }

    [Fact]
    public async Task RemoveByPrefixAsync_ShouldOnlyInvalidateKeysMatchingPrefix()
    {
        var cache = TestCacheFactory.CreateInMemory();
        await cache.SetAsync("products:list:all", "list-value");
        await cache.SetAsync("products:detail:1", "detail-value");
        await cache.SetAsync("orders:list:all", "order-value");

        await cache.RemoveByPrefixAsync("products:");

        Assert.Null(await cache.GetAsync<string>("products:list:all"));
        Assert.Null(await cache.GetAsync<string>("products:detail:1"));
        Assert.Equal("order-value", await cache.GetAsync<string>("orders:list:all"));
    }
}
