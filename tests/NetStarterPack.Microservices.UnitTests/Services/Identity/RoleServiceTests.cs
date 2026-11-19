using BuildingBlocks.Core.Constants;
using Identity.Api.Application.DTOs;
using Identity.Api.Application.Services;
using NetStarterPack.Microservices.UnitTests.Common.Factories;
using NetStarterPack.Microservices.UnitTests.Common.TestDoubles;

namespace NetStarterPack.Microservices.UnitTests.Services.Identity;

public class RoleServiceTests
{
    [Fact]
    public async Task CreateAndDeleteCustomRole_ShouldPersistInvalidateCache_AndRejectDuplicate()
    {
        using var ctx = await TestDbFactory.CreateIdentityAsync();
        var cache = TestCacheFactory.CreateInMemory();
        var service = new RoleService(ctx.Uow, new FakeCurrentUserService(), cache);

        var before = await service.GetAllRolesAsync();
        var initialCount = before.Data!.Count;

        var created = await service.CreateRoleAsync(new CreateOrUpdateRoleRequest(
            Name: "Auditor",
            DisplayName: "Internal Auditor",
            Description: "Read-only audit access",
            BadgeColor: "emerald",
            Permissions: [Permissions.Dashboard.View, Permissions.AuditLogs.View],
            MenuIds: []));

        Assert.True(created.Succeeded);
        Assert.Equal(201, created.StatusCode);
        Assert.False(created.Data!.IsSystemRole);
        Assert.Equal(2, created.Data.Permissions.Count);

        // Cache roles harus ter-invalidate sehingga list terbaru bertambah 1
        var afterCreate = await service.GetAllRolesAsync();
        Assert.Equal(initialCount + 1, afterCreate.Data!.Count);

        // Duplicate nama role harus ditolak (409)
        var duplicate = await service.CreateRoleAsync(new CreateOrUpdateRoleRequest(
            Name: "auditor",
            DisplayName: "Duplikat",
            Description: "Duplikat",
            BadgeColor: "slate",
            Permissions: [],
            MenuIds: []));
        Assert.False(duplicate.Succeeded);
        Assert.Equal(409, duplicate.StatusCode);

        // Custom role boleh dihapus
        var deleted = await service.DeleteRoleAsync(created.Data.Id);
        Assert.True(deleted.Succeeded);
    }

    [Fact]
    public async Task DeleteRole_SystemRole_ShouldReturn400()
    {
        using var ctx = await TestDbFactory.CreateIdentityAsync();
        var service = new RoleService(ctx.Uow, new FakeCurrentUserService(), TestCacheFactory.CreateInMemory());

        var roles = (await service.GetAllRolesAsync()).Data!;
        var superAdminRole = roles.Single(r => r.Name == RoleNames.SuperAdmin);

        var result = await service.DeleteRoleAsync(superAdminRole.Id);

        Assert.False(result.Succeeded);
        Assert.Equal(400, result.StatusCode);
    }
}
