namespace Identity.Api.Application.DTOs;

public record LoginRequest(string UsernameOrEmail, string Password);
public record RefreshTokenRequest(string RefreshToken);
public record ChangePasswordRequest(string CurrentPassword, string NewPassword);
public record UpdateProfileRequest(string FullName, string Email, string? PhoneNumber, string? Department);

public record AuthResponse(
    string AccessToken,
    string RefreshToken,
    DateTime ExpiresAt,
    CurrentUserDto User
);

public record CurrentUserDto(
    Guid Id,
    string Username,
    string Email,
    string FullName,
    string? PhoneNumber,
    string? Department,
    string? AvatarUrl,
    string Status,
    IReadOnlyList<string> Roles,
    IReadOnlyList<string> Permissions,
    DateTime? LastLoginAt
);

public record UserDto(
    Guid Id,
    string Username,
    string Email,
    string FullName,
    string? PhoneNumber,
    string? Department,
    string Status,
    IReadOnlyList<string> Roles,
    DateTime CreatedAt,
    DateTime? LastLoginAt
);

public record CreateUserRequest(
    string Username,
    string Email,
    string FullName,
    string Password,
    string? PhoneNumber,
    string? Department,
    string Status,
    List<string> Roles
);

public record UpdateUserRequest(
    string Email,
    string FullName,
    string? PhoneNumber,
    string? Department,
    string Status,
    string? NewPassword,
    List<string> Roles
);

public record RoleDto(
    Guid Id,
    string Name,
    string DisplayName,
    string Description,
    string BadgeColor,
    bool IsSystemRole,
    int UserCount,
    IReadOnlyList<string> Permissions,
    IReadOnlyList<Guid> MenuIds
);

public record CreateOrUpdateRoleRequest(
    string Name,
    string DisplayName,
    string Description,
    string BadgeColor,
    List<string> Permissions,
    List<Guid> MenuIds
);

public record PermissionDto(
    string Code,
    string Name,
    string Module,
    string Description
);

public record MenuItemDto(
    Guid Id,
    string Code,
    string Title,
    string Path,
    string Icon,
    string GroupName,
    int SortOrder,
    Guid? ParentId,
    string? RequiredPermission,
    bool IsVisible,
    string? Description,
    IReadOnlyList<string> AssignedRoles,
    IReadOnlyList<Guid> AssignedRoleIds
);

public record CreateOrUpdateMenuRequest(
    string Code,
    string Title,
    string Path,
    string Icon,
    string GroupName,
    int SortOrder,
    string? RequiredPermission,
    bool IsVisible,
    string? Description,
    List<Guid> RoleIds
);

public record DashboardSummaryDto(
    int TotalUsers,
    int ActiveUsers,
    int TotalRoles,
    int TotalMenus,
    int TotalProducts,
    decimal TotalInventoryValue,
    IReadOnlyList<RoleDistributionDto> RoleDistribution,
    IReadOnlyList<AuditLogDto> RecentActivities
);

public record RoleDistributionDto(
    string RoleName,
    string DisplayName,
    string BadgeColor,
    int UserCount
);

public record AuditLogDto(
    Guid Id,
    string UserName,
    string Action,
    string Module,
    string? EntityId,
    string Details,
    string? IpAddress,
    DateTime Timestamp
);
