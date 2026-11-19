using BuildingBlocks.Core.Common;
using BuildingBlocks.Core.Interfaces;
using BuildingBlocks.Infrastructure.Persistence;
using Identity.Api.Domain.Entities;
using Identity.Api.Domain.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace Identity.Api.Infrastructure.Persistence;

public class UserRepository(IdentityDbContext dbContext)
    : GenericRepository<User, IdentityDbContext>(dbContext), IUserRepository
{
    public async Task<User?> GetWithRolesAndPermissionsByUsernameOrEmailAsync(
        string usernameOrEmail,
        CancellationToken cancellationToken = default)
    {
        var normalized = usernameOrEmail.ToLowerInvariant();
        return await DbSet
            .AsSplitQuery()
            .Include(u => u.UserRoles)
                .ThenInclude(ur => ur.Role)
                    .ThenInclude(r => r.RolePermissions)
            .FirstOrDefaultAsync(
                u => u.Username.ToLower() == normalized || u.Email.ToLower() == normalized,
                cancellationToken);
    }

    public async Task<User?> GetWithRolesAndPermissionsByIdAsync(Guid userId, CancellationToken cancellationToken = default) =>
        await DbSet
            .AsSplitQuery()
            .Include(u => u.UserRoles)
                .ThenInclude(ur => ur.Role)
                    .ThenInclude(r => r.RolePermissions)
            .FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);

    public async Task<User?> GetByRefreshTokenAsync(string refreshToken, CancellationToken cancellationToken = default) =>
        await DbSet
            .AsSplitQuery()
            .Include(u => u.RefreshTokens)
            .Include(u => u.UserRoles)
                .ThenInclude(ur => ur.Role)
                    .ThenInclude(r => r.RolePermissions)
            .FirstOrDefaultAsync(
                u => u.RefreshTokens.Any(rt => rt.Token == refreshToken),
                cancellationToken);

    public async Task<List<User>> GetAllWithRolesAsync(CancellationToken cancellationToken = default) =>
        await DbSet
            .AsNoTracking()
            .AsSplitQuery()
            .Include(u => u.UserRoles)
                .ThenInclude(ur => ur.Role)
            .OrderBy(u => u.Username)
            .ToListAsync(cancellationToken);
}

public class RoleRepository(IdentityDbContext dbContext)
    : GenericRepository<Role, IdentityDbContext>(dbContext), IRoleRepository
{
    public async Task<List<Role>> GetAllWithDetailsAsync(CancellationToken cancellationToken = default) =>
        await DbSet
            .AsNoTracking()
            .AsSplitQuery()
            .Include(r => r.RolePermissions)
            .Include(r => r.RoleMenus)
            .Include(r => r.UserRoles)
                .ThenInclude(ur => ur.User)
            .OrderBy(r => r.CreatedAt)
            .ToListAsync(cancellationToken);

    public async Task<Role?> GetWithDetailsByIdAsync(Guid roleId, CancellationToken cancellationToken = default) =>
        await DbSet
            .AsSplitQuery()
            .Include(r => r.RolePermissions)
            .Include(r => r.RoleMenus)
            .Include(r => r.UserRoles)
                .ThenInclude(ur => ur.User)
            .FirstOrDefaultAsync(r => r.Id == roleId, cancellationToken);

    public async Task ReplaceRolePermissionsAsync(
        Guid roleId,
        IEnumerable<string> permissionCodes,
        CancellationToken cancellationToken = default)
    {
        var existing = await DbContext.RolePermissions
            .IgnoreQueryFilters()
            .Where(rp => rp.RoleId == roleId)
            .ToListAsync(cancellationToken);

        DbContext.RolePermissions.RemoveRange(existing);

        var distinctCodes = permissionCodes.Distinct(StringComparer.OrdinalIgnoreCase);
        foreach (var code in distinctCodes)
        {
            await DbContext.RolePermissions.AddAsync(new RolePermission
            {
                RoleId = roleId,
                PermissionCode = code
            }, cancellationToken);
        }
    }

    public async Task ReplaceRoleMenusAsync(
        Guid roleId,
        IEnumerable<Guid> menuIds,
        CancellationToken cancellationToken = default)
    {
        var existing = await DbContext.RoleMenus
            .IgnoreQueryFilters()
            .Where(rm => rm.RoleId == roleId)
            .ToListAsync(cancellationToken);

        DbContext.RoleMenus.RemoveRange(existing);

        foreach (var menuId in menuIds.Distinct())
        {
            await DbContext.RoleMenus.AddAsync(new RoleMenu
            {
                RoleId = roleId,
                MenuItemId = menuId
            }, cancellationToken);
        }
    }
}

