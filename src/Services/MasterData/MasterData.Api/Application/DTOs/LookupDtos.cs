namespace MasterData.Api.Application.DTOs;

public record LookupDto(
    Guid Id,
    string GroupCode,
    string Code,
    string Name,
    string? Description,
    Guid? ParentId,
    string? ParentName,
    int SortOrder,
    bool IsActive,
    bool IsSystem,
    string? MetadataJson,
    DateTime CreatedAt,
    string? CreatedBy);

public record LookupGroupSummaryDto(
    string GroupCode,
    int TotalCount,
    int ActiveCount,
    int SystemCount);

public record MasterDataStatsDto(
    int TotalGroups,
    int TotalItems,
    int ActiveItems,
    int InactiveItems);

public record CreateOrUpdateLookupRequest(
    string GroupCode,
    string Code,
    string Name,
    string? Description = null,
    Guid? ParentId = null,
    int SortOrder = 0,
    bool IsActive = true,
    string? MetadataJson = null);

public record ToggleLookupStatusRequest(bool IsActive);
