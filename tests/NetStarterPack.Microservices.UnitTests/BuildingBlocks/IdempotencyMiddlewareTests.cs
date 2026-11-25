using System.Reflection;
using System.Security.Claims;
using System.Text;
using Announcement.Api.Controllers;
using BuildingBlocks.Core.Attributes;
using BuildingBlocks.Infrastructure.Middleware;
using Catalog.Api.Controllers;
using Identity.Api.Controllers;
using MasterData.Api.Controllers;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using NetStarterPack.Microservices.UnitTests.Common.Factories;
using Order.Api.Controllers;
using Workflow.Api.Controllers;

namespace NetStarterPack.Microservices.UnitTests.BuildingBlocks;

public class IdempotencyMiddlewareTests
{
    private static DefaultHttpContext CreateHttpContext(
        string method,
        string path,
        string? jsonBody = null,
        string? idempotencyKey = null,
        string? userId = "user-1",
        IdempotentAttribute? attribute = null)
    {
        var context = new DefaultHttpContext();
        context.Request.Method = method;
        context.Request.Path = path;
        context.Response.Body = new MemoryStream();

        if (jsonBody is not null)
        {
            var bytes = Encoding.UTF8.GetBytes(jsonBody);
            context.Request.Body = new MemoryStream(bytes);
            context.Request.ContentType = "application/json";
            context.Request.ContentLength = bytes.Length;
        }

        if (idempotencyKey is not null)
        {
            context.Request.Headers[IdempotencyHeaders.Key] = idempotencyKey;
        }

        if (userId is not null)
        {
            var claims = new[] { new Claim(ClaimTypes.NameIdentifier, userId) };
            context.User = new ClaimsPrincipal(new ClaimsIdentity(claims, "TestAuth"));
        }

        if (attribute is not null)
        {
            var endpoint = new Endpoint(
                _ => Task.CompletedTask,
                new EndpointMetadataCollection(attribute),
                "TestEndpoint");
            context.SetEndpoint(endpoint);
        }

        return context;
    }

    private static async Task<string> ReadResponseBodyAsync(HttpContext context)
    {
        context.Response.Body.Position = 0;
        using var reader = new StreamReader(context.Response.Body, Encoding.UTF8, leaveOpen: true);
        return await reader.ReadToEndAsync();
    }

    [Fact]
    public async Task InvokeAsync_WithSameKeyAndSamePayload_ShouldReplayCachedResponseWithoutReExecutingHandler()
    {
        var cache = TestCacheFactory.CreateInMemory();
        var executionCount = 0;

        var middleware = new IdempotencyMiddleware(
            next: async ctx =>
            {
                executionCount++;
                ctx.Response.StatusCode = StatusCodes.Status201Created;
                ctx.Response.ContentType = "application/json; charset=utf-8";
                await ctx.Response.WriteAsync($"{{\"execution\":{executionCount},\"succeeded\":true}}");
            },
            cacheService: cache,
            idempotencyOptions: Options.Create(new IdempotencySettings()),
            logger: NullLogger<IdempotencyMiddleware>.Instance,
            serviceScope: "Order.Api");

        var body = "{\"customerName\":\"Budi\",\"quantity\":2}";
        var key = Guid.NewGuid().ToString("D");

        var firstContext = CreateHttpContext("POST", "/api/orders", body, key, "user-1", new IdempotentAttribute());
        await middleware.InvokeAsync(firstContext);
        var firstBody = await ReadResponseBodyAsync(firstContext);

        var secondContext = CreateHttpContext("POST", "/api/orders", body, key, "user-1", new IdempotentAttribute());
        await middleware.InvokeAsync(secondContext);
        var secondBody = await ReadResponseBodyAsync(secondContext);

        Assert.Equal(1, executionCount);
        Assert.Equal(StatusCodes.Status201Created, firstContext.Response.StatusCode);
        Assert.Equal(StatusCodes.Status201Created, secondContext.Response.StatusCode);
        Assert.Equal(firstBody, secondBody);
        Assert.Equal(key, firstContext.Response.Headers[IdempotencyHeaders.Key].ToString());
        Assert.False(firstContext.Response.Headers.ContainsKey(IdempotencyHeaders.Replayed));
        Assert.Equal("true", secondContext.Response.Headers[IdempotencyHeaders.Replayed].ToString());
    }

