using Asp.Versioning;
using BuildingBlocks.Core.Attributes;
using BuildingBlocks.Core.Common;
using BuildingBlocks.Core.Constants;
using BuildingBlocks.Core.Contracts;
using BuildingBlocks.Infrastructure.Controllers;
using BuildingBlocks.Security;
using Identity.Api.Application.DTOs;
using Identity.Api.Application.Interfaces;
using Identity.Api.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace Identity.Api.Controllers;

public class AuthController(IAuthService authService, IAvatarService avatarService) : BaseApiController
{
    [Authorize]
    [HttpPost("avatar")]
    [RequestSizeLimit(AvatarService.MaxFileSizeBytes + 1024 * 1024)]
    public async Task<IActionResult> UploadAvatar(IFormFile? file, CancellationToken cancellationToken)
    {
        if (file is null)
        {
            return BadRequest(Result.Failure("File foto wajib diisi (field 'file').", 400));
        }

        await using var stream = file.OpenReadStream();
        return ToActionResult(await avatarService.UploadAsync(stream, file.Length, file.FileName, cancellationToken));
    }

    [Authorize]
    [HttpDelete("avatar")]
    public async Task<IActionResult> RemoveAvatar(CancellationToken cancellationToken) =>
        ToActionResult(await avatarService.RemoveAsync(cancellationToken));

    // Anonymous supaya bisa dipakai langsung di <img src>. Isinya cuma foto profil, ID-nya GUID.
    [AllowAnonymous]
    [HttpGet("avatar/{userId:guid}")]
    public async Task<IActionResult> GetAvatar(Guid userId, CancellationToken cancellationToken)
    {
        var avatar = await avatarService.GetAvatarAsync(userId, cancellationToken);
        if (avatar is null) return NotFound();

        Response.RegisterForDisposeAsync(avatar);
        Response.Headers.CacheControl = "public,max-age=86400";
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        return File(avatar.Content, avatar.ContentType);
    }

    [AllowAnonymous]
    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request, CancellationToken cancellationToken) =>
        ToActionResult(await authService.LoginAsync(request, cancellationToken));

    [AllowAnonymous]
    [HttpPost("refresh")]
    public async Task<IActionResult> Refresh([FromBody] RefreshTokenRequest request, CancellationToken cancellationToken) =>
        ToActionResult(await authService.RefreshTokenAsync(request, cancellationToken));

    [Authorize]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout([FromBody] RefreshTokenRequest? request, CancellationToken cancellationToken) =>
        ToActionResult(await authService.LogoutAsync(request?.RefreshToken, cancellationToken));

    [Authorize]
    [HttpPost("logout-all")]
    public async Task<IActionResult> LogoutAllDevices(CancellationToken cancellationToken) =>
        ToActionResult(await authService.LogoutAllDevicesAsync(cancellationToken));

    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> Me(CancellationToken cancellationToken) =>
        ToActionResult(await authService.GetCurrentUserAsync(cancellationToken));

    [Authorize]
    [HttpPut("profile")]
    public async Task<IActionResult> UpdateProfile([FromBody] UpdateProfileRequest request, CancellationToken cancellationToken) =>
        ToActionResult(await authService.UpdateProfileAsync(request, cancellationToken));

    [Authorize]
    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request, CancellationToken cancellationToken) =>
        ToActionResult(await authService.ChangePasswordAsync(request, cancellationToken));
}

[Authorize]
public class UsersController(IUserService userService) : BaseApiController
{
    [HasPermission(Permissions.Users.View)]
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? search,
        [FromQuery] string? role,
        CancellationToken cancellationToken) =>
        ToActionResult(await userService.GetAllUsersAsync(search, role, cancellationToken));

    [HasPermission(Permissions.Users.View)]
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken cancellationToken) =>
        ToActionResult(await userService.GetUserByIdAsync(id, cancellationToken));

    [HasPermission(Permissions.Users.Create)]
    [HttpPost]
    [Idempotent]
    public async Task<IActionResult> Create([FromBody] CreateUserRequest request, CancellationToken cancellationToken) =>
        ToActionResult(await userService.CreateUserAsync(request, cancellationToken));

    [HasPermission(Permissions.Users.Edit)]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateUserRequest request, CancellationToken cancellationToken) =>
        ToActionResult(await userService.UpdateUserAsync(id, request, cancellationToken));

    [HasPermission(Permissions.Users.Delete)]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken) =>
        ToActionResult(await userService.DeleteUserAsync(id, cancellationToken));
}

