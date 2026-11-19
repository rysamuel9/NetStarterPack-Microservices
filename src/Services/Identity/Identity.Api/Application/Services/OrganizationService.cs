using BuildingBlocks.Core.Common;
using BuildingBlocks.Core.Constants;
using BuildingBlocks.Core.Interfaces;
using Identity.Api.Application.DTOs;
using Identity.Api.Application.Interfaces;
using Identity.Api.Domain.Entities;
using Identity.Api.Domain.Interfaces;

namespace Identity.Api.Application.Services;

public class OrganizationService(
    IIdentityUnitOfWork unitOfWork,
    ICurrentUserService currentUserService,
    ICacheService? cacheService = null) : IOrganizationService
{
    public async Task<Result<IReadOnlyList<DirectorateTreeNodeDto>>> GetOrganizationTreeAsync(CancellationToken cancellationToken = default)
    {
        if (cacheService is not null)
        {
            var cached = await cacheService.GetOrCreateAsync(
                CacheKeys.OrganizationTree(),
                BuildOrganizationTreeAsync,
                TimeSpan.FromMinutes(10),
                cancellationToken);
            return Result<IReadOnlyList<DirectorateTreeNodeDto>>.Success(cached);
        }

        return Result<IReadOnlyList<DirectorateTreeNodeDto>>.Success(await BuildOrganizationTreeAsync(cancellationToken));
    }

    private async Task<List<DirectorateTreeNodeDto>> BuildOrganizationTreeAsync(CancellationToken cancellationToken)
    {
        var directorates = await unitOfWork.Repository<Directorate>().GetListAsync(cancellationToken: cancellationToken);
        var divisions = await unitOfWork.Repository<Division>().GetListAsync(cancellationToken: cancellationToken);
        var departments = await unitOfWork.Repository<Department>().GetListAsync(cancellationToken: cancellationToken);
        var users = await unitOfWork.Users.GetAllWithRolesAsync(cancellationToken);

        var userById = users.ToDictionary(u => u.Id);

        var tree = directorates
            .OrderBy(d => d.Code)
            .Select(dir =>
            {
                userById.TryGetValue(dir.HeadUserId ?? Guid.Empty, out var dirHead);
                var dirDivisions = divisions
                    .Where(dv => dv.DirectorateId == dir.Id)
                    .OrderBy(dv => dv.Code)
                    .Select(dv =>
                    {
                        userById.TryGetValue(dv.HeadUserId ?? Guid.Empty, out var divHead);
                        var divDepartments = departments
                            .Where(dp => dp.DivisionId == dv.Id)
                            .OrderBy(dp => dp.Code)
                            .Select(dp =>
                            {
                                userById.TryGetValue(dp.HeadUserId ?? Guid.Empty, out var deptHead);
                                var deptMembers = users
                                    .Where(u => u.DepartmentId == dp.Id)
                                    .OrderBy(u => u.Position?.Level ?? 99)
                                    .ThenBy(u => u.FullName)
                                    .Select(MapMemberSummary)
                                    .ToList();

                                return new DepartmentTreeNodeDto(
                                    dp.Id,
                                    dp.Code,
                                    dp.Name,
                                    dp.Description,
                                    dp.HeadUserId,
                                    deptHead?.FullName,
                                    deptMembers.Count,
                                    deptMembers);
                            })
                            .ToList();

                        var divUserCount = users.Count(u => u.DivisionId == dv.Id);
                        return new DivisionTreeNodeDto(
                            dv.Id,
                            dv.Code,
                            dv.Name,
                            dv.Description,
                            dv.HeadUserId,
                            divHead?.FullName,
                            divUserCount,
                            divDepartments);
                    })
                    .ToList();

                var dirUserCount = users.Count(u => u.DirectorateId == dir.Id);
                return new DirectorateTreeNodeDto(
                    dir.Id,
                    dir.Code,
                    dir.Name,
                    dir.Description,
                    dir.HeadUserId,
                    dirHead?.Username,
                    dirHead?.FullName,
                    dirHead?.Position?.Name,
                    dirUserCount,
                    dirDivisions);
            })
            .ToList();

        return tree;
    }

    // ==================== DIRECTORATES ====================
    public async Task<Result<IReadOnlyList<DirectorateDto>>> GetDirectoratesAsync(CancellationToken cancellationToken = default)
    {
        var directorates = await unitOfWork.Repository<Directorate>().GetListAsync(cancellationToken: cancellationToken);
        var divisions = await unitOfWork.Repository<Division>().GetListAsync(cancellationToken: cancellationToken);
        var users = await unitOfWork.Users.GetAllWithRolesAsync(cancellationToken);
        var userById = users.ToDictionary(u => u.Id);

        var result = directorates
            .OrderBy(d => d.Code)
            .Select(d =>
            {
                userById.TryGetValue(d.HeadUserId ?? Guid.Empty, out var head);
                return new DirectorateDto(
                    d.Id,
                    d.Code,
                    d.Name,
                    d.Description,
                    d.HeadUserId,
                    head?.Username,
                    head?.FullName,
                    head?.Position?.Name,
                    d.IsActive,
                    divisions.Count(dv => dv.DirectorateId == d.Id),
                    users.Count(u => u.DirectorateId == d.Id));
            })
            .ToList();

        return Result<IReadOnlyList<DirectorateDto>>.Success(result);
    }

    public async Task<Result<DirectorateDto>> CreateDirectorateAsync(CreateOrUpdateDirectorateRequest request, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.Code) || string.IsNullOrWhiteSpace(request.Name))
        {
            return Result<DirectorateDto>.Failure("Kode dan Nama Direktorat wajib diisi.", 400);
        }

        var code = request.Code.Trim().ToUpperInvariant();
        if (await unitOfWork.Repository<Directorate>().AnyAsync(d => d.Code == code, cancellationToken))
        {
            return Result<DirectorateDto>.Failure($"Kode Direktorat '{code}' sudah digunakan.", 409);
        }

        var entity = new Directorate
        {
            Code = code,
            Name = request.Name.Trim(),
            Description = request.Description?.Trim() ?? string.Empty,
            HeadUserId = request.HeadUserId,
            IsActive = request.IsActive,
            CreatedBy = currentUserService.Username ?? "System"
        };

        await unitOfWork.Repository<Directorate>().AddAsync(entity, cancellationToken);
        await RecordAuditAsync("CREATE_DIRECTORATE", entity.Id, $"Membuat Master Direktorat '{entity.Name}' ({entity.Code}).", cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        await InvalidateOrgCachesAsync(cancellationToken);

        var list = await GetDirectoratesAsync(cancellationToken);
        var dto = list.Data!.First(x => x.Id == entity.Id);
        return Result<DirectorateDto>.Success(dto, "Direktorat berhasil ditambahkan.", 201);
    }

    public async Task<Result<DirectorateDto>> UpdateDirectorateAsync(Guid id, CreateOrUpdateDirectorateRequest request, CancellationToken cancellationToken = default)
    {
        var entity = await unitOfWork.Repository<Directorate>().GetByIdAsync(id, cancellationToken);
        if (entity is null) return Result<DirectorateDto>.Failure("Direktorat tidak ditemukan.", 404);

        var code = request.Code.Trim().ToUpperInvariant();
        if (await unitOfWork.Repository<Directorate>().AnyAsync(d => d.Id != id && d.Code == code, cancellationToken))
        {
            return Result<DirectorateDto>.Failure($"Kode Direktorat '{code}' sudah digunakan.", 409);
        }

        entity.Code = code;
        entity.Name = request.Name.Trim();
        entity.Description = request.Description?.Trim() ?? string.Empty;
        entity.HeadUserId = request.HeadUserId;
        entity.IsActive = request.IsActive;
        entity.UpdatedAt = DateTime.UtcNow;
        entity.UpdatedBy = currentUserService.Username ?? "System";

        unitOfWork.Repository<Directorate>().Update(entity);
        await RecordAuditAsync("UPDATE_DIRECTORATE", entity.Id, $"Memperbarui Master Direktorat '{entity.Name}' ({entity.Code}).", cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        await InvalidateOrgCachesAsync(cancellationToken);

        var list = await GetDirectoratesAsync(cancellationToken);
        return Result<DirectorateDto>.Success(list.Data!.First(x => x.Id == entity.Id), "Direktorat berhasil diperbarui.");
    }

    public async Task<Result> DeleteDirectorateAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var entity = await unitOfWork.Repository<Directorate>().GetByIdAsync(id, cancellationToken);
        if (entity is null) return Result.Failure("Direktorat tidak ditemukan.", 404);

        if (await unitOfWork.Repository<Division>().AnyAsync(dv => dv.DirectorateId == id, cancellationToken))
        {
            return Result.Failure("Tidak dapat menghapus Direktorat yang masih memiliki Divisi aktif.", 400);
        }

        unitOfWork.Repository<Directorate>().Remove(entity);
        await RecordAuditAsync("DELETE_DIRECTORATE", entity.Id, $"Menghapus Master Direktorat '{entity.Name}'.", cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        await InvalidateOrgCachesAsync(cancellationToken);
        return Result.Success("Direktorat berhasil dihapus.");
    }

    // ==================== DIVISIONS ====================
    public async Task<Result<IReadOnlyList<DivisionDto>>> GetDivisionsAsync(Guid? directorateId = null, CancellationToken cancellationToken = default)
    {
        var directorates = (await unitOfWork.Repository<Directorate>().GetListAsync(cancellationToken: cancellationToken)).ToDictionary(d => d.Id);
        var divisions = await unitOfWork.Repository<Division>().GetListAsync(cancellationToken: cancellationToken);
        var departments = await unitOfWork.Repository<Department>().GetListAsync(cancellationToken: cancellationToken);
        var users = await unitOfWork.Users.GetAllWithRolesAsync(cancellationToken);
        var userById = users.ToDictionary(u => u.Id);

        IEnumerable<Division> query = divisions;
        if (directorateId.HasValue)
        {
            query = query.Where(dv => dv.DirectorateId == directorateId.Value);
        }

        var result = query
            .OrderBy(dv => dv.Code)
            .Select(dv =>
            {
                directorates.TryGetValue(dv.DirectorateId, out var dir);
                userById.TryGetValue(dv.HeadUserId ?? Guid.Empty, out var head);
                return new DivisionDto(
                    dv.Id,
                    dv.DirectorateId,
                    dir?.Name ?? "-",
                    dv.Code,
                    dv.Name,
                    dv.Description,
                    dv.HeadUserId,
                    head?.Username,
                    head?.FullName,
                    dv.IsActive,
                    departments.Count(dp => dp.DivisionId == dv.Id),
                    users.Count(u => u.DivisionId == dv.Id));
            })
            .ToList();

        return Result<IReadOnlyList<DivisionDto>>.Success(result);
    }

    public async Task<Result<DivisionDto>> CreateDivisionAsync(CreateOrUpdateDivisionRequest request, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.Code) || string.IsNullOrWhiteSpace(request.Name))
        {
            return Result<DivisionDto>.Failure("Kode dan Nama Divisi wajib diisi.", 400);
        }

        if (!await unitOfWork.Repository<Directorate>().AnyAsync(d => d.Id == request.DirectorateId, cancellationToken))
        {
            return Result<DivisionDto>.Failure("Direktorat induk tidak ditemukan.", 404);
        }

        var code = request.Code.Trim().ToUpperInvariant();
        if (await unitOfWork.Repository<Division>().AnyAsync(d => d.Code == code, cancellationToken))
        {
            return Result<DivisionDto>.Failure($"Kode Divisi '{code}' sudah digunakan.", 409);
        }

        var entity = new Division
        {
            DirectorateId = request.DirectorateId,
            Code = code,
            Name = request.Name.Trim(),
            Description = request.Description?.Trim() ?? string.Empty,
            HeadUserId = request.HeadUserId,
            IsActive = request.IsActive,
            CreatedBy = currentUserService.Username ?? "System"
        };

        await unitOfWork.Repository<Division>().AddAsync(entity, cancellationToken);
        await RecordAuditAsync("CREATE_DIVISION", entity.Id, $"Membuat Master Divisi '{entity.Name}' ({entity.Code}).", cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        await InvalidateOrgCachesAsync(cancellationToken);

        var list = await GetDivisionsAsync(null, cancellationToken);
        return Result<DivisionDto>.Success(list.Data!.First(x => x.Id == entity.Id), "Divisi berhasil ditambahkan.", 201);
    }

    public async Task<Result<DivisionDto>> UpdateDivisionAsync(Guid id, CreateOrUpdateDivisionRequest request, CancellationToken cancellationToken = default)
    {
        var entity = await unitOfWork.Repository<Division>().GetByIdAsync(id, cancellationToken);
        if (entity is null) return Result<DivisionDto>.Failure("Divisi tidak ditemukan.", 404);

        var code = request.Code.Trim().ToUpperInvariant();
        if (await unitOfWork.Repository<Division>().AnyAsync(d => d.Id != id && d.Code == code, cancellationToken))
        {
            return Result<DivisionDto>.Failure($"Kode Divisi '{code}' sudah digunakan.", 409);
        }

        entity.DirectorateId = request.DirectorateId;
        entity.Code = code;
        entity.Name = request.Name.Trim();
        entity.Description = request.Description?.Trim() ?? string.Empty;
        entity.HeadUserId = request.HeadUserId;
        entity.IsActive = request.IsActive;
        entity.UpdatedAt = DateTime.UtcNow;
        entity.UpdatedBy = currentUserService.Username ?? "System";

        unitOfWork.Repository<Division>().Update(entity);
        await RecordAuditAsync("UPDATE_DIVISION", entity.Id, $"Memperbarui Master Divisi '{entity.Name}' ({entity.Code}).", cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        await InvalidateOrgCachesAsync(cancellationToken);

        var list = await GetDivisionsAsync(null, cancellationToken);
        return Result<DivisionDto>.Success(list.Data!.First(x => x.Id == entity.Id), "Divisi berhasil diperbarui.");
    }

    public async Task<Result> DeleteDivisionAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var entity = await unitOfWork.Repository<Division>().GetByIdAsync(id, cancellationToken);
        if (entity is null) return Result.Failure("Divisi tidak ditemukan.", 404);

        if (await unitOfWork.Repository<Department>().AnyAsync(dp => dp.DivisionId == id, cancellationToken))
        {
            return Result.Failure("Tidak dapat menghapus Divisi yang masih memiliki Departemen aktif.", 400);
        }

        unitOfWork.Repository<Division>().Remove(entity);
        await RecordAuditAsync("DELETE_DIVISION", entity.Id, $"Menghapus Master Divisi '{entity.Name}'.", cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        await InvalidateOrgCachesAsync(cancellationToken);
        return Result.Success("Divisi berhasil dihapus.");
    }

    // ==================== DEPARTMENTS ====================
    public async Task<Result<IReadOnlyList<DepartmentDto>>> GetDepartmentsAsync(Guid? divisionId = null, CancellationToken cancellationToken = default)
    {
        var directorates = (await unitOfWork.Repository<Directorate>().GetListAsync(cancellationToken: cancellationToken)).ToDictionary(d => d.Id);
        var divisions = (await unitOfWork.Repository<Division>().GetListAsync(cancellationToken: cancellationToken)).ToDictionary(d => d.Id);
        var departments = await unitOfWork.Repository<Department>().GetListAsync(cancellationToken: cancellationToken);
        var users = await unitOfWork.Users.GetAllWithRolesAsync(cancellationToken);
        var userById = users.ToDictionary(u => u.Id);

        IEnumerable<Department> query = departments;
        if (divisionId.HasValue)
        {
            query = query.Where(dp => dp.DivisionId == divisionId.Value);
        }

        var result = query
            .OrderBy(dp => dp.Code)
            .Select(dp =>
            {
                divisions.TryGetValue(dp.DivisionId, out var div);
                Directorate? dir = null;
                if (div is not null) directorates.TryGetValue(div.DirectorateId, out dir);
                userById.TryGetValue(dp.HeadUserId ?? Guid.Empty, out var head);

                return new DepartmentDto(
                    dp.Id,
                    dp.DivisionId,
                    div?.Name ?? "-",
                    div?.DirectorateId ?? Guid.Empty,
                    dir?.Name ?? "-",
                    dp.Code,
                    dp.Name,
                    dp.Description,
                    dp.HeadUserId,
                    head?.Username,
                    head?.FullName,
                    dp.IsActive,
                    users.Count(u => u.DepartmentId == dp.Id));
            })
            .ToList();

        return Result<IReadOnlyList<DepartmentDto>>.Success(result);
    }

    public async Task<Result<DepartmentDto>> CreateDepartmentAsync(CreateOrUpdateDepartmentRequest request, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.Code) || string.IsNullOrWhiteSpace(request.Name))
        {
            return Result<DepartmentDto>.Failure("Kode dan Nama Departemen wajib diisi.", 400);
        }

        if (!await unitOfWork.Repository<Division>().AnyAsync(dv => dv.Id == request.DivisionId, cancellationToken))
        {
            return Result<DepartmentDto>.Failure("Divisi induk tidak ditemukan.", 404);
        }

        var code = request.Code.Trim().ToUpperInvariant();
        if (await unitOfWork.Repository<Department>().AnyAsync(d => d.Code == code, cancellationToken))
        {
            return Result<DepartmentDto>.Failure($"Kode Departemen '{code}' sudah digunakan.", 409);
        }

        var entity = new Department
        {
            DivisionId = request.DivisionId,
            Code = code,
            Name = request.Name.Trim(),
            Description = request.Description?.Trim() ?? string.Empty,
            HeadUserId = request.HeadUserId,
            IsActive = request.IsActive,
            CreatedBy = currentUserService.Username ?? "System"
        };

        await unitOfWork.Repository<Department>().AddAsync(entity, cancellationToken);
        await RecordAuditAsync("CREATE_DEPARTMENT", entity.Id, $"Membuat Master Departemen '{entity.Name}' ({entity.Code}).", cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        await InvalidateOrgCachesAsync(cancellationToken);

        var list = await GetDepartmentsAsync(null, cancellationToken);
        return Result<DepartmentDto>.Success(list.Data!.First(x => x.Id == entity.Id), "Departemen berhasil ditambahkan.", 201);
    }

    public async Task<Result<DepartmentDto>> UpdateDepartmentAsync(Guid id, CreateOrUpdateDepartmentRequest request, CancellationToken cancellationToken = default)
    {
        var entity = await unitOfWork.Repository<Department>().GetByIdAsync(id, cancellationToken);
        if (entity is null) return Result<DepartmentDto>.Failure("Departemen tidak ditemukan.", 404);

        var code = request.Code.Trim().ToUpperInvariant();
        if (await unitOfWork.Repository<Department>().AnyAsync(d => d.Id != id && d.Code == code, cancellationToken))
        {
            return Result<DepartmentDto>.Failure($"Kode Departemen '{code}' sudah digunakan.", 409);
        }

        entity.DivisionId = request.DivisionId;
        entity.Code = code;
        entity.Name = request.Name.Trim();
        entity.Description = request.Description?.Trim() ?? string.Empty;
        entity.HeadUserId = request.HeadUserId;
        entity.IsActive = request.IsActive;
        entity.UpdatedAt = DateTime.UtcNow;
        entity.UpdatedBy = currentUserService.Username ?? "System";

        unitOfWork.Repository<Department>().Update(entity);
        await RecordAuditAsync("UPDATE_DEPARTMENT", entity.Id, $"Memperbarui Master Departemen '{entity.Name}' ({entity.Code}).", cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        await InvalidateOrgCachesAsync(cancellationToken);

        var list = await GetDepartmentsAsync(null, cancellationToken);
        return Result<DepartmentDto>.Success(list.Data!.First(x => x.Id == entity.Id), "Departemen berhasil diperbarui.");
    }

    public async Task<Result> DeleteDepartmentAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var entity = await unitOfWork.Repository<Department>().GetByIdAsync(id, cancellationToken);
        if (entity is null) return Result.Failure("Departemen tidak ditemukan.", 404);

        unitOfWork.Repository<Department>().Remove(entity);
        await RecordAuditAsync("DELETE_DEPARTMENT", entity.Id, $"Menghapus Master Departemen '{entity.Name}'.", cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        await InvalidateOrgCachesAsync(cancellationToken);
        return Result.Success("Departemen berhasil dihapus.");
    }

    // ==================== POSITIONS ====================
    public async Task<Result<IReadOnlyList<PositionDto>>> GetPositionsAsync(CancellationToken cancellationToken = default)
    {
        var positions = await unitOfWork.Repository<Position>().GetListAsync(cancellationToken: cancellationToken);
        var users = await unitOfWork.Users.GetAllWithRolesAsync(cancellationToken);

        var result = positions
            .OrderBy(p => p.Level)
            .ThenBy(p => p.Name)
            .Select(p => new PositionDto(
                p.Id,
                p.Code,
                p.Name,
                p.Level,
                p.Description,
                p.IsActive,
                users.Count(u => u.PositionId == p.Id)))
            .ToList();

        return Result<IReadOnlyList<PositionDto>>.Success(result);
    }

    public async Task<Result<PositionDto>> CreatePositionAsync(CreateOrUpdatePositionRequest request, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.Code) || string.IsNullOrWhiteSpace(request.Name))
        {
            return Result<PositionDto>.Failure("Kode dan Nama Posisi wajib diisi.", 400);
        }

        var code = request.Code.Trim().ToUpperInvariant();
        if (await unitOfWork.Repository<Position>().AnyAsync(p => p.Code == code, cancellationToken))
        {
            return Result<PositionDto>.Failure($"Kode Posisi '{code}' sudah digunakan.", 409);
        }

        var entity = new Position
        {
            Code = code,
            Name = request.Name.Trim(),
            Level = Math.Clamp(request.Level, 1, 10),
            Description = request.Description?.Trim() ?? string.Empty,
            IsActive = request.IsActive,
            CreatedBy = currentUserService.Username ?? "System"
        };

        await unitOfWork.Repository<Position>().AddAsync(entity, cancellationToken);
        await RecordAuditAsync("CREATE_POSITION", entity.Id, $"Membuat Master Posisi '{entity.Name}' (Level {entity.Level}).", cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        await InvalidateOrgCachesAsync(cancellationToken);

        return Result<PositionDto>.Success(
            new PositionDto(entity.Id, entity.Code, entity.Name, entity.Level, entity.Description, entity.IsActive, 0),
            "Posisi berhasil ditambahkan.",
            201);
    }

    public async Task<Result<PositionDto>> UpdatePositionAsync(Guid id, CreateOrUpdatePositionRequest request, CancellationToken cancellationToken = default)
    {
        var entity = await unitOfWork.Repository<Position>().GetByIdAsync(id, cancellationToken);
        if (entity is null) return Result<PositionDto>.Failure("Posisi tidak ditemukan.", 404);

        var code = request.Code.Trim().ToUpperInvariant();
        if (await unitOfWork.Repository<Position>().AnyAsync(p => p.Id != id && p.Code == code, cancellationToken))
        {
            return Result<PositionDto>.Failure($"Kode Posisi '{code}' sudah digunakan.", 409);
        }

        entity.Code = code;
        entity.Name = request.Name.Trim();
        entity.Level = Math.Clamp(request.Level, 1, 10);
        entity.Description = request.Description?.Trim() ?? string.Empty;
        entity.IsActive = request.IsActive;
        entity.UpdatedAt = DateTime.UtcNow;
        entity.UpdatedBy = currentUserService.Username ?? "System";

        unitOfWork.Repository<Position>().Update(entity);
        await RecordAuditAsync("UPDATE_POSITION", entity.Id, $"Memperbarui Master Posisi '{entity.Name}'.", cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        await InvalidateOrgCachesAsync(cancellationToken);

        var list = await GetPositionsAsync(cancellationToken);
        return Result<PositionDto>.Success(list.Data!.First(x => x.Id == entity.Id), "Posisi berhasil diperbarui.");
    }

    public async Task<Result> DeletePositionAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var entity = await unitOfWork.Repository<Position>().GetByIdAsync(id, cancellationToken);
        if (entity is null) return Result.Failure("Posisi tidak ditemukan.", 404);

        unitOfWork.Repository<Position>().Remove(entity);
        await RecordAuditAsync("DELETE_POSITION", entity.Id, $"Menghapus Master Posisi '{entity.Name}'.", cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        await InvalidateOrgCachesAsync(cancellationToken);
        return Result.Success("Posisi berhasil dihapus.");
    }

    private static OrgMemberSummaryDto MapMemberSummary(User u) =>
        new(
            u.Id,
            u.EmployeeCode,
            u.Username,
            u.FullName,
            u.Position?.Name,
            u.Position?.Level,
            u.UserRoles.Where(ur => ur.Role is not null && !ur.Role.IsDeleted).Select(ur => ur.Role.Name).Distinct().ToList());

    private async Task RecordAuditAsync(string action, Guid entityId, string details, CancellationToken cancellationToken)
    {
        await unitOfWork.Repository<AuditLog>().AddAsync(new AuditLog
        {
            UserId = currentUserService.UserId,
            UserName = currentUserService.Username ?? "System",
            Action = action,
            Module = "Organization",
            EntityId = entityId.ToString(),
            Details = $"[Identity.Api] {details}",
            IpAddress = currentUserService.IpAddress
        }, cancellationToken);
    }

    private async Task InvalidateOrgCachesAsync(CancellationToken cancellationToken)
    {
        if (cacheService is null) return;
        await cacheService.RemoveByPrefixAsync(CacheKeys.OrganizationPrefix, cancellationToken);
        await cacheService.RemoveByPrefixAsync(CacheKeys.UsersPrefix, cancellationToken);
        await cacheService.RemoveByPrefixAsync(CacheKeys.DashboardPrefix, cancellationToken);
    }
}