    [Fact]
    public async Task InvokeAsync_WithSameKeyAndDifferentPayload_ShouldReturn422UnprocessableEntity()
    {
        var cache = TestCacheFactory.CreateInMemory();
        var executionCount = 0;

        var middleware = new IdempotencyMiddleware(
            next: async ctx =>
            {
                executionCount++;
                ctx.Response.StatusCode = StatusCodes.Status201Created;
                await ctx.Response.WriteAsync("{\"succeeded\":true}");
            },
            cacheService: cache,
            idempotencyOptions: Options.Create(new IdempotencySettings()),
            logger: NullLogger<IdempotencyMiddleware>.Instance,
            serviceScope: "Catalog.Api");

        var key = "same-key-diff-payload";
        var firstContext = CreateHttpContext("POST", "/api/products", "{\"name\":\"Laptop\"}", key, "user-1", new IdempotentAttribute());
        await middleware.InvokeAsync(firstContext);

        var secondContext = CreateHttpContext("POST", "/api/products", "{\"name\":\"Mouse\"}", key, "user-1", new IdempotentAttribute());
        await middleware.InvokeAsync(secondContext);

        Assert.Equal(1, executionCount);
        Assert.Equal(StatusCodes.Status422UnprocessableEntity, secondContext.Response.StatusCode);
    }

    [Fact]
    public async Task InvokeAsync_WithConcurrentDuplicateRequests_ShouldRejectSecondWith409Conflict()
    {
        var cache = TestCacheFactory.CreateInMemory();
        var handlerStarted = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var allowHandlerToFinish = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var executionCount = 0;

        var middleware = new IdempotencyMiddleware(
            next: async ctx =>
            {
                Interlocked.Increment(ref executionCount);
                handlerStarted.TrySetResult();
                await allowHandlerToFinish.Task;
                ctx.Response.StatusCode = StatusCodes.Status200OK;
                await ctx.Response.WriteAsync("{\"succeeded\":true}");
            },
            cacheService: cache,
            idempotencyOptions: Options.Create(new IdempotencySettings()),
            logger: NullLogger<IdempotencyMiddleware>.Instance,
            serviceScope: "Workflow.Api");

        var key = "concurrent-approve-key";
        var body = "{\"notes\":\"Approved\"}";
        var firstContext = CreateHttpContext("POST", "/api/workflows/123/approve", body, key, "manager-1", new IdempotentAttribute());
        var secondContext = CreateHttpContext("POST", "/api/workflows/123/approve", body, key, "manager-1", new IdempotentAttribute());

        var firstTask = middleware.InvokeAsync(firstContext);
        await handlerStarted.Task;

        await middleware.InvokeAsync(secondContext);
        Assert.Equal(StatusCodes.Status409Conflict, secondContext.Response.StatusCode);

        allowHandlerToFinish.TrySetResult();
        await firstTask;

        Assert.Equal(1, executionCount);
        Assert.Equal(StatusCodes.Status200OK, firstContext.Response.StatusCode);
    }

    [Fact]
    public async Task InvokeAsync_WhenFirstRequestReturns400OrThrows_ShouldCleanLockAndAllowRetry()
    {
        var cache = TestCacheFactory.CreateInMemory();
        var attempt = 0;

        var middleware = new IdempotencyMiddleware(
            next: async ctx =>
            {
                attempt++;
                if (attempt == 1)
                {
                    ctx.Response.StatusCode = StatusCodes.Status400BadRequest;
                    await ctx.Response.WriteAsync("{\"succeeded\":false}");
                    return;
                }

                if (attempt == 2)
                {
                    throw new InvalidOperationException("Simulated transient DB failure");
                }

                ctx.Response.StatusCode = StatusCodes.Status201Created;
                await ctx.Response.WriteAsync("{\"succeeded\":true,\"attempt\":3}");
            },
            cacheService: cache,
            idempotencyOptions: Options.Create(new IdempotencySettings()),
            logger: NullLogger<IdempotencyMiddleware>.Instance,
            serviceScope: "Order.Api");

        var key = "retry-after-failure";
        var body = "{\"customerName\":\"Andi\"}";

        var ctx1 = CreateHttpContext("POST", "/api/orders", body, key, "user-1", new IdempotentAttribute());
        await middleware.InvokeAsync(ctx1);
        Assert.Equal(StatusCodes.Status400BadRequest, ctx1.Response.StatusCode);

        var ctx2 = CreateHttpContext("POST", "/api/orders", body, key, "user-1", new IdempotentAttribute());
        await Assert.ThrowsAsync<InvalidOperationException>(() => middleware.InvokeAsync(ctx2));

        var ctx3 = CreateHttpContext("POST", "/api/orders", body, key, "user-1", new IdempotentAttribute());
        await middleware.InvokeAsync(ctx3);
        Assert.Equal(StatusCodes.Status201Created, ctx3.Response.StatusCode);
        Assert.Equal(3, attempt);
    }

