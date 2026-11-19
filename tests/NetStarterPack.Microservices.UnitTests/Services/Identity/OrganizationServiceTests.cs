using Identity.Api.Application.Services;
using NetStarterPack.Microservices.UnitTests.Common.Factories;
using NetStarterPack.Microservices.UnitTests.Common.TestDoubles;

namespace NetStarterPack.Microservices.UnitTests.Services.Identity;

public class OrganizationServiceTests
{
    [Fact]
    public async Task GetOrganizationTree_ShouldSeed4Directorates8Divisions14DepartmentsWithCfoAngelica()
    {
        using var ctx = await TestDbFactory.CreateIdentityAsync();
        var orgService = new OrganizationService(ctx.Uow, new FakeCurrentUserService(), TestCacheFactory.CreateInMemory());

        var treeRes = await orgService.GetOrganizationTreeAsync();
        Assert.True(treeRes.Succeeded);
        Assert.Equal(4, treeRes.Data!.Count);

        var financeDir = treeRes.Data.FirstOrDefault(d => d.Code == "DIR-FIN");
        Assert.NotNull(financeDir);
        Assert.Equal("angelica.cfo", financeDir!.HeadUsername);
        Assert.Contains("Angelica", financeDir.HeadFullName);
        Assert.Equal(2, financeDir.Divisions.Count);
        Assert.Contains(financeDir.Divisions, dv => dv.Code == "DIV-ACC" && dv.Departments.Count == 2);
        Assert.Contains(financeDir.Divisions, dv => dv.Code == "DIV-TRS" && dv.Departments.Count == 2);

        // Seluruh 8 Divisi punya Div Head & seluruh 14 Departemen punya Dept Head + Staff (>=3)
        var allDivs = treeRes.Data.SelectMany(d => d.Divisions).ToList();
        var allDepts = allDivs.SelectMany(dv => dv.Departments).ToList();
        Assert.Equal(8, allDivs.Count);
        Assert.Equal(14, allDepts.Count);
        Assert.All(allDivs, dv => Assert.NotNull(dv.HeadUserId));
        Assert.All(allDepts, dp =>
        {
            Assert.NotNull(dp.HeadUserId);
            Assert.True(dp.UserCount >= 3, $"Department {dp.Code} should have Dept Head + Staff (>=3), found {dp.UserCount}");
        });
    }

    [Fact]
    public async Task GetPositions_ShouldReturn10MasterPositionsOrderedByLevel()
    {
        using var ctx = await TestDbFactory.CreateIdentityAsync();
        var orgService = new OrganizationService(ctx.Uow, new FakeCurrentUserService(), TestCacheFactory.CreateInMemory());

        var posRes = await orgService.GetPositionsAsync();

        Assert.True(posRes.Succeeded);
        Assert.Equal(10, posRes.Data!.Count);
        Assert.Equal(1, posRes.Data[0].Level);
    }

    [Fact]
    public async Task DeleteDirectorate_WithActiveDivisions_ShouldReturn400()
    {
        using var ctx = await TestDbFactory.CreateIdentityAsync();
        var orgService = new OrganizationService(ctx.Uow, new FakeCurrentUserService(), TestCacheFactory.CreateInMemory());

        var tree = (await orgService.GetOrganizationTreeAsync()).Data!;
        var financeDir = tree.Single(d => d.Code == "DIR-FIN");

        var deleteBlocked = await orgService.DeleteDirectorateAsync(financeDir.Id);

        Assert.False(deleteBlocked.Succeeded);
        Assert.Equal(400, deleteBlocked.StatusCode);
    }
}
