using BuildingBlocks.Core.Common;
using BuildingBlocks.Core.Constants;
using BuildingBlocks.Core.Interfaces;
using Identity.Api.Application.DTOs;
using Identity.Api.Application.Interfaces;
using Identity.Api.Domain.Entities;
using Identity.Api.Domain.Interfaces;

namespace Identity.Api.Application.Services;

public class RoleService(
    IIdentityUnitOfWork unitOfWork,
    ICurrentUserService currentUserService,
    ICacheService cacheService) : IRoleService
{
    public async Task<Result<IReadOnlyList<RoleDto>>> GetAllRolesAsync(CancellationToken cancellationToken = default)
    {
        var dtos = await cacheService.GetOrCreateAsync(
            CacheKeys.AllRoles(),
            async ct =>
            {
                var roles = await unitOfWork.Roles.GetAllWithDetailsAsync(ct);
                return roles.Select(MapToDto).ToList();
            },
            TimeSpan.FromMinutes(15),
            cancellationToken);

        return Result<IReadOnlyList<RoleDto>>.Success(dtos);
    }

    public Task<Result<IReadOnlyList<PermissionDto>>> GetAllPermissionsAsync(CancellationToken cancellationToken = default)
    {
        var permissions = Permissions.GetAll()
            .Select(p => new PermissionDto(p.Code, p.Name, p.Module, p.Description))
            .ToList();

        return Task.FromResult(Result<IReadOnlyList<PermissionDto>>.Success(permissions));
    }

    public async Task<Result<RoleDto>> CreateRoleAsync(CreateOrUpdateRoleRequest request, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return Result<RoleDto>.Failure("Nama role wajib diisi.", 400);
        }

        var roleName = request.Name.Trim();
        if (await unitOfWork.Roles.AnyAsync(r => r.Name.ToLower() == roleName.ToLower(), cancellationToken))
        {
            return Result<RoleDto>.Failure($"Role '{roleName}' sudah ada.", 409);
        }

        var role = new Role
        {
            Name = roleName,
            DisplayName = string.IsNullOrWhiteSpace(request.DisplayName) ? roleName : request.DisplayName.Trim(),
            Description = request.Description.Trim(),
            BadgeColor = string.IsNullOrWhiteSpace(request.BadgeColor) ? "indigo" : request.BadgeColor.Trim(),
            IsSystemRole = false,
            CreatedBy = currentUserService.Username ?? "System"
        };

        foreach (var code in (request.Permissions ?? []).Distinct())
        {
            role.RolePermissions.Add(new RolePermission
            {
                RoleId = role.Id,
                PermissionCode = code
            });
        }

        foreach (var menuId in (request.MenuIds ?? []).Distinct())
        {
            role.RoleMenus.Add(new RoleMenu
            {
                RoleId = role.Id,
                MenuItemId = menuId
            });
        }

        await unitOfWork.Roles.AddAsync(role, cancellationToken);
        await unitOfWork.Repository<AuditLog>().AddAsync(new AuditLog
        {
            UserId = currentUserService.UserId,
            UserName = currentUserService.Username ?? "System",
            Action = "CREATE_ROLE",
            Module = "Roles",
            EntityId = role.Id.ToString(),
            Details = $"[Identity.Api] Membuat role baru '{role.Name}' dengan {role.RolePermissions.Count} permission.",
            IpAddress = currentUserService.IpAddress
        }, cancellationToken);

        await unitOfWork.SaveChangesAsync(cancellationToken);
        await cacheService.RemoveByPrefixAsync(CacheKeys.RolesPrefix, cancellationToken);
        await cacheService.RemoveByPrefixAsync(CacheKeys.MenusPrefix, cancellationToken);
        await cacheService.RemoveByPrefixAsync(CacheKeys.UsersPrefix, cancellationToken);
        await cacheService.RemoveByPrefixAsync(CacheKeys.DashboardPrefix, cancellationToken);

        return Result<RoleDto>.Success(MapToDto(role), "Role berhasil dibuat.", 201);
    }

    public async Task<Result<RoleDto>> UpdateRoleAsync(Guid id, CreateOrUpdateRoleRequest request, CancellationToken cancellationToken = default)
    {
        var role = await unitOfWork.Roles.GetWithDetailsByIdAsync(id, cancellationToken);
        if (role is null)
        {
            return Result<RoleDto>.Failure("Role tidak ditemukan.", 404);
        }

        if (!role.Name.Equals(RoleNames.SuperAdmin, StringComparison.OrdinalIgnoreCase) &&
            !string.IsNullOrWhiteSpace(request.Name))
        {
            role.Name = request.Name.Trim();
        }

        role.DisplayName = string.IsNullOrWhiteSpace(request.DisplayName) ? role.Name : request.DisplayName.Trim();
        role.Description = request.Description.Trim();
        role.BadgeColor = string.IsNullOrWhiteSpace(request.BadgeColor) ? role.BadgeColor : request.BadgeColor.Trim();
        role.UpdatedAt = DateTime.UtcNow;
        role.UpdatedBy = currentUserService.Username ?? "System";

        unitOfWork.Roles.Update(role);

        var permissionsToAssign = role.Name.Equals(RoleNames.SuperAdmin, StringComparison.OrdinalIgnoreCase)
            ? Permissions.GetAll().Select(p => p.Code)
            : (request.Permissions ?? []);

        await unitOfWork.Roles.ReplaceRolePermissionsAsync(role.Id, permissionsToAssign, cancellationToken);
        await unitOfWork.Roles.ReplaceRoleMenusAsync(role.Id, request.MenuIds ?? [], cancellationToken);

        await unitOfWork.Repository<AuditLog>().AddAsync(new AuditLog
        {
            UserId = currentUserService.UserId,
            UserName = currentUserService.Username ?? "System",
            Action = "UPDATE_ROLE",
            Module = "Roles",
            EntityId = role.Id.ToString(),
            Details = $"[Identity.Api] Memperbarui konfigurasi role '{role.Name}' (permissions & akses menu).",
            IpAddress = currentUserService.IpAddress
        }, cancellationToken);

        await unitOfWork.SaveChangesAsync(cancellationToken);
        await cacheService.RemoveByPrefixAsync(CacheKeys.RolesPrefix, cancellationToken);
        await cacheService.RemoveByPrefixAsync(CacheKeys.MenusPrefix, cancellationToken);
        await cacheService.RemoveByPrefixAsync(CacheKeys.UsersPrefix, cancellationToken);
        await cacheService.RemoveByPrefixAsync(CacheKeys.DashboardPrefix, cancellationToken);

        var updated = await unitOfWork.Roles.GetWithDetailsByIdAsync(id, cancellationToken);
        return Result<RoleDto>.Success(MapToDto(updated ?? role), "Role & hak akses berhasil diperbarui.");
    }

    public async Task<Result> DeleteRoleAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var role = await unitOfWork.Roles.GetWithDetailsByIdAsync(id, cancellationToken);
        if (role is null)
        {
            return Result.Failure("Role tidak ditemukan.", 404);
        }

        if (role.IsSystemRole || role.Name.Equals(RoleNames.SuperAdmin, StringComparison.OrdinalIgnoreCase))
        {
            return Result.Failure($"Role sistem '{role.Name}' tidak dapat dihapus (namun hak aksesnya dapat disesuaikan).", 400);
        }

        unitOfWork.Roles.Remove(role);
        await unitOfWork.Repository<AuditLog>().AddAsync(new AuditLog
        {
            UserId = currentUserService.UserId,
            UserName = currentUserService.Username ?? "System",
            Action = "DELETE_ROLE",
            Module = "Roles",
            EntityId = role.Id.ToString(),
            Details = $"[Identity.Api] Menghapus role '{role.Name}'.",
            IpAddress = currentUserService.IpAddress
        }, cancellationToken);

        await unitOfWork.SaveChangesAsync(cancellationToken);
        await cacheService.RemoveByPrefixAsync(CacheKeys.RolesPrefix, cancellationToken);
        await cacheService.RemoveByPrefixAsync(CacheKeys.MenusPrefix, cancellationToken);
        await cacheService.RemoveByPrefixAsync(CacheKeys.UsersPrefix, cancellationToken);
        await cacheService.RemoveByPrefixAsync(CacheKeys.DashboardPrefix, cancellationToken);

        return Result.Success("Role berhasil dihapus.");
    }

    private static RoleDto MapToDto(Role role)
    {
        var permissions = role.Name.Equals(RoleNames.SuperAdmin, StringComparison.OrdinalIgnoreCase)
            ? Permissions.GetAll().Select(p => p.Code).ToList()
            : role.RolePermissions.Select(rp => rp.PermissionCode).Distinct().ToList();

        return new RoleDto(
            role.Id,
            role.Name,
            role.DisplayName,
            role.Description,
            role.BadgeColor,
            role.IsSystemRole,
            role.UserRoles.Count(ur => ur.User is not null && !ur.User.IsDeleted),
            permissions,
            role.RoleMenus.Select(rm => rm.MenuItemId).Distinct().ToList());
    }
}
