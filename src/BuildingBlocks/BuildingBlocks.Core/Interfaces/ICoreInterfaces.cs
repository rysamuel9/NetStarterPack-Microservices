using System.Linq.Expressions;
using BuildingBlocks.Core.Common;
using BuildingBlocks.Core.Contracts;

namespace BuildingBlocks.Core.Interfaces;

/// <summary>
/// Kontrak Repository generik untuk semua microservice yang menganut Onion Architecture.
/// </summary>
public interface IRepository<T> where T : BaseEntity
{
    IQueryable<T> Query(bool asNoTracking = false);
    Task<T?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<T?> FirstOrDefaultAsync(Expression<Func<T, bool>> predicate, CancellationToken cancellationToken = default);
    Task<List<T>> GetListAsync(Expression<Func<T, bool>>? predicate = null, CancellationToken cancellationToken = default);
    Task<bool> AnyAsync(Expression<Func<T, bool>> predicate, CancellationToken cancellationToken = default);
    Task<int> CountAsync(Expression<Func<T, bool>>? predicate = null, CancellationToken cancellationToken = default);
    Task AddAsync(T entity, CancellationToken cancellationToken = default);
    Task AddRangeAsync(IEnumerable<T> entities, CancellationToken cancellationToken = default);
    void Update(T entity);
    void Remove(T entity);
    void HardRemove(T entity);
    void RemoveRange(IEnumerable<T> entities);
}

/// <summary>
/// Abstraksi caching (L1 Memory + L2 Distributed Redis) yang dipakai di semua microservice.
/// </summary>
public interface ICacheService
{
    Task<T?> GetAsync<T>(string key, CancellationToken cancellationToken = default);
    Task SetAsync<T>(string key, T value, TimeSpan? expiration = null, CancellationToken cancellationToken = default);
    Task<T> GetOrCreateAsync<T>(string key, Func<CancellationToken, Task<T>> factory, TimeSpan? expiration = null, CancellationToken cancellationToken = default);
    Task RemoveAsync(string key, CancellationToken cancellationToken = default);
    Task RemoveByPrefixAsync(string prefixKey, CancellationToken cancellationToken = default);
}

/// <summary>
/// Menyediakan informasi user yang sedang login dari klaim JWT Access Token di microservice mana pun.
/// </summary>
public interface ICurrentUserService
{
    Guid? UserId { get; }
    string? Username { get; }
    IReadOnlyList<string> Roles { get; }
    IReadOnlyList<string> Permissions { get; }
    string? IpAddress { get; }
    string CorrelationId { get; }
}

/// <summary>
/// Abstraksi komunikasi event antar-microservice (Resilient HTTP / Message Broker).
/// </summary>
public interface IEventBus
{
    Task PublishAuditAsync(AuditLogIntegrationEvent auditEvent, CancellationToken cancellationToken = default);
}
