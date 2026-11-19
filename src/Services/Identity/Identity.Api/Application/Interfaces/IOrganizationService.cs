using BuildingBlocks.Core.Common;
using Identity.Api.Application.DTOs;

namespace Identity.Api.Application.Interfaces;

public interface IOrganizationService
{
    Task<Result<IReadOnlyList<DirectorateTreeNodeDto>>> GetOrganizationTreeAsync(CancellationToken cancellationToken = default);

    // Master Direktorat
    Task<Result<IReadOnlyList<DirectorateDto>>> GetDirectoratesAsync(CancellationToken cancellationToken = default);
    Task<Result<DirectorateDto>> CreateDirectorateAsync(CreateOrUpdateDirectorateRequest request, CancellationToken cancellationToken = default);
    Task<Result<DirectorateDto>> UpdateDirectorateAsync(Guid id, CreateOrUpdateDirectorateRequest request, CancellationToken cancellationToken = default);
    Task<Result> DeleteDirectorateAsync(Guid id, CancellationToken cancellationToken = default);

    // Master Divisi (turunan Direktorat)
    Task<Result<IReadOnlyList<DivisionDto>>> GetDivisionsAsync(Guid? directorateId = null, CancellationToken cancellationToken = default);
    Task<Result<DivisionDto>> CreateDivisionAsync(CreateOrUpdateDivisionRequest request, CancellationToken cancellationToken = default);
    Task<Result<DivisionDto>> UpdateDivisionAsync(Guid id, CreateOrUpdateDivisionRequest request, CancellationToken cancellationToken = default);
    Task<Result> DeleteDivisionAsync(Guid id, CancellationToken cancellationToken = default);

    // Master Departemen (turunan Divisi)
    Task<Result<IReadOnlyList<DepartmentDto>>> GetDepartmentsAsync(Guid? divisionId = null, CancellationToken cancellationToken = default);
    Task<Result<DepartmentDto>> CreateDepartmentAsync(CreateOrUpdateDepartmentRequest request, CancellationToken cancellationToken = default);
    Task<Result<DepartmentDto>> UpdateDepartmentAsync(Guid id, CreateOrUpdateDepartmentRequest request, CancellationToken cancellationToken = default);
    Task<Result> DeleteDepartmentAsync(Guid id, CancellationToken cancellationToken = default);

    // Master Posisi / Jabatan
    Task<Result<IReadOnlyList<PositionDto>>> GetPositionsAsync(CancellationToken cancellationToken = default);
    Task<Result<PositionDto>> CreatePositionAsync(CreateOrUpdatePositionRequest request, CancellationToken cancellationToken = default);
    Task<Result<PositionDto>> UpdatePositionAsync(Guid id, CreateOrUpdatePositionRequest request, CancellationToken cancellationToken = default);
    Task<Result> DeletePositionAsync(Guid id, CancellationToken cancellationToken = default);
}
