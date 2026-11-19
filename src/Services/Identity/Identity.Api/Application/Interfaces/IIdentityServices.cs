using BuildingBlocks.Core.Common;
using BuildingBlocks.Core.Contracts;
using Identity.Api.Application.DTOs;
using Identity.Api.Domain.Entities;

namespace Identity.Api.Application.Interfaces;

public interface IAuthService
{
    Task<Result<AuthResponse>> LoginAsync(LoginRequest request, CancellationToken cancellationToken = default);
    Task<Result<AuthResponse>> RefreshTokenAsync(RefreshTokenRequest request, CancellationToken cancellationToken = default);
    Task<Result> LogoutAsync(string? refreshToken, CancellationToken cancellationToken = default);
    Task<Result> LogoutAllDevicesAsync(CancellationToken cancellationToken = default);
    Task<Result<CurrentUserDto>> GetCurrentUserAsync(CancellationToken cancellationToken = default);
    Task<Result<CurrentUserDto>> UpdateProfileAsync(UpdateProfileRequest request, CancellationToken cancellationToken = default);
    Task<Result> ChangePasswordAsync(ChangePasswordRequest request, CancellationToken cancellationToken = default);
}

public interface IUserService
{
    Task<Result<IReadOnlyList<UserDto>>> GetAllUsersAsync(string? search = null, string? role = null, CancellationToken cancellationToken = default);
    Task<Result<UserDto>> GetUserByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<Result<UserDto>> CreateUserAsync(CreateUserRequest request, CancellationToken cancellationToken = default);
    Task<Result<UserDto>> UpdateUserAsync(Guid id, UpdateUserRequest request, CancellationToken cancellationToken = default);
    Task<Result> DeleteUserAsync(Guid id, CancellationToken cancellationToken = default);
}

public interface IRoleService
{
    Task<Result<IReadOnlyList<RoleDto>>> GetAllRolesAsync(CancellationToken cancellationToken = default);
    Task<Result<IReadOnlyList<PermissionDto>>> GetAllPermissionsAsync(CancellationToken cancellationToken = default);
    Task<Result<RoleDto>> CreateRoleAsync(CreateOrUpdateRoleRequest request, CancellationToken cancellationToken = default);
    Task<Result<RoleDto>> UpdateRoleAsync(Guid id, CreateOrUpdateRoleRequest request, CancellationToken cancellationToken = default);
    Task<Result> DeleteRoleAsync(Guid id, CancellationToken cancellationToken = default);
}

public interface IMenuService
{
    Task<Result<IReadOnlyList<MenuItemDto>>> GetMyMenusAsync(CancellationToken cancellationToken = default);
    Task<Result<IReadOnlyList<MenuItemDto>>> GetAllMenusAsync(CancellationToken cancellationToken = default);
    Task<Result<MenuItemDto>> CreateMenuAsync(CreateOrUpdateMenuRequest request, CancellationToken cancellationToken = default);
    Task<Result<MenuItemDto>> UpdateMenuAsync(Guid id, CreateOrUpdateMenuRequest request, CancellationToken cancellationToken = default);
    Task<Result> DeleteMenuAsync(Guid id, CancellationToken cancellationToken = default);
}

public interface IDashboardService
{
    Task<Result<DashboardSummaryDto>> GetSummaryAsync(CancellationToken cancellationToken = default);
    Task<Result<IReadOnlyList<AuditLogDto>>> GetAuditLogsAsync(int limit = 100, CancellationToken cancellationToken = default);
    Task<Result> RecordIntegrationAuditLogAsync(AuditLogIntegrationEvent integrationEvent, CancellationToken cancellationToken = default);
}

public interface IJwtTokenService
{
    (string AccessToken, DateTime ExpiresAt) GenerateAccessToken(
        User user,
        IEnumerable<string> roles,
        IEnumerable<string> permissions);

    string GenerateRefreshToken();
    int GetRefreshTokenExpiryDays();
}

public interface IPasswordHasher
{
    string HashPassword(string password);
    bool VerifyPassword(string password, string passwordHash);
}

public interface ICatalogStatsClient
{
    Task<CatalogStatsDto> GetCatalogStatsAsync(CancellationToken cancellationToken = default);
}
