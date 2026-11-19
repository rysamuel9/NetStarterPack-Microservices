using BuildingBlocks.Core.Interfaces;
using BuildingBlocks.Infrastructure.Caching;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace NetStarterPack.Microservices.UnitTests.Common.Factories;

/// <summary>
/// Factory untuk membuat instance DistributedCacheService berbasis memori RAM (tanpa Redis) di unit test.
/// </summary>
public static class TestCacheFactory
{
    public static ICacheService CreateInMemory(int defaultExpirationMinutes = 10)
    {
        var memoryDistributed = new MemoryDistributedCache(Options.Create(new MemoryDistributedCacheOptions()));
        var settings = Options.Create(new CacheSettings
        {
            Provider = "InMemory",
            DefaultExpirationMinutes = defaultExpirationMinutes
        });

        return new DistributedCacheService(
            memoryDistributed,
            settings,
            NullLogger<DistributedCacheService>.Instance);
    }
}
