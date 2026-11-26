using System.Collections.Concurrent;
using System.Text.Json;
using BuildingBlocks.Core.Interfaces;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace BuildingBlocks.Infrastructure.Caching;

public class CacheSettings
{
    public const string SectionName = "CacheSettings";

    public string Provider { get; set; } = "InMemory";
    public string RedisConnectionString { get; set; } = "localhost:6379,abortConnect=false,connectTimeout=2000";
    public string InstanceName { get; set; } = "NetStarterPackMicro_";
    public int DefaultExpirationMinutes { get; set; } = 15;
}

/// <summary>
/// Implementasi ICacheService berbasis Hybrid L1 (IMemoryCache) + L2 (IDistributedCache / Redis)
/// yang dipakai bersama oleh seluruh microservice.
/// </summary>
public class DistributedCacheService(
    IDistributedCache distributedCache,
    IOptions<CacheSettings> cacheOptions,
    ILogger<DistributedCacheService> logger,
    IMemoryCache? memoryCache = null) : ICacheService
{
    private readonly CacheSettings _settings = cacheOptions.Value;
    private readonly IMemoryCache _l1Cache = memoryCache ?? new MemoryCache(new MemoryCacheOptions());
    private readonly bool _isRedis = cacheOptions.Value.Provider.Equals("Redis", StringComparison.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, byte> _trackedKeys = new();

    public async Task<T?> GetAsync<T>(string key, CancellationToken cancellationToken = default)
    {
        var (found, value) = await TryGetAsync<T>(key, cancellationToken);
        return found ? value : default;
    }

    private async Task<(bool Found, T? Value)> TryGetAsync<T>(string key, CancellationToken cancellationToken = default)
    {
        try
        {
            if (_l1Cache.TryGetValue(key, out T? l1Value))
            {
                return (true, l1Value);
            }

            if (!_isRedis)
            {
                return (false, default);
            }

            var json = await distributedCache.GetStringAsync(key, cancellationToken);
            if (string.IsNullOrWhiteSpace(json))
            {
                return (false, default);
            }

            var deserialized = JsonSerializer.Deserialize<T>(json);
            if (deserialized is not null)
            {
                _l1Cache.Set(key, deserialized, TimeSpan.FromMinutes(2));
                return (true, deserialized);
            }
            return (false, default);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "[CACHE WARNING] Gagal membaca cache key '{CacheKey}'. Fallback ke Database.", key);
            return (false, default);
        }
    }

    public async Task SetAsync<T>(
        string key,
        T value,
        TimeSpan? expiration = null,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var ttl = expiration ?? TimeSpan.FromMinutes(_settings.DefaultExpirationMinutes);
            _l1Cache.Set(key, value, ttl);
            _trackedKeys.TryAdd(key, 0);

            if (_isRedis)
            {
                var options = new DistributedCacheEntryOptions
                {
                    AbsoluteExpirationRelativeToNow = ttl
                };

                var json = JsonSerializer.Serialize(value);
                await distributedCache.SetStringAsync(key, json, options, cancellationToken);
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "[CACHE WARNING] Gagal menyimpan cache key '{CacheKey}'.", key);
        }
    }

    public async Task<T> GetOrCreateAsync<T>(
        string key,
        Func<CancellationToken, Task<T>> factory,
        TimeSpan? expiration = null,
        CancellationToken cancellationToken = default)
    {
        var (found, cached) = await TryGetAsync<T>(key, cancellationToken);
        if (found && cached is not null)
        {
            return cached;
        }

        var fresh = await factory(cancellationToken);
        if (fresh is not null)
        {
            await SetAsync(key, fresh, expiration, cancellationToken);
        }

        return fresh;
    }

    public async Task RemoveAsync(string key, CancellationToken cancellationToken = default)
    {
        try
        {
            _l1Cache.Remove(key);
            _trackedKeys.TryRemove(key, out _);

            if (_isRedis)
            {
                await distributedCache.RemoveAsync(key, cancellationToken);
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "[CACHE WARNING] Gagal menghapus cache key '{CacheKey}'.", key);
        }
    }

    public async Task RemoveByPrefixAsync(string prefixKey, CancellationToken cancellationToken = default)
    {
        var matchingKeys = _trackedKeys.Keys
            .Where(k => k.StartsWith(prefixKey, StringComparison.OrdinalIgnoreCase))
            .ToList();

        foreach (var key in matchingKeys)
        {
            await RemoveAsync(key, cancellationToken);
        }
    }
}
