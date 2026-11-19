using System.Security.Claims;
using BuildingBlocks.Core.Constants;
using BuildingBlocks.Security;
using Microsoft.AspNetCore.Authorization;

namespace NetStarterPack.Microservices.UnitTests.BuildingBlocks;

public class PermissionAuthorizationHandlerTests
{
    [Fact]
    public async Task HandleAsync_UnauthenticatedUser_ShouldNotSucceed()
    {
        var handler = new PermissionAuthorizationHandler();
        var requirement = new PermissionRequirement(Permissions.Products.View);
        var user = new ClaimsPrincipal(new ClaimsIdentity()); // tidak terautentikasi
        var context = new AuthorizationHandlerContext([requirement], user, null);

        await handler.HandleAsync(context);

        Assert.False(context.HasSucceeded);
    }

    [Fact]
    public async Task HandleAsync_SuperAdminRole_ShouldBypassAndAlwaysSucceed()
    {
        var handler = new PermissionAuthorizationHandler();
        var requirement = new PermissionRequirement(Permissions.Products.Delete);
        var identity = new ClaimsIdentity([new Claim(ClaimTypes.Role, RoleNames.SuperAdmin)], "Bearer");
        var context = new AuthorizationHandlerContext([requirement], new ClaimsPrincipal(identity), null);

        await handler.HandleAsync(context);

        Assert.True(context.HasSucceeded);
    }

    [Fact]
    public async Task HandleAsync_UserWithMatchingPermissionClaim_ShouldSucceedCaseInsensitive()
    {
        var handler = new PermissionAuthorizationHandler();
        var requirement = new PermissionRequirement(Permissions.Products.Create);
        var identity = new ClaimsIdentity(
        [
            new Claim(ClaimTypes.Role, RoleNames.Staff),
            new Claim("permission", Permissions.Products.Create.ToUpperInvariant())
        ], "Bearer");
        var context = new AuthorizationHandlerContext([requirement], new ClaimsPrincipal(identity), null);

        await handler.HandleAsync(context);

        Assert.True(context.HasSucceeded);
    }

    [Fact]
    public async Task HandleAsync_UserWithoutRequiredPermission_ShouldFail()
    {
        var handler = new PermissionAuthorizationHandler();
        var requirement = new PermissionRequirement(Permissions.Users.Delete);
        var identity = new ClaimsIdentity(
        [
            new Claim(ClaimTypes.Role, RoleNames.Staff),
            new Claim("permission", Permissions.Products.View)
        ], "Bearer");
        var context = new AuthorizationHandlerContext([requirement], new ClaimsPrincipal(identity), null);

        await handler.HandleAsync(context);

        Assert.False(context.HasSucceeded);
    }
}
