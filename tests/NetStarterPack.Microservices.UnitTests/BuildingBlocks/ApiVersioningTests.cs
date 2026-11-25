using System.Reflection;
using Announcement.Api.Controllers;
using Asp.Versioning;
using BuildingBlocks.Infrastructure.Controllers;
using Catalog.Api.Controllers;
using Identity.Api.Controllers;
using MasterData.Api.Controllers;
using Microsoft.AspNetCore.Mvc;
using Order.Api.Controllers;
using Workflow.Api.Controllers;

namespace NetStarterPack.Microservices.UnitTests.BuildingBlocks;

public class ApiVersioningTests
{
    [Fact]
    public void BaseApiController_ShouldDeclareApiVersion1_AndBothVersionedAndLegacyRoutes()
    {
        var apiVersions = typeof(BaseApiController)
            .GetCustomAttributes<ApiVersionAttribute>(inherit: false)
            .SelectMany(a => a.Versions)
            .ToList();

        Assert.Contains(new ApiVersion(1, 0), apiVersions);

        var routes = typeof(BaseApiController)
            .GetCustomAttributes<RouteAttribute>(inherit: false)
            .Select(r => r.Template)
            .ToList();

        Assert.Contains("api/v{version:apiVersion}/[controller]", routes);
        Assert.Contains("api/[controller]", routes);
    }

    [Fact]
    public void AllPublicBusinessControllers_ShouldInheritVersionedBaseApiControllerWithoutBreakingRouteOverride()
    {
        var controllers = new[]
        {
            typeof(AuthController),
            typeof(UsersController),
            typeof(RolesController),
            typeof(MenusController),
            typeof(DashboardController),
            typeof(OrganizationsController),
            typeof(ProductsController),
            typeof(OrdersController),
            typeof(WorkflowsController),
            typeof(AnnouncementsController),
            typeof(LookupsController),
        };

        foreach (var controller in controllers)
        {
            Assert.True(typeof(BaseApiController).IsAssignableFrom(controller), $"{controller.Name} harus mewarisi BaseApiController.");

            // Pastikan controller tidak menimpa [Route(...)] dengan template non-versioned saja
            var directRoutes = controller.GetCustomAttributes<RouteAttribute>(inherit: false).ToList();
            Assert.Empty(directRoutes);
        }
    }

    [Fact]
    public void InternalEventsController_ShouldBeMarkedApiVersionNeutral()
    {
        var neutralAttr = typeof(InternalEventsController)
            .GetCustomAttribute<ApiVersionNeutralAttribute>(inherit: false);

        Assert.NotNull(neutralAttr);
    }
}
