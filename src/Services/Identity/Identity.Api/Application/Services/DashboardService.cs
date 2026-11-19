using BuildingBlocks.Core.Common;
using BuildingBlocks.Core.Constants;
using BuildingBlocks.Core.Contracts;
using BuildingBlocks.Core.Interfaces;
using Identity.Api.Application.DTOs;
using Identity.Api.Application.Interfaces;
using Identity.Api.Domain.Entities;
using Identity.Api.Domain.Interfaces;

namespace Identity.Api.Application.Services;

public class DashboardService(
    IIdentityUnitOfWork unitOfWork,
    ICatalogStatsClient catalogStatsClient,
    ICacheService? cacheService = null) : IDashboardService
{
    public async Task<Result<DashboardSummaryDto>> GetSummaryAsync(CancellationToken cancellationToken = default)
    {
        if (cacheService is not null)
        {
            var cachedSummary = await cacheService.GetOrCreateAsync(
                CacheKeys.DashboardSummary(),
                BuildSummaryAsync,
                TimeSpan.FromMinutes(2),
                cancellationToken);
            return Result<DashboardSummaryDto>.Success(cachedSummary);
        }

        var summary = await BuildSummaryAsync(cancellationToken);
        return Result<DashboardSummaryDto>.Success(summary);
    }

    private async Task<DashboardSummaryDto> BuildSummaryAsync(CancellationToken cancellationToken)
    {
        var totalUsers = await unitOfWork.Users.CountAsync(cancellationToken: cancellationToken);
        var activeUsers = await unitOfWork.Users.CountAsync(u => u.Status == UserStatus.Active, cancellationToken);
        var visibleMenus = await unitOfWork.Menus.CountAsync(m => m.IsVisible, cancellationToken);
        var roles = await unitOfWork.Roles.GetAllWithDetailsAsync(cancellationToken);
        var catalogStats = await catalogStatsClient.GetCatalogStatsAsync(cancellationToken);

        var recentLogs = unitOfWork.Repository<AuditLog>()
            .Query(asNoTracking: true)
            .OrderByDescending(l => l.Timestamp)
            .Take(10)
            .ToList()
            .Select(MapAuditLog)
            .ToList();

        var roleDistribution = roles
            .Select(r => new RoleDistributionDto(
                r.Name,
                r.DisplayName,
                r.BadgeColor,
                r.UserRoles.Count(ur => ur.User is not null && !ur.User.IsDeleted)))
            .ToList();

        return new DashboardSummaryDto(
            TotalUsers: totalUsers,
            ActiveUsers: activeUsers,
            TotalRoles: roles.Count,
            TotalMenus: visibleMenus,
            TotalProducts: catalogStats.TotalProducts,
            TotalInventoryValue: catalogStats.TotalInventoryValue,
            RoleDistribution: roleDistribution,
            RecentActivities: recentLogs);
    }

    public Task<Result<IReadOnlyList<AuditLogDto>>> GetAuditLogsAsync(int limit = 100, CancellationToken cancellationToken = default)
    {
        var clampedLimit = Math.Clamp(limit, 1, 500);
        var result = unitOfWork.Repository<AuditLog>()
            .Query(asNoTracking: true)
            .OrderByDescending(l => l.Timestamp)
            .Take(clampedLimit)
            .ToList()
            .Select(MapAuditLog)
            .ToList();

        return Task.FromResult(Result<IReadOnlyList<AuditLogDto>>.Success(result));
    }

    public async Task<Result> RecordIntegrationAuditLogAsync(
        AuditLogIntegrationEvent integrationEvent,
        CancellationToken cancellationToken = default)
    {
        await unitOfWork.Repository<AuditLog>().AddAsync(new AuditLog
        {
            UserId = integrationEvent.UserId,
            UserName = string.IsNullOrWhiteSpace(integrationEvent.UserName) ? "System" : integrationEvent.UserName,
            Action = integrationEvent.Action,
            Module = integrationEvent.Module,
            EntityId = integrationEvent.EntityId,
            Details = integrationEvent.Details,
            IpAddress = integrationEvent.IpAddress,
            Timestamp = integrationEvent.Timestamp ?? DateTime.UtcNow,
            CreatedBy = integrationEvent.SourceService
        }, cancellationToken);

        await unitOfWork.SaveChangesAsync(cancellationToken);
        if (cacheService is not null)
        {
            await cacheService.RemoveByPrefixAsync(CacheKeys.DashboardPrefix, cancellationToken);
        }

        return Result.Success("Integration audit log recorded.");
    }

    private static AuditLogDto MapAuditLog(AuditLog log) =>
        new(
            log.Id,
            log.UserName,
            log.Action,
            log.Module,
            log.EntityId,
            log.Details,
            log.IpAddress,
            log.Timestamp);
}
