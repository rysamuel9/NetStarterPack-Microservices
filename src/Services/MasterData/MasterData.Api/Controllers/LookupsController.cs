using BuildingBlocks.Core.Attributes;
using BuildingBlocks.Core.Constants;
using BuildingBlocks.Infrastructure.Controllers;
using BuildingBlocks.Security;
using MasterData.Api.Application.DTOs;
using MasterData.Api.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MasterData.Api.Controllers;

[Authorize]
public class LookupsController(ILookupService lookupService) : BaseApiController
{
    /// <summary>Mengambil daftar seluruh GroupCode yang tersedia beserta jumlah item aktif/sistem.</summary>
    [HttpGet("groups")]
    public async Task<IActionResult> GetGroups(CancellationToken cancellationToken) =>
        ToActionResult(await lookupService.GetGroupsAsync(cancellationToken));

    /// <summary>
    /// Mengambil daftar lookup berdasarkan GroupCode, status aktif, ParentId (cascading), dan pencarian.
    /// Cukup [Authorize] agar semua user yang login dapat memuat dropdown di form microservice mana pun.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? groupCode = null,
        [FromQuery] bool activeOnly = false,
        [FromQuery] Guid? parentId = null,
        [FromQuery] string? search = null,
        CancellationToken cancellationToken = default) =>
        ToActionResult(await lookupService.GetLookupsAsync(groupCode, activeOnly, parentId, search, cancellationToken));

    /// <summary>
    /// Mengambil banyak grup lookup sekaligus dalam 1 HTTP request (misal ?groups=PRODUCT_CATEGORY,UNIT_OF_MEASURE).
    /// </summary>
    [HttpGet("batch")]
    public async Task<IActionResult> GetBatch(
        [FromQuery] string groups,
        [FromQuery] bool activeOnly = true,
        CancellationToken cancellationToken = default)
    {
        var groupList = string.IsNullOrWhiteSpace(groups)
            ? []
            : groups.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        return ToActionResult(await lookupService.GetBatchLookupsAsync(groupList, activeOnly, cancellationToken));
    }

    /// <summary>Ringkasan statistik MasterData Microservice untuk Dashboard / Health Aggregator.</summary>
    [AllowAnonymous]
    [HttpGet("stats")]
    public async Task<IActionResult> GetStats(CancellationToken cancellationToken) =>
        ToActionResult(await lookupService.GetStatsAsync(cancellationToken));

    /// <summary>Mengambil detail satu item Master Lookup berdasarkan ID.</summary>
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken cancellationToken) =>
        ToActionResult(await lookupService.GetByIdAsync(id, cancellationToken));

    /// <summary>Menambahkan item Master Data / Lookup baru ke grup yang sudah ada atau grup baru.</summary>
    [HasPermission(Permissions.Lookups.Manage)]
    [HttpPost]
    [Idempotent]
    public async Task<IActionResult> Create(
        [FromBody] CreateOrUpdateLookupRequest request,
        CancellationToken cancellationToken) =>
        ToActionResult(await lookupService.CreateAsync(request, cancellationToken));

    /// <summary>Memperbarui item Master Data / Lookup.</summary>
    [HasPermission(Permissions.Lookups.Manage)]
    [HttpPut("{id:guid}")]
    [Idempotent]
    public async Task<IActionResult> Update(
        Guid id,
        [FromBody] CreateOrUpdateLookupRequest request,
        CancellationToken cancellationToken) =>
        ToActionResult(await lookupService.UpdateAsync(id, request, cancellationToken));

    /// <summary>Mengaktifkan atau menonaktifkan item Master Data tanpa menghapus data historis.</summary>
    [HasPermission(Permissions.Lookups.Manage)]
    [HttpPatch("{id:guid}/status")]
    [Idempotent]
    public async Task<IActionResult> ToggleStatus(
        Guid id,
        [FromBody] ToggleLookupStatusRequest request,
        CancellationToken cancellationToken) =>
        ToActionResult(await lookupService.ToggleStatusAsync(id, request.IsActive, cancellationToken));

    /// <summary>Menghapus (soft-delete) item Master Data non-sistem yang tidak memiliki child.</summary>
    [HasPermission(Permissions.Lookups.Manage)]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken) =>
        ToActionResult(await lookupService.DeleteAsync(id, cancellationToken));
}
