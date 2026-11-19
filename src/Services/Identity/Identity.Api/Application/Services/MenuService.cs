using BuildingBlocks.Core.Common;
using BuildingBlocks.Core.Constants;
using BuildingBlocks.Core.Interfaces;
using Identity.Api.Application.DTOs;
using Identity.Api.Application.Interfaces;
using Identity.Api.Domain.Entities;
using Identity.Api.Domain.Interfaces;

namespace Identity.Api.Application.Services;

public class MenuService(
    IIdentityUnitOfWork unitOfWork,
    ICurrentUserService currentUserService,
    ICacheService cacheService) : IMenuService
{
    public async Task<Result<IReadOnlyList<MenuItemDto>>> GetMyMenusAsync(CancellationToken cancellationToken = default)
    {
        var roles = currentUserService.Roles;
        if (roles.Count == 0)
        {
            return Result<IReadOnlyList<MenuItemDto>>.Success([]);
        }

        var cacheKey = CacheKeys.MenusByRoles(roles);

        var menus = await cacheService.GetOrCreateAsync(
            cacheKey,
            async ct =>
            {
                var allMenusResult = await GetAllMenusAsync(ct);
                var allMenus = allMenusResult.Data ?? [];

                if (roles.Contains(RoleNames.SuperAdmin, StringComparer.OrdinalIgnoreCase))
                {
                    return allMenus
                        .Where(m => m.IsVisible)
                        .OrderBy(m => m.SortOrder)
                        .ToList();
                }

                var userPermissions = currentUserService.Permissions;

                return allMenus
                    .Where(m => m.IsVisible &&
                                m.AssignedRoles.Any(ar => roles.Contains(ar, StringComparer.OrdinalIgnoreCase)) &&
                                (string.IsNullOrWhiteSpace(m.RequiredPermission) ||
                                 userPermissions.Contains(m.RequiredPermission, StringComparer.OrdinalIgnoreCase)))
                    .OrderBy(m => m.SortOrder)
                    .ToList();
            },
            TimeSpan.FromMinutes(15),
            cancellationToken);

        return Result<IReadOnlyList<MenuItemDto>>.Success(menus);
    }

    public async Task<Result<IReadOnlyList<MenuItemDto>>> GetAllMenusAsync(CancellationToken cancellationToken = default)
    {
        var dtos = await cacheService.GetOrCreateAsync(
            CacheKeys.AllMenus(),
            async ct =>
            {
                var menus = await unitOfWork.Menus.GetAllWithRolesAsync(ct);
                return menus.OrderBy(m => m.SortOrder).Select(MapToDto).ToList();
            },
            TimeSpan.FromMinutes(15),
            cancellationToken);

        return Result<IReadOnlyList<MenuItemDto>>.Success(dtos);
    }

    public async Task<Result<MenuItemDto>> CreateMenuAsync(CreateOrUpdateMenuRequest request, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.Title) || string.IsNullOrWhiteSpace(request.Path))
        {
            return Result<MenuItemDto>.Failure("Judul menu dan Path wajib diisi.", 400);
        }

        var menu = new MenuItem
        {
            Code = string.IsNullOrWhiteSpace(request.Code)
                ? request.Title.Trim().ToLowerInvariant().Replace(' ', '-')
                : request.Code.Trim(),
            Title = request.Title.Trim(),
            Path = request.Path.Trim(),
            Icon = string.IsNullOrWhiteSpace(request.Icon) ? "Folder" : request.Icon.Trim(),
            GroupName = string.IsNullOrWhiteSpace(request.GroupName) ? "MAIN" : request.GroupName.Trim().ToUpperInvariant(),
            SortOrder = request.SortOrder,
            RequiredPermission = string.IsNullOrWhiteSpace(request.RequiredPermission) ? null : request.RequiredPermission.Trim(),
            IsVisible = request.IsVisible,
            Description = request.Description?.Trim(),
            CreatedBy = currentUserService.Username ?? "System"
        };

        await unitOfWork.Menus.AddAsync(menu, cancellationToken);
        await unitOfWork.Menus.ReplaceMenuRolesAsync(menu.Id, request.RoleIds ?? [], cancellationToken);

        await unitOfWork.Repository<AuditLog>().AddAsync(new AuditLog
        {
            UserId = currentUserService.UserId,
            UserName = currentUserService.Username ?? "System",
            Action = "CREATE_MENU",
            Module = "Menus",
            EntityId = menu.Id.ToString(),
            Details = $"[Identity.Api] Menambahkan menu '{menu.Title}' ({menu.Path}).",
            IpAddress = currentUserService.IpAddress
        }, cancellationToken);

        await unitOfWork.SaveChangesAsync(cancellationToken);
        await cacheService.RemoveByPrefixAsync(CacheKeys.MenusPrefix, cancellationToken);
        await cacheService.RemoveByPrefixAsync(CacheKeys.DashboardPrefix, cancellationToken);

        var created = await unitOfWork.Menus.GetWithRolesByIdAsync(menu.Id, cancellationToken);
        return Result<MenuItemDto>.Success(MapToDto(created ?? menu), "Menu berhasil ditambahkan.", 201);
    }

    public async Task<Result<MenuItemDto>> UpdateMenuAsync(Guid id, CreateOrUpdateMenuRequest request, CancellationToken cancellationToken = default)
    {
        var menu = await unitOfWork.Menus.GetWithRolesByIdAsync(id, cancellationToken);
        if (menu is null)
        {
            return Result<MenuItemDto>.Failure("Menu tidak ditemukan.", 404);
        }

        menu.Title = request.Title.Trim();
        menu.Path = request.Path.Trim();
        menu.Icon = string.IsNullOrWhiteSpace(request.Icon) ? menu.Icon : request.Icon.Trim();
        menu.GroupName = string.IsNullOrWhiteSpace(request.GroupName) ? menu.GroupName : request.GroupName.Trim().ToUpperInvariant();
        menu.SortOrder = request.SortOrder;
        menu.RequiredPermission = string.IsNullOrWhiteSpace(request.RequiredPermission) ? null : request.RequiredPermission.Trim();
        menu.IsVisible = request.IsVisible;
        menu.Description = request.Description?.Trim();
        menu.UpdatedAt = DateTime.UtcNow;
        menu.UpdatedBy = currentUserService.Username ?? "System";

        unitOfWork.Menus.Update(menu);
        await unitOfWork.Menus.ReplaceMenuRolesAsync(menu.Id, request.RoleIds ?? [], cancellationToken);

        await unitOfWork.Repository<AuditLog>().AddAsync(new AuditLog
        {
            UserId = currentUserService.UserId,
            UserName = currentUserService.Username ?? "System",
            Action = "UPDATE_MENU",
            Module = "Menus",
            EntityId = menu.Id.ToString(),
            Details = $"[Identity.Api] Memperbarui menu '{menu.Title}' ({menu.Path}).",
            IpAddress = currentUserService.IpAddress
        }, cancellationToken);

        await unitOfWork.SaveChangesAsync(cancellationToken);
        await cacheService.RemoveByPrefixAsync(CacheKeys.MenusPrefix, cancellationToken);
        await cacheService.RemoveByPrefixAsync(CacheKeys.DashboardPrefix, cancellationToken);

        var updated = await unitOfWork.Menus.GetWithRolesByIdAsync(id, cancellationToken);
        return Result<MenuItemDto>.Success(MapToDto(updated ?? menu), "Menu berhasil diperbarui.");
    }

    public async Task<Result> DeleteMenuAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var menu = await unitOfWork.Menus.GetByIdAsync(id, cancellationToken);
        if (menu is null)
        {
            return Result.Failure("Menu tidak ditemukan.", 404);
        }

        unitOfWork.Menus.Remove(menu);
        await unitOfWork.Repository<AuditLog>().AddAsync(new AuditLog
        {
            UserId = currentUserService.UserId,
            UserName = currentUserService.Username ?? "System",
            Action = "DELETE_MENU",
            Module = "Menus",
            EntityId = menu.Id.ToString(),
            Details = $"[Identity.Api] Menghapus menu '{menu.Title}'.",
            IpAddress = currentUserService.IpAddress
        }, cancellationToken);

        await unitOfWork.SaveChangesAsync(cancellationToken);
        await cacheService.RemoveByPrefixAsync(CacheKeys.MenusPrefix, cancellationToken);
        await cacheService.RemoveByPrefixAsync(CacheKeys.DashboardPrefix, cancellationToken);
        return Result.Success("Menu berhasil dihapus.");
    }

    private static MenuItemDto MapToDto(MenuItem menu) =>
        new(
            menu.Id,
            menu.Code,
            menu.Title,
            menu.Path,
            menu.Icon,
            menu.GroupName,
            menu.SortOrder,
            menu.ParentId,
            menu.RequiredPermission,
            menu.IsVisible,
            menu.Description,
            menu.RoleMenus
                .Where(rm => rm.Role is not null && !rm.Role.IsDeleted)
                .Select(rm => rm.Role.Name)
                .Distinct()
                .ToList(),
            menu.RoleMenus
                .Select(rm => rm.RoleId)
                .Distinct()
                .ToList());
}
