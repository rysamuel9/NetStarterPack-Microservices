using BuildingBlocks.Core.Common;

namespace Identity.Api.Domain.Entities;

public enum UserStatus
{
    Active = 1,
    Inactive = 2,
    Suspended = 3
}

public class User : BaseEntity
{
    public string Username { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string? EmployeeCode { get; set; }
    public string? PhoneNumber { get; set; }
    public string? Department { get; set; }
    public string? AvatarUrl { get; set; }
    public UserStatus Status { get; set; } = UserStatus.Active;
    public DateTime? LastLoginAt { get; set; }

    // Profil Organisasi Terstruktur (Direktorat -> Divisi -> Departemen + Posisi + Atasan)
    public Guid? DirectorateId { get; set; }
    public Directorate? Directorate { get; set; }

    public Guid? DivisionId { get; set; }
    public Division? Division { get; set; }

    public Guid? DepartmentId { get; set; }
    public Department? DepartmentEntity { get; set; }

    public Guid? PositionId { get; set; }
    public Position? Position { get; set; }

    public Guid? ManagerUserId { get; set; }
    public User? Manager { get; set; }

    public ICollection<UserRole> UserRoles { get; set; } = new List<UserRole>();
    public ICollection<RefreshToken> RefreshTokens { get; set; } = new List<RefreshToken>();
}

/// <summary>Master Direktorat (puncak hierarki, misal Direktorat Finance, Technology, Human Capital, Operations).</summary>
public class Directorate : BaseEntity
{
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public Guid? HeadUserId { get; set; }
    public bool IsActive { get; set; } = true;

    public ICollection<Division> Divisions { get; set; } = new List<Division>();
    public ICollection<User> Users { get; set; } = new List<User>();
}

/// <summary>Master Divisi (turunan dari Direktorat, misal Divisi Accounting dan Treasury di bawah Direktorat Finance).</summary>
public class Division : BaseEntity
{
    public Guid DirectorateId { get; set; }
    public Directorate Directorate { get; set; } = null!;

    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public Guid? HeadUserId { get; set; }
    public bool IsActive { get; set; } = true;

    public ICollection<Department> Departments { get; set; } = new List<Department>();
    public ICollection<User> Users { get; set; } = new List<User>();
}

/// <summary>Master Departemen (turunan dari Divisi, misal General Ledger, Tax, Cash Management, FP&amp;A).</summary>
public class Department : BaseEntity
{
    public Guid DivisionId { get; set; }
    public Division Division { get; set; } = null!;

    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public Guid? HeadUserId { get; set; }
    public bool IsActive { get; set; } = true;

    public ICollection<User> Users { get; set; } = new List<User>();
}

/// <summary>Master Posisi / Jabatan perusahaan beserta level hierarkinya (1 = C-Level/Director tertinggi).</summary>
public class Position : BaseEntity
{
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public int Level { get; set; } = 5;
    public string Description { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;

    public ICollection<User> Users { get; set; } = new List<User>();
}

public class Role : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string BadgeColor { get; set; } = "indigo";
    public bool IsSystemRole { get; set; } = false;

    public ICollection<UserRole> UserRoles { get; set; } = new List<UserRole>();
    public ICollection<RolePermission> RolePermissions { get; set; } = new List<RolePermission>();
    public ICollection<RoleMenu> RoleMenus { get; set; } = new List<RoleMenu>();
}

public class UserRole : BaseEntity
{
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;

    public Guid RoleId { get; set; }
    public Role Role { get; set; } = null!;
}

public class RolePermission : BaseEntity
{
    public Guid RoleId { get; set; }
    public Role Role { get; set; } = null!;

    public string PermissionCode { get; set; } = string.Empty;
}

public class RefreshToken : BaseEntity
{
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;

    public string Token { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
    public DateTime? RevokedAt { get; set; }
    public string? ReplacedByToken { get; set; }
    public string? CreatedByIp { get; set; }

    public bool IsExpired => DateTime.UtcNow >= ExpiresAt;
    public bool IsRevoked => RevokedAt != null;
    public bool IsActive => !IsRevoked && !IsExpired;
}

public class MenuItem : BaseEntity
{
    public string Code { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Path { get; set; } = string.Empty;
    public string Icon { get; set; } = "LayoutDashboard";
    public string GroupName { get; set; } = "MAIN";
    public int SortOrder { get; set; } = 1;
    public Guid? ParentId { get; set; }
    public MenuItem? Parent { get; set; }
    public ICollection<MenuItem> Children { get; set; } = new List<MenuItem>();

    public string? RequiredPermission { get; set; }
    public bool IsVisible { get; set; } = true;
    public string? Description { get; set; }

    public ICollection<RoleMenu> RoleMenus { get; set; } = new List<RoleMenu>();
}

public class RoleMenu : BaseEntity
{
    public Guid RoleId { get; set; }
    public Role Role { get; set; } = null!;

    public Guid MenuItemId { get; set; }
    public MenuItem MenuItem { get; set; } = null!;
}

public class AuditLog : BaseEntity
{
    public Guid? UserId { get; set; }
    public string UserName { get; set; } = "System";
    public string Action { get; set; } = string.Empty;
    public string Module { get; set; } = string.Empty;
    public string? EntityId { get; set; }
    public string Details { get; set; } = string.Empty;
    public string? IpAddress { get; set; }
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}
