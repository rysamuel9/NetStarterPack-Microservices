using BuildingBlocks.Core.Common;
using BuildingBlocks.Core.Interfaces;
using Identity.Api.Domain.Entities;

namespace Identity.Api.Domain.Interfaces;

public interface IUserRepository : IRepository<User>
{
    Task<User?> GetWithRolesAndPermissionsByUsernameOrEmailAsync(string usernameOrEmail, CancellationToken cancellationToken = default);
    Task<User?> GetWithRolesAndPermissionsByIdAsync(Guid userId, CancellationToken cancellationToken = default);
    Task<User?> GetByRefreshTokenAsync(string refreshToken, CancellationToken cancellationToken = default);
    Task<List<User>> GetAllWithRolesAsync(CancellationToken cancellationToken = default);
}

public interface IRoleRepository : IRepository<Role>
{
    Task<List<Role>> GetAllWithDetailsAsync(CancellationToken cancellationToken = default);
    Task<Role?> GetWithDetailsByIdAsync(Guid roleId, CancellationToken cancellationToken = default);
    Task ReplaceRolePermissionsAsync(Guid roleId, IEnumerable<string> permissionCodes, CancellationToken cancellationToken = default);
    Task ReplaceRoleMenusAsync(Guid roleId, IEnumerable<Guid> menuIds, CancellationToken cancellationToken = default);
}

public interface IMenuRepository : IRepository<MenuItem>
{
    Task<List<MenuItem>> GetAllWithRolesAsync(CancellationToken cancellationToken = default);
    Task<MenuItem?> GetWithRolesByIdAsync(Guid menuId, CancellationToken cancellationToken = default);
    Task<List<MenuItem>> GetMenusByRoleNamesAsync(IEnumerable<string> roleNames, CancellationToken cancellationToken = default);
    Task ReplaceMenuRolesAsync(Guid menuId, IEnumerable<Guid> roleIds, CancellationToken cancellationToken = default);
}

public interface IIdentityUnitOfWork
{
    IUserRepository Users { get; }
    IRoleRepository Roles { get; }
    IMenuRepository Menus { get; }
    IRepository<T> Repository<T>() where T : BaseEntity;
    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
