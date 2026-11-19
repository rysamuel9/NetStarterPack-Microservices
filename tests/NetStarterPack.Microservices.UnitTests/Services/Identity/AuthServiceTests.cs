using BuildingBlocks.Core.Constants;
using Identity.Api.Application.DTOs;
using Identity.Api.Application.Services;
using NetStarterPack.Microservices.UnitTests.Common.Factories;
using NetStarterPack.Microservices.UnitTests.Common.TestDoubles;

namespace NetStarterPack.Microservices.UnitTests.Services.Identity;

public class AuthServiceTests
{
    [Fact]
    public async Task Login_And_RefreshTokenRotation_ShouldIssueNewTokenAndRevokeOldToken()
    {
        using var ctx = await TestDbFactory.CreateIdentityAsync();
        var authService = new AuthService(ctx.Uow, ctx.Jwt, ctx.Hasher, new FakeCurrentUserService(), TestCacheFactory.CreateInMemory());

        var loginResult = await authService.LoginAsync(new LoginRequest("superadmin", "Password123!"));

        Assert.True(loginResult.Succeeded);
        Assert.NotNull(loginResult.Data);
        Assert.False(string.IsNullOrWhiteSpace(loginResult.Data!.AccessToken));
        Assert.Contains(RoleNames.SuperAdmin, loginResult.Data.User.Roles);

        var oldRefreshToken = loginResult.Data.RefreshToken;
        var refreshResult = await authService.RefreshTokenAsync(new RefreshTokenRequest(oldRefreshToken));

        Assert.True(refreshResult.Succeeded);
        Assert.NotEqual(oldRefreshToken, refreshResult.Data!.RefreshToken);

        // Reuse token lama yang sudah dirotasi harus ditolak (401)
        var replayResult = await authService.RefreshTokenAsync(new RefreshTokenRequest(oldRefreshToken));
        Assert.False(replayResult.Succeeded);
        Assert.Equal(401, replayResult.StatusCode);
    }

    [Fact]
    public async Task Login_WithInvalidPassword_ShouldReturn401()
    {
        using var ctx = await TestDbFactory.CreateIdentityAsync();
        var authService = new AuthService(ctx.Uow, ctx.Jwt, ctx.Hasher, new FakeCurrentUserService(), TestCacheFactory.CreateInMemory());

        var result = await authService.LoginAsync(new LoginRequest("superadmin", "WrongPassword!"));

        Assert.False(result.Succeeded);
        Assert.Equal(401, result.StatusCode);
    }

    [Fact]
    public async Task Login_AsCfoAngelica_ShouldIncludeFullOrganizationProfile()
    {
        using var ctx = await TestDbFactory.CreateIdentityAsync();
        var authService = new AuthService(ctx.Uow, ctx.Jwt, ctx.Hasher, new FakeCurrentUserService(), TestCacheFactory.CreateInMemory());

        var loginRes = await authService.LoginAsync(new LoginRequest("angelica.cfo", "Password123!"));

        Assert.True(loginRes.Succeeded);
        Assert.Equal("EMP-0001", loginRes.Data!.User.EmployeeCode);
        Assert.Equal("Direktorat Finance", loginRes.Data.User.DirectorateName);
        Assert.Equal("Chief Financial Officer (CFO)", loginRes.Data.User.PositionName);
        Assert.Equal(1, loginRes.Data.User.PositionLevel);
    }

    [Fact]
    public async Task Logout_ShouldRevokeActiveRefreshToken()
    {
        using var ctx = await TestDbFactory.CreateIdentityAsync();
        var authService = new AuthService(ctx.Uow, ctx.Jwt, ctx.Hasher, new FakeCurrentUserService(), TestCacheFactory.CreateInMemory());

        var login = await authService.LoginAsync(new LoginRequest("superadmin", "Password123!"));
        var refreshToken = login.Data!.RefreshToken;

        var logoutRes = await authService.LogoutAsync(refreshToken);
        Assert.True(logoutRes.Succeeded);

        var refreshAfterLogout = await authService.RefreshTokenAsync(new RefreshTokenRequest(refreshToken));
        Assert.False(refreshAfterLogout.Succeeded);
        Assert.Equal(401, refreshAfterLogout.StatusCode);
    }
}
