using System.Text.Json;
using BuildingBlocks.Core.Common;
using BuildingBlocks.Core.Constants;
using BuildingBlocks.Core.Contracts;
using BuildingBlocks.Core.Interfaces;
using MasterData.Api.Application.DTOs;
using MasterData.Api.Application.Interfaces;
using MasterData.Api.Domain.Entities;
using MasterData.Api.Domain.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace MasterData.Api.Application.Services;

public class LookupService(
    IMasterDataUnitOfWork unitOfWork,
    ICacheService cacheService,
    ICurrentUserService currentUser,
    IEventBus eventBus) : ILookupService
{
    private static readonly TimeSpan LookupCacheTtl = TimeSpan.FromMinutes(30);

    public async Task<Result<List<LookupGroupSummaryDto>>> GetGroupsAsync(CancellationToken cancellationToken = default)
    {
        var groups = await cacheService.GetOrCreateAsync(
            CacheKeys.LookupGroups(),
            async ct =>
            {
                var items = await unitOfWork.Lookups
                    .Query(asNoTracking: true)
                    .ToListAsync(ct);

                return items
                    .GroupBy(x => x.GroupCode, StringComparer.OrdinalIgnoreCase)
                    .OrderBy(g => g.Key, StringComparer.OrdinalIgnoreCase)
                    .Select(g => new LookupGroupSummaryDto(
                        g.Key,
                        g.Count(),
                        g.Count(x => x.IsActive),
                        g.Count(x => x.IsSystem)))
                    .ToList();
            },
            LookupCacheTtl,
            cancellationToken);

        return Result<List<LookupGroupSummaryDto>>.Success(groups);
    }

    public async Task<Result<List<LookupDto>>> GetLookupsAsync(
        string? groupCode = null,
        bool activeOnly = false,
        Guid? parentId = null,
        string? search = null,
        CancellationToken cancellationToken = default)
    {
        var normalizedGroup = string.IsNullOrWhiteSpace(groupCode) ? null : NormalizeCode(groupCode);
        var cacheKey = CacheKeys.LookupList(normalizedGroup, activeOnly, parentId, search);

        var items = await cacheService.GetOrCreateAsync(
            cacheKey,
            async ct =>
            {
                var query = unitOfWork.Lookups
                    .Query(asNoTracking: true)
                    .Include(x => x.Parent)
                    .AsQueryable();

                if (!string.IsNullOrWhiteSpace(normalizedGroup))
                {
                    query = query.Where(x => x.GroupCode == normalizedGroup);
                }

                if (activeOnly)
                {
                    query = query.Where(x => x.IsActive);
                }

                if (parentId.HasValue)
                {
                    query = query.Where(x => x.ParentId == parentId.Value);
                }

                if (!string.IsNullOrWhiteSpace(search))
                {
                    var term = search.Trim().ToLowerInvariant();
                    query = query.Where(x =>
                        x.GroupCode.ToLower().Contains(term) ||
                        x.Code.ToLower().Contains(term) ||
                        x.Name.ToLower().Contains(term) ||
                        (x.Description != null && x.Description.ToLower().Contains(term)));
                }

                var list = await query
                    .OrderBy(x => x.GroupCode)
                    .ThenBy(x => x.SortOrder)
                    .ThenBy(x => x.Name)
                    .ToListAsync(ct);

                return list.Select(MapToDto).ToList();
            },
            LookupCacheTtl,
            cancellationToken);

        return Result<List<LookupDto>>.Success(items);
    }

    public async Task<Result<Dictionary<string, List<LookupDto>>>> GetBatchLookupsAsync(
        IEnumerable<string> groupCodes,
        bool activeOnly = true,
        CancellationToken cancellationToken = default)
    {
        var normalizedGroups = groupCodes
            .Where(g => !string.IsNullOrWhiteSpace(g))
            .Select(NormalizeCode)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (normalizedGroups.Count == 0)
        {
            return Result<Dictionary<string, List<LookupDto>>>.Success(new Dictionary<string, List<LookupDto>>());
        }

        var cacheKey = CacheKeys.LookupBatch(normalizedGroups, activeOnly);

        var batch = await cacheService.GetOrCreateAsync(
            cacheKey,
            async ct =>
            {
                var query = unitOfWork.Lookups
                    .Query(asNoTracking: true)
                    .Include(x => x.Parent)
                    .Where(x => normalizedGroups.Contains(x.GroupCode));

                if (activeOnly)
                {
                    query = query.Where(x => x.IsActive);
                }

                var list = await query
                    .OrderBy(x => x.GroupCode)
                    .ThenBy(x => x.SortOrder)
                    .ThenBy(x => x.Name)
                    .ToListAsync(ct);

                var result = normalizedGroups.ToDictionary(g => g, _ => new List<LookupDto>(), StringComparer.OrdinalIgnoreCase);
                foreach (var item in list)
                {
                    if (result.TryGetValue(item.GroupCode, out var bucket))
                    {
                        bucket.Add(MapToDto(item));
                    }
                }

                return result;
            },
            LookupCacheTtl,
            cancellationToken);

        return Result<Dictionary<string, List<LookupDto>>>.Success(batch);
    }

    public async Task<Result<LookupDto>> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var dto = await cacheService.GetOrCreateAsync(
            CacheKeys.LookupById(id),
            async ct =>
            {
                var item = await unitOfWork.Lookups
                    .Query(asNoTracking: true)
                    .Include(x => x.Parent)
                    .FirstOrDefaultAsync(x => x.Id == id, ct);

                return item is null ? null : MapToDto(item);
            },
            LookupCacheTtl,
            cancellationToken);

        return dto is null
            ? Result<LookupDto>.Failure("Item Master Data tidak ditemukan.", 404)
            : Result<LookupDto>.Success(dto);
    }

    public async Task<Result<MasterDataStatsDto>> GetStatsAsync(CancellationToken cancellationToken = default)
    {
        var stats = await cacheService.GetOrCreateAsync(
            CacheKeys.LookupStats(),
            async ct =>
            {
                var all = await unitOfWork.Lookups.Query(asNoTracking: true).ToListAsync(ct);
                var groupCount = all.Select(x => x.GroupCode).Distinct(StringComparer.OrdinalIgnoreCase).Count();
                var activeCount = all.Count(x => x.IsActive);

                return new MasterDataStatsDto(
                    TotalGroups: groupCount,
                    TotalItems: all.Count,
                    ActiveItems: activeCount,
                    InactiveItems: all.Count - activeCount);
            },
            TimeSpan.FromMinutes(10),
            cancellationToken);

        return Result<MasterDataStatsDto>.Success(stats);
    }

    public async Task<Result<LookupDto>> CreateAsync(CreateOrUpdateLookupRequest request, CancellationToken cancellationToken = default)
    {
        var validationError = ValidateRequest(request);
        if (validationError is not null)
        {
            return Result<LookupDto>.Failure(validationError, 400);
        }

        var groupCode = NormalizeCode(request.GroupCode);
        var code = NormalizeCode(request.Code);

        var duplicateExists = await unitOfWork.Lookups.AnyAsync(
            x => x.GroupCode == groupCode && x.Code == code,
            cancellationToken);

        if (duplicateExists)
        {
            return Result<LookupDto>.Failure(
                $"Kode '{code}' sudah terdaftar di grup '{groupCode}'.",
                409);
        }

        string? parentName = null;
        if (request.ParentId.HasValue)
        {
            var parent = await unitOfWork.Lookups.GetByIdAsync(request.ParentId.Value, cancellationToken);
            if (parent is null)
            {
                return Result<LookupDto>.Failure("Parent lookup tidak ditemukan.", 400);
            }
            parentName = parent.Name;
        }

        var entity = new MasterLookup
        {
            GroupCode = groupCode,
            Code = code,
            Name = request.Name.Trim(),
            Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim(),
            ParentId = request.ParentId,
            SortOrder = request.SortOrder,
            IsActive = request.IsActive,
            IsSystem = false,
            MetadataJson = NormalizeMetadataJson(request.MetadataJson),
            CreatedBy = currentUser.Username ?? "system"
        };

        await unitOfWork.Lookups.AddAsync(entity, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        await cacheService.RemoveByPrefixAsync(CacheKeys.LookupsPrefix, cancellationToken);

        await eventBus.PublishAuditAsync(new AuditLogIntegrationEvent(
            UserId: currentUser.UserId,
            UserName: currentUser.Username ?? "system",
            Action: "CREATE_LOOKUP",
            Module: "MasterData",
            EntityId: entity.Id.ToString(),
            Details: $"Menambahkan lookup [{entity.GroupCode}] {entity.Code} — {entity.Name}",
            IpAddress: currentUser.IpAddress,
            SourceService: "MasterData.Api",
            Timestamp: DateTime.UtcNow), cancellationToken);

        var dto = MapToDto(entity) with { ParentName = parentName };
        return Result<LookupDto>.Success(dto, "Item Master Data berhasil ditambahkan.", 201);
    }

    public async Task<Result<LookupDto>> UpdateAsync(Guid id, CreateOrUpdateLookupRequest request, CancellationToken cancellationToken = default)
    {
        var validationError = ValidateRequest(request);
        if (validationError is not null)
        {
            return Result<LookupDto>.Failure(validationError, 400);
        }

        var entity = await unitOfWork.Lookups.GetByIdAsync(id, cancellationToken);
        if (entity is null)
        {
            return Result<LookupDto>.Failure("Item Master Data tidak ditemukan.", 404);
        }

        var groupCode = NormalizeCode(request.GroupCode);
        var code = NormalizeCode(request.Code);

        if (entity.IsSystem &&
            (!string.Equals(entity.GroupCode, groupCode, StringComparison.OrdinalIgnoreCase) ||
             !string.Equals(entity.Code, code, StringComparison.OrdinalIgnoreCase)))
        {
            return Result<LookupDto>.Failure(
                "GroupCode dan Code untuk item sistem bawaan tidak dapat diubah. Kamu tetap bisa mengubah Name, Description, SortOrder, Status, atau MetadataJson.",
                400);
        }

        if (request.ParentId.HasValue && request.ParentId.Value == id)
        {
            return Result<LookupDto>.Failure("Parent lookup tidak boleh menunjuk ke item dirinya sendiri.", 400);
        }

        string? parentName = null;
        if (request.ParentId.HasValue)
        {
            var parent = await unitOfWork.Lookups.GetByIdAsync(request.ParentId.Value, cancellationToken);
            if (parent is null)
            {
                return Result<LookupDto>.Failure("Parent lookup tidak ditemukan.", 400);
            }
            parentName = parent.Name;
        }

        var duplicateExists = await unitOfWork.Lookups.AnyAsync(
            x => x.Id != id && x.GroupCode == groupCode && x.Code == code,
            cancellationToken);

        if (duplicateExists)
        {
            return Result<LookupDto>.Failure(
                $"Kode '{code}' sudah digunakan oleh item lain di grup '{groupCode}'.",
                409);
        }

        entity.GroupCode = groupCode;
        entity.Code = code;
        entity.Name = request.Name.Trim();
        entity.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        entity.ParentId = request.ParentId;
        entity.SortOrder = request.SortOrder;
        entity.IsActive = request.IsActive;
        entity.MetadataJson = NormalizeMetadataJson(request.MetadataJson);
        entity.UpdatedAt = DateTime.UtcNow;
        entity.UpdatedBy = currentUser.Username ?? "system";

        unitOfWork.Lookups.Update(entity);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        await cacheService.RemoveByPrefixAsync(CacheKeys.LookupsPrefix, cancellationToken);

        await eventBus.PublishAuditAsync(new AuditLogIntegrationEvent(
            UserId: currentUser.UserId,
            UserName: currentUser.Username ?? "system",
            Action: "UPDATE_LOOKUP",
            Module: "MasterData",
            EntityId: entity.Id.ToString(),
            Details: $"Memperbarui lookup [{entity.GroupCode}] {entity.Code} — {entity.Name} (Active: {entity.IsActive})",
            IpAddress: currentUser.IpAddress,
            SourceService: "MasterData.Api",
            Timestamp: DateTime.UtcNow), cancellationToken);

        var dto = MapToDto(entity) with { ParentName = parentName };
        return Result<LookupDto>.Success(dto, "Item Master Data berhasil diperbarui.");
    }

    public async Task<Result<LookupDto>> ToggleStatusAsync(Guid id, bool isActive, CancellationToken cancellationToken = default)
    {
        var entity = await unitOfWork.Lookups
            .Query()
            .Include(x => x.Parent)
            .FirstOrDefaultAsync(x => x.Id == id, cancellationToken);

        if (entity is null)
        {
            return Result<LookupDto>.Failure("Item Master Data tidak ditemukan.", 404);
        }

        entity.IsActive = isActive;
        entity.UpdatedAt = DateTime.UtcNow;
        entity.UpdatedBy = currentUser.Username ?? "system";

        unitOfWork.Lookups.Update(entity);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        await cacheService.RemoveByPrefixAsync(CacheKeys.LookupsPrefix, cancellationToken);

        await eventBus.PublishAuditAsync(new AuditLogIntegrationEvent(
            UserId: currentUser.UserId,
            UserName: currentUser.Username ?? "system",
            Action: "TOGGLE_LOOKUP_STATUS",
            Module: "MasterData",
            EntityId: entity.Id.ToString(),
            Details: $"Mengubah status lookup [{entity.GroupCode}] {entity.Code} menjadi {(isActive ? "Aktif" : "Nonaktif")}",
            IpAddress: currentUser.IpAddress,
            SourceService: "MasterData.Api",
            Timestamp: DateTime.UtcNow), cancellationToken);

        return Result<LookupDto>.Success(
            MapToDto(entity),
            isActive ? "Item Master Data diaktifkan." : "Item Master Data dinonaktifkan.");
    }

    public async Task<Result> DeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var entity = await unitOfWork.Lookups.GetByIdAsync(id, cancellationToken);
        if (entity is null)
        {
            return Result.Failure("Item Master Data tidak ditemukan.", 404);
        }

        if (entity.IsSystem)
        {
            return Result.Failure(
                "Item sistem bawaan tidak boleh dihapus. Nonaktifkan statusnya jika tidak ingin ditampilkan di dropdown.",
                400);
        }

        var hasChildren = await unitOfWork.Lookups.AnyAsync(x => x.ParentId == id, cancellationToken);
        if (hasChildren)
        {
            return Result.Failure(
                "Item ini masih digunakan sebagai Parent oleh sub-lookup lain. Hapus atau pindahkan anaknya terlebih dahulu.",
                400);
        }

        entity.UpdatedBy = currentUser.Username ?? "system";
        unitOfWork.Lookups.Remove(entity);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        await cacheService.RemoveByPrefixAsync(CacheKeys.LookupsPrefix, cancellationToken);

        await eventBus.PublishAuditAsync(new AuditLogIntegrationEvent(
            UserId: currentUser.UserId,
            UserName: currentUser.Username ?? "system",
            Action: "DELETE_LOOKUP",
            Module: "MasterData",
            EntityId: entity.Id.ToString(),
            Details: $"Menghapus (soft-delete) lookup [{entity.GroupCode}] {entity.Code} — {entity.Name}",
            IpAddress: currentUser.IpAddress,
            SourceService: "MasterData.Api",
            Timestamp: DateTime.UtcNow), cancellationToken);

        return Result.Success("Item Master Data berhasil dihapus.");
    }

    private static string? ValidateRequest(CreateOrUpdateLookupRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.GroupCode))
        {
            return "GroupCode wajib diisi (contoh: PRODUCT_CATEGORY).";
        }

        if (string.IsNullOrWhiteSpace(request.Code))
        {
            return "Code wajib diisi (contoh: CLOUD_INFRA).";
        }

        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return "Name / label tampilan wajib diisi.";
        }

        if (request.GroupCode.Trim().Length > 64 || request.Code.Trim().Length > 64)
        {
            return "Panjang GroupCode dan Code maksimal 64 karakter.";
        }

        if (request.Name.Trim().Length > 150)
        {
            return "Panjang Name maksimal 150 karakter.";
        }

        if (!string.IsNullOrWhiteSpace(request.MetadataJson))
        {
            try
            {
                using var doc = JsonDocument.Parse(request.MetadataJson);
                if (doc.RootElement.ValueKind != JsonValueKind.Object)
                {
                    return "MetadataJson harus berupa objek JSON yang valid (contoh: {\"color\":\"teal\"}).";
                }
            }
            catch (JsonException)
            {
                return "Format MetadataJson tidak valid. Pastikan menggunakan sintaks JSON yang benar.";
            }
        }

        return null;
    }

    private static string NormalizeCode(string raw) =>
        string.Join("_", raw.Trim().ToUpperInvariant().Split(' ', StringSplitOptions.RemoveEmptyEntries));

    private static string? NormalizeMetadataJson(string? raw) =>
        string.IsNullOrWhiteSpace(raw) ? null : raw.Trim();

    private static LookupDto MapToDto(MasterLookup x) => new(
        x.Id,
        x.GroupCode,
        x.Code,
        x.Name,
        x.Description,
        x.ParentId,
        x.Parent?.Name,
        x.SortOrder,
        x.IsActive,
        x.IsSystem,
        x.MetadataJson,
        x.CreatedAt,
        x.CreatedBy);
}