    [Fact]
    public async Task InvokeAsync_WhenRequireKeyIsTrueAndHeaderMissing_ShouldReturn400BadRequest()
    {
        var cache = TestCacheFactory.CreateInMemory();
        var executed = false;

        var middleware = new IdempotencyMiddleware(
            next: _ =>
            {
                executed = true;
                return Task.CompletedTask;
            },
            cacheService: cache,
            idempotencyOptions: Options.Create(new IdempotencySettings()),
            logger: NullLogger<IdempotencyMiddleware>.Instance);

        var context = CreateHttpContext("POST", "/api/orders", "{}", idempotencyKey: null, "user-1", new IdempotentAttribute { RequireKey = true });
        await middleware.InvokeAsync(context);

        Assert.False(executed);
        Assert.Equal(StatusCodes.Status400BadRequest, context.Response.StatusCode);
    }

    [Fact]
    public async Task InvokeAsync_WhenHeaderMissingAndRequireKeyIsFalse_ShouldPassThroughWithoutCaching()
    {
        var cache = TestCacheFactory.CreateInMemory();
        var executionCount = 0;

        var middleware = new IdempotencyMiddleware(
            next: ctx =>
            {
                executionCount++;
                ctx.Response.StatusCode = StatusCodes.Status201Created;
                return Task.CompletedTask;
            },
            cacheService: cache,
            idempotencyOptions: Options.Create(new IdempotencySettings()),
            logger: NullLogger<IdempotencyMiddleware>.Instance);

        await middleware.InvokeAsync(CreateHttpContext("POST", "/api/orders", "{}", idempotencyKey: null, "user-1", new IdempotentAttribute()));
        await middleware.InvokeAsync(CreateHttpContext("POST", "/api/orders", "{}", idempotencyKey: null, "user-1", new IdempotentAttribute()));

        Assert.Equal(2, executionCount);
    }

    [Fact]
    public async Task InvokeAsync_WhenDifferentUsersUseSameKey_ShouldIsolateResponsesPerUser()
    {
        var cache = TestCacheFactory.CreateInMemory();
        var executionCount = 0;

        var middleware = new IdempotencyMiddleware(
            next: async ctx =>
            {
                executionCount++;
                var userId = ctx.User.FindFirstValue(ClaimTypes.NameIdentifier);
                ctx.Response.StatusCode = StatusCodes.Status201Created;
                await ctx.Response.WriteAsync($"{{\"user\":\"{userId}\"}}");
            },
            cacheService: cache,
            idempotencyOptions: Options.Create(new IdempotencySettings()),
            logger: NullLogger<IdempotencyMiddleware>.Instance,
            serviceScope: "Workflow.Api");

        var sharedKey = "shared-key-123";
        var userACtx = CreateHttpContext("POST", "/api/workflows", "{}", sharedKey, "user-A", new IdempotentAttribute());
        var userBCtx = CreateHttpContext("POST", "/api/workflows", "{}", sharedKey, "user-B", new IdempotentAttribute());

        await middleware.InvokeAsync(userACtx);
        await middleware.InvokeAsync(userBCtx);

        Assert.Equal(2, executionCount);
        Assert.Contains("user-A", await ReadResponseBodyAsync(userACtx));
        Assert.Contains("user-B", await ReadResponseBodyAsync(userBCtx));
    }

    [Fact]
    public async Task InvokeAsync_WhenKeyExceedsMaxLength_ShouldReturn400BadRequest()
    {
        var cache = TestCacheFactory.CreateInMemory();
        var executed = false;

        var middleware = new IdempotencyMiddleware(
            next: _ =>
            {
                executed = true;
                return Task.CompletedTask;
            },
            cacheService: cache,
            idempotencyOptions: Options.Create(new IdempotencySettings { MaxKeyLength = 32 }),
            logger: NullLogger<IdempotencyMiddleware>.Instance);

        var oversizedKey = new string('x', 40);
        var context = CreateHttpContext("POST", "/api/orders", "{}", oversizedKey, "user-1", new IdempotentAttribute());
        await middleware.InvokeAsync(context);

        Assert.False(executed);
        Assert.Equal(StatusCodes.Status400BadRequest, context.Response.StatusCode);
    }

