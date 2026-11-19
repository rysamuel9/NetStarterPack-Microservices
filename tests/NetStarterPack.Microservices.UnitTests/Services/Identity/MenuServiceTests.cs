using BuildingBlocks.Core.Constants;
using Identity.Api.Application.DTOs;
using Identity.Api.Application.Services;
using NetStarterPack.Microservices.UnitTests.Common.Factories;
using NetStarterPack.Microservices.UnitTests.Common.TestDoubles;

namespace NetStarterPack.Microservices.UnitTests.Services.Identity;

public class MenuServiceTests
{
    [Fact]
    public async Task GetMyMenusAsync_ShouldFilterByRoleAndPermissionForNonSuperAdmin()
    {
        using var ctx = await TestDbFactory.CreateIdentityAsync();
        var cache = TestCacheFactory.CreateInMemory();

        var superAdminMenus = await new MenuService(ctx.Uow, new FakeCurrentUserService(), cache).GetMyMenusAsync();
        Assert.True(superAdminMenus.Succeeded);
        Assert.NotEmpty(superAdminMenus.Data!);

        // Viewer tanpa permission admin tidak boleh melihat menu Users/Roles
        var viewer = FakeCurrentUserService.AsUser(
            username: "viewer",
            fullName: "Viewer User",
            roles: [RoleNames.Viewer],
            permissions: [Permissions.Dashboard.View, Permissions.Products.View]);

        var viewerMenus = await new MenuService(ctx.Uow, viewer, cache).GetMyMenusAsync();
        Assert.True(viewerMenus.Succeeded);
        Assert.True(viewerMenus.Data!.Count < superAdminMenus.Data!.Count);
        Assert.DoesNotContain(viewerMenus.Data, m => m.RequiredPermission == Permissions.Users.View);
        Assert.DoesNotContain(viewerMenus.Data, m => m.RequiredPermission == Permissions.Roles.View);
    }

    [Fact]
    public async Task CreateAndDeleteMenu_ShouldPersistAndInvalidateCache()
    {
        using var ctx = await TestDbFactory.CreateIdentityAsync();
        var cache = TestCacheFactory.CreateInMemory();
        var service = new MenuService(ctx.Uow, new FakeCurrentUserService(), cache);

        var before = (await service.GetAllMenusAsync()).Data!.Count;

        var created = await service.CreateMenuAsync(new CreateOrUpdateMenuRequest(
            Code: "reports-custom",
            Title: "Custom Reports",
            Path: "/reports/custom",
            Icon: "BarChart3",
            GroupName: "ANALYTICS",
            SortOrder: 99,
            RequiredPermission: Permissions.Dashboard.View,
            IsVisible: true,
            Description: "Menu laporan tambahan",
            RoleIds: []));

        Assert.True(created.Succeeded);
        Assert.Equal(201, created.StatusCode);

        var afterCreate = (await service.GetAllMenusAsync()).Data!.Count;
        Assert.Equal(before + 1, afterCreate);

        var deleted = await service.DeleteMenuAsync(created.Data!.Id);
        Assert.True(deleted.Succeeded);
    }
}
