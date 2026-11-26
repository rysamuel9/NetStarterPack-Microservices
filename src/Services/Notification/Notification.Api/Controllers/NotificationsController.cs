using Asp.Versioning;
using BuildingBlocks.Core.Constants;
using BuildingBlocks.Core.Contracts;
using BuildingBlocks.Infrastructure.Controllers;
using BuildingBlocks.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Notification.Api.Application.DTOs;
using Notification.Api.Application.Interfaces;

namespace Notification.Api.Controllers;

[Authorize]
public class NotificationsController(INotificationService notificationService) : BaseApiController
{
    [HttpGet]
    public async Task<IActionResult> GetMyNotifications(
        [FromQuery] string? category = null,
        [FromQuery] bool unreadOnly = false,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken cancellationToken = default) =>
        ToActionResult(await notificationService.GetMyNotificationsAsync(category, unreadOnly, page, pageSize, cancellationToken));

    [HttpGet("bell")]
    public async Task<IActionResult> GetBellSummary(
        [FromQuery] int limit = 10,
        CancellationToken cancellationToken = default) =>
        ToActionResult(await notificationService.GetBellSummaryAsync(limit, cancellationToken));

    [HttpPost("{id:guid}/read")]
    public async Task<IActionResult> MarkAsRead(Guid id, CancellationToken cancellationToken) =>
        ToActionResult(await notificationService.MarkAsReadAsync(id, cancellationToken));

    [HttpPost("read-all")]
    public async Task<IActionResult> MarkAllAsRead(
        [FromQuery] string? category = null,
        CancellationToken cancellationToken = default) =>
        ToActionResult(await notificationService.MarkAllAsReadAsync(category, cancellationToken));

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteNotification(Guid id, CancellationToken cancellationToken) =>
        ToActionResult(await notificationService.DeleteMyNotificationAsync(id, cancellationToken));

    [HttpGet("preferences")]
    public async Task<IActionResult> GetMyPreferences(CancellationToken cancellationToken) =>
        ToActionResult(await notificationService.GetMyPreferencesAsync(cancellationToken));

    [HttpPut("preferences")]
    public async Task<IActionResult> UpdateMyPreferences(
        [FromBody] UpdateNotificationPreferencesRequest request,
        CancellationToken cancellationToken) =>
        ToActionResult(await notificationService.UpdateMyPreferencesAsync(request, cancellationToken));

    [HttpGet("devices")]
    public async Task<IActionResult> GetMyDevices(CancellationToken cancellationToken) =>
        ToActionResult(await notificationService.GetMyDevicesAsync(cancellationToken));

    [HttpPost("devices")]
    public async Task<IActionResult> RegisterDevice(
        [FromBody] RegisterPushDeviceRequest request,
        CancellationToken cancellationToken) =>
        ToActionResult(await notificationService.RegisterDeviceAsync(request, cancellationToken));

    [HttpPost("devices/unregister")]
    public async Task<IActionResult> UnregisterDevice(
        [FromBody] UnregisterPushDeviceRequest request,
        CancellationToken cancellationToken) =>
        ToActionResult(await notificationService.UnregisterDeviceAsync(request.PushToken, cancellationToken));

    [HttpDelete("devices/{id:guid}")]
    public async Task<IActionResult> RemoveDeviceById(Guid id, CancellationToken cancellationToken) =>
        ToActionResult(await notificationService.RemoveDeviceByIdAsync(id, cancellationToken));

    [HttpPost("test-push")]
    public async Task<IActionResult> SendTestPush(
        [FromBody] SendTestPushRequest? request,
        CancellationToken cancellationToken) =>
        ToActionResult(await notificationService.SendTestPushToMeAsync(request, cancellationToken));

    // ================= ADMIN: TEMPLATE & DELIVERY MANAGEMENT =================

    [HasPermission(Permissions.Notifications.Manage)]
    [HttpGet("templates")]
    public async Task<IActionResult> GetTemplates(CancellationToken cancellationToken) =>
        ToActionResult(await notificationService.GetTemplatesAsync(cancellationToken));

