using BuildingBlocks.Core.Constants;
using BuildingBlocks.Core.Interfaces;
using AppPermissions = BuildingBlocks.Core.Constants.Permissions;

namespace NetStarterPack.Microservices.UnitTests.Common.TestDoubles;

/// <summary>
/// Test double untuk ICurrentUserService — menyimulasikan klaim JWT user aktif di RAM
/// tanpa perlu membuat HTTP request nyata.
/// </summary>
public sealed class FakeCurrentUserService : ICurrentUserService
{
    public Guid? UserId { get; set; } = Guid.NewGuid();
    public string? Username { get; set; } = "superadmin";
    public string? FullName { get; set; } = "Budi Santoso (Super Admin)";
    public IReadOnlyList<string> Roles { get; set; } = [RoleNames.SuperAdmin];
    public IReadOnlyList<string> Permissions { get; set; } =
        AppPermissions.GetAll().Select(p => p.Code).ToList();
    public string? IpAddress { get; set; } = "127.0.0.1";
    public string CorrelationId { get; set; } = "test-correlation-id-001";

    public static FakeCurrentUserService AsUser(
        string username,
        string fullName,
        IReadOnlyList<string> roles,
        IReadOnlyList<string>? permissions = null,
        Guid? userId = null) =>
        new()
        {
            UserId = userId ?? Guid.NewGuid(),
            Username = username,
            FullName = fullName,
            Roles = roles,
            Permissions = permissions ?? []
        };

    public void SwitchTo(
        Guid userId,
        string username,
        string fullName,
        IReadOnlyList<string> roles,
        IReadOnlyList<string>? permissions = null)
    {
        UserId = userId;
        Username = username;
        FullName = fullName;
        Roles = roles;
        if (permissions is not null)
        {
            Permissions = permissions;
        }
    }
}
