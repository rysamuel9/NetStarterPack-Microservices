using BuildingBlocks.Core.Constants;
using Identity.Api.Application.DTOs;
using Identity.Api.Application.Services;
using NetStarterPack.Microservices.UnitTests.Common.Factories;
using NetStarterPack.Microservices.UnitTests.Common.TestDoubles;

namespace NetStarterPack.Microservices.UnitTests.Services.Identity;

public class UserServiceTests
{
    [Fact]
    public async Task CreateUser_ShouldPersistNormalizeFields_AndRejectDuplicateUsernameOrEmail()
    {
        using var ctx = await TestDbFactory.CreateIdentityAsync();
        var service = new UserService(ctx.Uow, ctx.Hasher, new FakeCurrentUserService(), TestCacheFactory.CreateInMemory());

        var created = await service.CreateUserAsync(new CreateUserRequest(
            Username: "  Dev.Test  ",
            Email: "  DEV.TEST@company.id ",
            FullName: "Developer Test",
            Password: "Password123!",
            PhoneNumber: "08123456789",
            Department: "Engineering",
            Status: "Active",
            Roles: [RoleNames.Staff],
            EmployeeCode: "emp-9001"));

        Assert.True(created.Succeeded);
        Assert.Equal(201, created.StatusCode);
        Assert.Equal("dev.test", created.Data!.Username);
        Assert.Equal("dev.test@company.id", created.Data.Email);
        Assert.Equal("EMP-9001", created.Data.EmployeeCode);
        Assert.Contains(RoleNames.Staff, created.Data.Roles);

        var duplicate = await service.CreateUserAsync(new CreateUserRequest(
            Username: "dev.test",
            Email: "other@company.id",
            FullName: "Duplikat",
            Password: "Password123!",
            PhoneNumber: null,
            Department: null,
            Status: "Active",
            Roles: [RoleNames.Staff]));

        Assert.False(duplicate.Succeeded);
        Assert.Equal(409, duplicate.StatusCode);
    }

    [Fact]
    public async Task DeleteUser_ShouldBlockDeletingSuperAdmin_AndBlockSelfDeletion()
    {
        using var ctx = await TestDbFactory.CreateIdentityAsync();
        var superAdmin = await ctx.Uow.Users.FirstOrDefaultAsync(u => u.Username == "superadmin");
        var staff = await ctx.Uow.Users.FirstOrDefaultAsync(u => u.Username == "staff");
        Assert.NotNull(superAdmin);
        Assert.NotNull(staff);

        var currentUser = new FakeCurrentUserService { UserId = staff!.Id, Username = staff.Username };
        var service = new UserService(ctx.Uow, ctx.Hasher, currentUser, TestCacheFactory.CreateInMemory());

        var deleteSuperAdmin = await service.DeleteUserAsync(superAdmin!.Id);
        Assert.False(deleteSuperAdmin.Succeeded);
        Assert.Equal(400, deleteSuperAdmin.StatusCode);

        var deleteSelf = await service.DeleteUserAsync(staff.Id);
        Assert.False(deleteSelf.Succeeded);
        Assert.Equal(400, deleteSelf.StatusCode);
    }

    [Fact]
    public async Task UpdateUser_ShouldBlockDeactivatingSuperAdmin()
    {
        using var ctx = await TestDbFactory.CreateIdentityAsync();
        var superAdmin = await ctx.Uow.Users.FirstOrDefaultAsync(u => u.Username == "superadmin");
        Assert.NotNull(superAdmin);

        var service = new UserService(ctx.Uow, ctx.Hasher, new FakeCurrentUserService(), TestCacheFactory.CreateInMemory());

        var result = await service.UpdateUserAsync(superAdmin!.Id, new UpdateUserRequest(
            Email: superAdmin.Email,
            FullName: superAdmin.FullName,
            PhoneNumber: superAdmin.PhoneNumber,
            Department: superAdmin.Department,
            Status: "Inactive",
            NewPassword: null,
            Roles: [RoleNames.SuperAdmin]));

        Assert.False(result.Succeeded);
        Assert.Equal(400, result.StatusCode);
    }
}