    [HasPermission(Permissions.Notifications.Manage)]
    [HttpGet("templates/{code}")]
    public async Task<IActionResult> GetTemplateByCode(string code, CancellationToken cancellationToken) =>
        ToActionResult(await notificationService.GetTemplateByCodeAsync(code, cancellationToken));

    [HasPermission(Permissions.Notifications.Manage)]
    [HttpPut("templates/{code}")]
    public async Task<IActionResult> UpdateTemplate(
        string code,
        [FromBody] UpdateNotificationTemplateRequest request,
        CancellationToken cancellationToken) =>
        ToActionResult(await notificationService.UpdateTemplateAsync(code, request, cancellationToken));

    [HasPermission(Permissions.Notifications.Manage)]
    [HttpPost("templates/{code}/reset")]
    public async Task<IActionResult> ResetTemplate(string code, CancellationToken cancellationToken) =>
        ToActionResult(await notificationService.ResetTemplateToDefaultAsync(code, cancellationToken));

    [HasPermission(Permissions.Notifications.Manage)]
    [HttpPost("templates/{code}/preview")]
    public async Task<IActionResult> PreviewTemplate(
        string code,
        [FromBody] PreviewTemplateRequest? request,
        CancellationToken cancellationToken) =>
        ToActionResult(await notificationService.PreviewTemplateAsync(code, request, cancellationToken));

    [HasPermission(Permissions.Notifications.Manage)]
    [HttpPost("templates/{code}/test-email")]
    public async Task<IActionResult> SendTestEmail(
        string code,
        [FromBody] SendTestEmailRequest? request,
        CancellationToken cancellationToken) =>
        ToActionResult(await notificationService.SendTestEmailAsync(code, request, cancellationToken));

    [HasPermission(Permissions.Notifications.Manage)]
    [HttpGet("delivery-logs")]
    public async Task<IActionResult> GetDeliveryLogs(
        [FromQuery] string? channel = null,
        [FromQuery] string? status = null,
        [FromQuery] int limit = 100,
        CancellationToken cancellationToken = default) =>
        ToActionResult(await notificationService.GetDeliveryLogsAsync(channel, status, limit, cancellationToken));

    [HasPermission(Permissions.Notifications.Manage)]
    [HttpPost("delivery-logs/{id:guid}/retry")]
    public async Task<IActionResult> RetryDelivery(Guid id, CancellationToken cancellationToken) =>
        ToActionResult(await notificationService.RetryDeliveryAsync(id, cancellationToken));

    [HasPermission(Permissions.Notifications.Manage)]
    [HttpGet("provider-status")]
    public async Task<IActionResult> GetProviderStatus(CancellationToken cancellationToken) =>
        ToActionResult(await notificationService.GetProviderStatusAsync(cancellationToken));

    [HasPermission(Permissions.Notifications.Manage)]
    [HttpGet("stats")]
    public async Task<IActionResult> GetStats(CancellationToken cancellationToken) =>
        ToActionResult(await notificationService.GetStatsAsync(cancellationToken));
}

/// <summary>
/// Endpoint internal Service-to-Service untuk menerima NotificationIntegrationEvent dari microservice lain
/// (Workflow.Api, Order.Api, Tracking.Api, Announcement.Api, dll). Diamankan header X-Internal-Api-Key.
/// </summary>
[ApiController]
[ApiVersionNeutral]
[Route("api/internal/events")]
public class InternalNotificationEventsController(INotificationService notificationService) : BaseApiController
{
    [AllowAnonymous]
    [RequireInternalApiKey]
    [HttpPost("notification")]
    public async Task<IActionResult> ReceiveNotification(
        [FromBody] NotificationIntegrationEvent integrationEvent,
        CancellationToken cancellationToken) =>
        ToActionResult(await notificationService.IngestEventAsync(integrationEvent, cancellationToken));
}