public class MenuRepository(IdentityDbContext dbContext)
    : GenericRepository<MenuItem, IdentityDbContext>(dbContext), IMenuRepository
{
    public async Task<List<MenuItem>> GetAllWithRolesAsync(CancellationToken cancellationToken = default) =>
        await DbSet
            .AsNoTracking()
            .AsSplitQuery()
            .Include(m => m.RoleMenus)
                .ThenInclude(rm => rm.Role)
            .OrderBy(m => m.SortOrder)
            .ToListAsync(cancellationToken);

    public async Task<MenuItem?> GetWithRolesByIdAsync(Guid menuId, CancellationToken cancellationToken = default) =>
        await DbSet
            .AsSplitQuery()
            .Include(m => m.RoleMenus)
                .ThenInclude(rm => rm.Role)
            .FirstOrDefaultAsync(m => m.Id == menuId, cancellationToken);

    public async Task<List<MenuItem>> GetMenusByRoleNamesAsync(
        IEnumerable<string> roleNames,
        CancellationToken cancellationToken = default)
    {
        var normalizedRoles = roleNames.Select(r => r.ToLowerInvariant()).ToList();
        return await DbSet
            .AsNoTracking()
            .AsSplitQuery()
            .Include(m => m.RoleMenus)
                .ThenInclude(rm => rm.Role)
            .Where(m => m.RoleMenus.Any(rm => normalizedRoles.Contains(rm.Role.Name.ToLower())))
            .OrderBy(m => m.SortOrder)
            .ToListAsync(cancellationToken);
    }

    public async Task ReplaceMenuRolesAsync(
        Guid menuId,
        IEnumerable<Guid> roleIds,
        CancellationToken cancellationToken = default)
    {
        var existing = await DbContext.RoleMenus
            .IgnoreQueryFilters()
            .Where(rm => rm.MenuItemId == menuId)
            .ToListAsync(cancellationToken);

        DbContext.RoleMenus.RemoveRange(existing);

        foreach (var roleId in roleIds.Distinct())
        {
            await DbContext.RoleMenus.AddAsync(new RoleMenu
            {
                RoleId = roleId,
                MenuItemId = menuId
            }, cancellationToken);
        }
    }
}

public class IdentityUnitOfWork(IdentityDbContext dbContext) : IIdentityUnitOfWork
{
    private readonly Dictionary<Type, object> _repositories = new();
    private IUserRepository? _users;
    private IRoleRepository? _roles;
    private IMenuRepository? _menus;

    public IUserRepository Users => _users ??= new UserRepository(dbContext);
    public IRoleRepository Roles => _roles ??= new RoleRepository(dbContext);
    public IMenuRepository Menus => _menus ??= new MenuRepository(dbContext);

    public IRepository<T> Repository<T>() where T : BaseEntity
    {
        var type = typeof(T);
        if (!_repositories.TryGetValue(type, out var repo))
        {
            repo = new GenericRepository<T, IdentityDbContext>(dbContext);
            _repositories[type] = repo;
        }
        return (IRepository<T>)repo;
    }

    public Task<int> SaveChangesAsync(CancellationToken cancellationToken = default) =>
        dbContext.SaveChangesAsync(cancellationToken);
}