[Authorize]
public class RolesController(IRoleService roleService) : BaseApiController
{
    [HttpGet]
    public async Task<IActionResult> GetAll(CancellationToken cancellationToken) =>
        ToActionResult(await roleService.GetAllRolesAsync(cancellationToken));

    [HttpGet("permissions")]
    public async Task<IActionResult> GetAllPermissions(CancellationToken cancellationToken) =>
        ToActionResult(await roleService.GetAllPermissionsAsync(cancellationToken));

    [HasPermission(Permissions.Roles.Manage)]
    [HttpPost]
    [Idempotent]
    public async Task<IActionResult> Create([FromBody] CreateOrUpdateRoleRequest request, CancellationToken cancellationToken) =>
        ToActionResult(await roleService.CreateRoleAsync(request, cancellationToken));

    [HasPermission(Permissions.Roles.Manage)]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] CreateOrUpdateRoleRequest request, CancellationToken cancellationToken) =>
        ToActionResult(await roleService.UpdateRoleAsync(id, request, cancellationToken));

    [HasPermission(Permissions.Roles.Manage)]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken) =>
        ToActionResult(await roleService.DeleteRoleAsync(id, cancellationToken));
}

[Authorize]
public class MenusController(IMenuService menuService) : BaseApiController
{
    [HttpGet("my-menus")]
    public async Task<IActionResult> GetMyMenus(CancellationToken cancellationToken) =>
        ToActionResult(await menuService.GetMyMenusAsync(cancellationToken));

    [HasPermission(Permissions.Menus.View)]
    [HttpGet]
    public async Task<IActionResult> GetAll(CancellationToken cancellationToken) =>
        ToActionResult(await menuService.GetAllMenusAsync(cancellationToken));

    [HasPermission(Permissions.Menus.Manage)]
    [HttpPost]
    [Idempotent]
    public async Task<IActionResult> Create([FromBody] CreateOrUpdateMenuRequest request, CancellationToken cancellationToken) =>
        ToActionResult(await menuService.CreateMenuAsync(request, cancellationToken));

    [HasPermission(Permissions.Menus.Manage)]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] CreateOrUpdateMenuRequest request, CancellationToken cancellationToken) =>
        ToActionResult(await menuService.UpdateMenuAsync(id, request, cancellationToken));

    [HasPermission(Permissions.Menus.Manage)]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken) =>
        ToActionResult(await menuService.DeleteMenuAsync(id, cancellationToken));
}

[Authorize]
public class DashboardController(IDashboardService dashboardService) : BaseApiController
{
    [HasPermission(Permissions.Dashboard.View)]
    [HttpGet("summary")]
    public async Task<IActionResult> GetSummary(CancellationToken cancellationToken) =>
        ToActionResult(await dashboardService.GetSummaryAsync(cancellationToken));

    [HasPermission(Permissions.AuditLogs.View)]
    [HttpGet("audit-logs")]
    public async Task<IActionResult> GetAuditLogs([FromQuery] int limit = 100, CancellationToken cancellationToken = default) =>
        ToActionResult(await dashboardService.GetAuditLogsAsync(limit, cancellationToken));
}

/// <summary>
/// Endpoint internal antar-microservice (Service-to-Service) untuk menerima event Audit Log dari Catalog.Api / service lainnya.
/// Diamankan dengan header X-Internal-Api-Key.
/// </summary>
[ApiController]
[ApiVersionNeutral]
[Route("api/internal/events")]
public class InternalEventsController(
    IDashboardService dashboardService,
    IOptions<JwtSettings> jwtOptions) : BaseApiController
{
    private readonly JwtSettings _jwtSettings = jwtOptions.Value;

    [AllowAnonymous]
    [HttpPost("audit-log")]
    public async Task<IActionResult> ReceiveAuditLog(
        [FromBody] AuditLogIntegrationEvent integrationEvent,
        CancellationToken cancellationToken)
    {
        var apiKey = Request.Headers["X-Internal-Api-Key"].FirstOrDefault();
        if (!string.Equals(apiKey, _jwtSettings.InternalApiKey, StringComparison.Ordinal))
        {
            return Unauthorized(Result.Failure("Invalid X-Internal-Api-Key for inter-service communication.", 401));
        }

        return ToActionResult(await dashboardService.RecordIntegrationAuditLogAsync(integrationEvent, cancellationToken));
    }
}
