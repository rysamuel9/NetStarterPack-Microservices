using BuildingBlocks.Core.Constants;
using BuildingBlocks.Infrastructure.Controllers;
using BuildingBlocks.Security;
using Identity.Api.Application.DTOs;
using Identity.Api.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Identity.Api.Controllers;

[Authorize]
[Route("api/[controller]")]
public class OrganizationsController(IOrganizationService organizationService) : BaseApiController
{
    /// <summary>Mengambil struktur pohon lengkap organisasi (Direktorat -> Divisi -> Departemen + Bos &amp; Anggota).</summary>
    [HttpGet("tree")]
    [HasPermission(Permissions.Organization.View)]
    public async Task<IActionResult> GetTree(CancellationToken ct) =>
        ToActionResult(await organizationService.GetOrganizationTreeAsync(ct));

    // === Directorates ===
    [HttpGet("directorates")]
    [Authorize]
    public async Task<IActionResult> GetDirectorates(CancellationToken ct) =>
        ToActionResult(await organizationService.GetDirectoratesAsync(ct));

    [HttpPost("directorates")]
    [HasPermission(Permissions.Organization.Manage)]
    public async Task<IActionResult> CreateDirectorate([FromBody] CreateOrUpdateDirectorateRequest request, CancellationToken ct) =>
        ToActionResult(await organizationService.CreateDirectorateAsync(request, ct));

    [HttpPut("directorates/{id:guid}")]
    [HasPermission(Permissions.Organization.Manage)]
    public async Task<IActionResult> UpdateDirectorate(Guid id, [FromBody] CreateOrUpdateDirectorateRequest request, CancellationToken ct) =>
        ToActionResult(await organizationService.UpdateDirectorateAsync(id, request, ct));

    [HttpDelete("directorates/{id:guid}")]
    [HasPermission(Permissions.Organization.Manage)]
    public async Task<IActionResult> DeleteDirectorate(Guid id, CancellationToken ct) =>
        ToActionResult(await organizationService.DeleteDirectorateAsync(id, ct));

    // === Divisions ===
    [HttpGet("divisions")]
    [Authorize]
    public async Task<IActionResult> GetDivisions([FromQuery] Guid? directorateId, CancellationToken ct) =>
        ToActionResult(await organizationService.GetDivisionsAsync(directorateId, ct));

    [HttpPost("divisions")]
    [HasPermission(Permissions.Organization.Manage)]
    public async Task<IActionResult> CreateDivision([FromBody] CreateOrUpdateDivisionRequest request, CancellationToken ct) =>
        ToActionResult(await organizationService.CreateDivisionAsync(request, ct));

    [HttpPut("divisions/{id:guid}")]
    [HasPermission(Permissions.Organization.Manage)]
    public async Task<IActionResult> UpdateDivision(Guid id, [FromBody] CreateOrUpdateDivisionRequest request, CancellationToken ct) =>
        ToActionResult(await organizationService.UpdateDivisionAsync(id, request, ct));

    [HttpDelete("divisions/{id:guid}")]
    [HasPermission(Permissions.Organization.Manage)]
    public async Task<IActionResult> DeleteDivision(Guid id, CancellationToken ct) =>
        ToActionResult(await organizationService.DeleteDivisionAsync(id, ct));

    // === Departments ===
    [HttpGet("departments")]
    [Authorize]
    public async Task<IActionResult> GetDepartments([FromQuery] Guid? divisionId, CancellationToken ct) =>
        ToActionResult(await organizationService.GetDepartmentsAsync(divisionId, ct));

    [HttpPost("departments")]
    [HasPermission(Permissions.Organization.Manage)]
    public async Task<IActionResult> CreateDepartment([FromBody] CreateOrUpdateDepartmentRequest request, CancellationToken ct) =>
        ToActionResult(await organizationService.CreateDepartmentAsync(request, ct));

    [HttpPut("departments/{id:guid}")]
    [HasPermission(Permissions.Organization.Manage)]
    public async Task<IActionResult> UpdateDepartment(Guid id, [FromBody] CreateOrUpdateDepartmentRequest request, CancellationToken ct) =>
        ToActionResult(await organizationService.UpdateDepartmentAsync(id, request, ct));

    [HttpDelete("departments/{id:guid}")]
    [HasPermission(Permissions.Organization.Manage)]
    public async Task<IActionResult> DeleteDepartment(Guid id, CancellationToken ct) =>
        ToActionResult(await organizationService.DeleteDepartmentAsync(id, ct));

    // === Positions ===
    [HttpGet("positions")]
    [Authorize]
    public async Task<IActionResult> GetPositions(CancellationToken ct) =>
        ToActionResult(await organizationService.GetPositionsAsync(ct));

    [HttpPost("positions")]
    [HasPermission(Permissions.Organization.Manage)]
    public async Task<IActionResult> CreatePosition([FromBody] CreateOrUpdatePositionRequest request, CancellationToken ct) =>
        ToActionResult(await organizationService.CreatePositionAsync(request, ct));

    [HttpPut("positions/{id:guid}")]
    [HasPermission(Permissions.Organization.Manage)]
    public async Task<IActionResult> UpdatePosition(Guid id, [FromBody] CreateOrUpdatePositionRequest request, CancellationToken ct) =>
        ToActionResult(await organizationService.UpdatePositionAsync(id, request, ct));

    [HttpDelete("positions/{id:guid}")]
    [HasPermission(Permissions.Organization.Manage)]
    public async Task<IActionResult> DeletePosition(Guid id, CancellationToken ct) =>
        ToActionResult(await organizationService.DeletePositionAsync(id, ct));
}
