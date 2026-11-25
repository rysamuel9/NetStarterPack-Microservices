using BuildingBlocks.Core.Common;
using MasterData.Api.Application.DTOs;

namespace MasterData.Api.Application.Interfaces;

public interface ILookupService
{
    Task<Result<List<LookupGroupSummaryDto>>> GetGroupsAsync(CancellationToken cancellationToken = default);
    Task<Result<List<LookupDto>>> GetLookupsAsync(
        string? groupCode = null,
        bool activeOnly = false,
        Guid? parentId = null,
        string? search = null,
        CancellationToken cancellationToken = default);
    Task<Result<Dictionary<string, List<LookupDto>>>> GetBatchLookupsAsync(
        IEnumerable<string> groupCodes,
        bool activeOnly = true,
        CancellationToken cancellationToken = default);
    Task<Result<LookupDto>> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<Result<MasterDataStatsDto>> GetStatsAsync(CancellationToken cancellationToken = default);
    Task<Result<LookupDto>> CreateAsync(CreateOrUpdateLookupRequest request, CancellationToken cancellationToken = default);
    Task<Result<LookupDto>> UpdateAsync(Guid id, CreateOrUpdateLookupRequest request, CancellationToken cancellationToken = default);
    Task<Result<LookupDto>> ToggleStatusAsync(Guid id, bool isActive, CancellationToken cancellationToken = default);
    Task<Result> DeleteAsync(Guid id, CancellationToken cancellationToken = default);
}
