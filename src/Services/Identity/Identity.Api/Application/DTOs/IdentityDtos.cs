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
    DateTime? LastLoginAt,
    string? EmployeeCode = null,
    Guid? DirectorateId = null,
    string? DirectorateName = null,
    Guid? DivisionId = null,
    string? DivisionName = null,
    Guid? DepartmentId = null,
    string? DepartmentName = null,
    Guid? PositionId = null,
    string? PositionName = null,
    int? PositionLevel = null,
    Guid? ManagerUserId = null,
    string? ManagerFullName = null
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
    DateTime? LastLoginAt,
    string? EmployeeCode = null,
    Guid? DirectorateId = null,
    string? DirectorateName = null,
    Guid? DivisionId = null,
    string? DivisionName = null,
    Guid? DepartmentId = null,
    string? DepartmentName = null,
    Guid? PositionId = null,
    string? PositionName = null,
    int? PositionLevel = null,
    Guid? ManagerUserId = null,
    string? ManagerFullName = null
);

public record CreateUserRequest(
    string Username,
    string Email,
    string FullName,
    string Password,
    string? PhoneNumber,
    string? Department,
    string Status,
    List<string> Roles,
    string? EmployeeCode = null,
    Guid? DirectorateId = null,
    Guid? DivisionId = null,
    Guid? DepartmentId = null,
    Guid? PositionId = null,
    Guid? ManagerUserId = null
);

public record UpdateUserRequest(
    string Email,
    string FullName,
    string? PhoneNumber,
    string? Department,
    string Status,
    string? NewPassword,
    List<string> Roles,
    string? EmployeeCode = null,
    Guid? DirectorateId = null,
    Guid? DivisionId = null,
    Guid? DepartmentId = null,
    Guid? PositionId = null,
    Guid? ManagerUserId = null
);

// === Organization Master DTOs (Directorate -> Division -> Department + Position) ===
public record DirectorateDto(
    Guid Id,
    string Code,
    string Name,
    string Description,
    Guid? HeadUserId,
    string? HeadUsername,
    string? HeadFullName,
    string? HeadPositionName,
    bool IsActive,
    int DivisionCount,
    int UserCount
);

public record CreateOrUpdateDirectorateRequest(
    string Code,
    string Name,
    string? Description,
    Guid? HeadUserId,
    bool IsActive = true
);

public record DivisionDto(
    Guid Id,
    Guid DirectorateId,
    string DirectorateName,
    string Code,
    string Name,
    string Description,
    Guid? HeadUserId,
    string? HeadUsername,
    string? HeadFullName,
    bool IsActive,
    int DepartmentCount,
    int UserCount
);

public record CreateOrUpdateDivisionRequest(
    Guid DirectorateId,
    string Code,
    string Name,
    string? Description,
    Guid? HeadUserId,
    bool IsActive = true
);

public record DepartmentDto(
    Guid Id,
    Guid DivisionId,
    string DivisionName,
    Guid DirectorateId,
    string DirectorateName,
    string Code,
    string Name,
    string Description,
    Guid? HeadUserId,
    string? HeadUsername,
    string? HeadFullName,
    bool IsActive,
    int UserCount
);

public record CreateOrUpdateDepartmentRequest(
    Guid DivisionId,
    string Code,
    string Name,
    string? Description,
    Guid? HeadUserId,
    bool IsActive = true
);

public record PositionDto(
    Guid Id,
    string Code,
    string Name,
    int Level,
    string Description,
    bool IsActive,
    int UserCount
);

public record CreateOrUpdatePositionRequest(
    string Code,
    string Name,
    int Level,
    string? Description,
    bool IsActive = true
);

public record OrgMemberSummaryDto(
    Guid Id,
    string? EmployeeCode,
    string Username,
    string FullName,
    string? PositionName,
    int? PositionLevel,
    IReadOnlyList<string> Roles
);

public record DepartmentTreeNodeDto(
    Guid Id,
    string Code,
    string Name,
    string Description,
    Guid? HeadUserId,
    string? HeadFullName,
    int UserCount,
    IReadOnlyList<OrgMemberSummaryDto> Members
);

public record DivisionTreeNodeDto(
    Guid Id,
    string Code,
    string Name,
    string Description,
    Guid? HeadUserId,
    string? HeadFullName,
    int UserCount,
    IReadOnlyList<DepartmentTreeNodeDto> Departments
);

public record DirectorateTreeNodeDto(
    Guid Id,
    string Code,
    string Name,
    string Description,
    Guid? HeadUserId,
    string? HeadUsername,
    string? HeadFullName,
    string? HeadPositionName,
    int UserCount,
    IReadOnlyList<DivisionTreeNodeDto> Divisions
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