    [Fact]
    public async Task InvokeAsync_WhenEndpointHasNoIdempotentAttribute_ShouldPassThroughEvenWithHeader()
    {
        var cache = TestCacheFactory.CreateInMemory();
        var executionCount = 0;

        var middleware = new IdempotencyMiddleware(
            next: ctx =>
            {
                executionCount++;
                ctx.Response.StatusCode = StatusCodes.Status200OK;
                return Task.CompletedTask;
            },
            cacheService: cache,
            idempotencyOptions: Options.Create(new IdempotencySettings()),
            logger: NullLogger<IdempotencyMiddleware>.Instance);

        var key = "non-idempotent-endpoint-key";
        await middleware.InvokeAsync(CreateHttpContext("POST", "/api/auth/login", "{}", key, "user-1", attribute: null));
        await middleware.InvokeAsync(CreateHttpContext("POST", "/api/auth/login", "{}", key, "user-1", attribute: null));

        Assert.Equal(2, executionCount);
    }

    [Fact]
    public void CriticalMutatingControllerEndpoints_AcrossAllMicroservices_ShouldHaveIdempotentAttribute()
    {
        var expectedIdempotentActions = new (Type Controller, string MethodName)[]
        {
            // Workflow.Api
            (typeof(WorkflowsController), nameof(WorkflowsController.CreateTemplate)),
            (typeof(WorkflowsController), nameof(WorkflowsController.Create)),
            (typeof(WorkflowsController), nameof(WorkflowsController.Resubmit)),
            (typeof(WorkflowsController), nameof(WorkflowsController.Approve)),
            (typeof(WorkflowsController), nameof(WorkflowsController.RequestRevision)),
            (typeof(WorkflowsController), nameof(WorkflowsController.Reject)),
            // Order.Api
            (typeof(OrdersController), nameof(OrdersController.Create)),
            (typeof(OrdersController), nameof(OrdersController.Update)),
            // Catalog.Api
            (typeof(ProductsController), nameof(ProductsController.Create)),
            (typeof(ProductsController), nameof(ProductsController.Update)),
            // Announcement.Api
            (typeof(AnnouncementsController), nameof(AnnouncementsController.Create)),
            (typeof(AnnouncementsController), nameof(AnnouncementsController.Update)),
            (typeof(AnnouncementsController), nameof(AnnouncementsController.AddComment)),
            // Identity.Api
            (typeof(UsersController), nameof(UsersController.Create)),
            (typeof(RolesController), nameof(RolesController.Create)),
            (typeof(MenusController), nameof(MenusController.Create)),
            (typeof(OrganizationsController), nameof(OrganizationsController.CreateDirectorate)),
            (typeof(OrganizationsController), nameof(OrganizationsController.CreateDivision)),
            (typeof(OrganizationsController), nameof(OrganizationsController.CreateDepartment)),
            (typeof(OrganizationsController), nameof(OrganizationsController.CreatePosition)),
            // MasterData.Api
            (typeof(LookupsController), nameof(LookupsController.Create)),
            (typeof(LookupsController), nameof(LookupsController.Update)),
            (typeof(LookupsController), nameof(LookupsController.ToggleStatus)),
        };

        foreach (var (controller, methodName) in expectedIdempotentActions)
        {
            var method = controller.GetMethod(methodName);
            Assert.NotNull(method);
            Assert.NotNull(method!.GetCustomAttribute<IdempotentAttribute>());
        }

        // Auth & Toggle endpoints sengaja TIDAK dipasang [Idempotent]
        Assert.Null(typeof(AuthController).GetMethod(nameof(AuthController.Login))!.GetCustomAttribute<IdempotentAttribute>());
        Assert.Null(typeof(AuthController).GetMethod(nameof(AuthController.Refresh))!.GetCustomAttribute<IdempotentAttribute>());
        Assert.Null(typeof(AnnouncementsController).GetMethod(nameof(AnnouncementsController.ToggleLike))!.GetCustomAttribute<IdempotentAttribute>());
    }
}
