using BuildingBlocks.Core.Attributes;
using BuildingBlocks.Core.Constants;
using BuildingBlocks.Infrastructure.Controllers;
using BuildingBlocks.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Workflow.Api.Application.DTOs;
using Workflow.Api.Application.Interfaces;

namespace Workflow.Api.Controllers;

public class WorkflowsController : BaseApiController
{
    private readonly IWorkflowService _workflowService;

    public WorkflowsController(IWorkflowService workflowService)
    {
        _workflowService = workflowService;
    }

    /// <summary>Mengambil daftar template formulir dinamis (beserta field schema dan alur approval).</summary>
    [HttpGet("templates")]
    [Authorize]
    public async Task<IActionResult> GetTemplates([FromQuery] bool activeOnly = true, CancellationToken cancellationToken = default)
        => ToActionResult(await _workflowService.GetFormTemplatesAsync(activeOnly, cancellationToken));

    /// <summary>Membuat template formulir dinamis baru (khusus Admin / SuperAdmin).</summary>
    [HttpPost("templates")]
    [HasPermission(Permissions.Workflows.ManageTemplates)]
    [Idempotent]
    public async Task<IActionResult> CreateTemplate([FromBody] CreateOrUpdateFormTemplateRequest request, CancellationToken cancellationToken = default)
        => ToActionResult(await _workflowService.CreateFormTemplateAsync(request, cancellationToken));

    /// <summary>
    /// Working List (Approval Inbox): menampilkan daftar pengajuan yang saat ini sedang menunggu
    /// persetujuan di step role milik user yang sedang login.
    /// </summary>
    [HttpGet("working-list")]
    [HasPermission(Permissions.Workflows.Approve)]
    public async Task<IActionResult> GetWorkingList(CancellationToken cancellationToken = default)
        => ToActionResult(await _workflowService.GetWorkingListAsync(cancellationToken));

    /// <summary>
    /// Tracking List: menampilkan progres semua pengajuan atau pengajuan milik sendiri lengkap dengan
    /// posisi approver saat ini (stepper) dan log riwayatnya.
    /// </summary>
    [HttpGet("tracking")]
    [HasPermission(Permissions.Workflows.View)]
    public async Task<IActionResult> GetTrackingList(
        [FromQuery] string? scope = null,
        [FromQuery] string? status = null,
        [FromQuery] string? templateCode = null,
        [FromQuery] string? search = null,
        CancellationToken cancellationToken = default)
        => ToActionResult(await _workflowService.GetTrackingListAsync(scope, status, templateCode, search, cancellationToken));

    /// <summary>Ringkasan statistik workflow untuk Dashboard Aggregator (membutuhkan JWT atau X-Internal-Api-Key).</summary>
    [HttpGet("stats")]
    [AllowAnonymous]
    [RequireAuthenticatedOrInternalApiKey]
    public async Task<IActionResult> GetStats(CancellationToken cancellationToken = default)
        => ToActionResult(await _workflowService.GetWorkflowStatsAsync(cancellationToken));

    /// <summary>Mengambil detail satu pengajuan lengkap dengan isi form dinamis, daftar approver, dan history log.</summary>
    [HttpGet("{id:guid}")]
    [HasPermission(Permissions.Workflows.View)]
    public async Task<IActionResult> GetById(Guid id, CancellationToken cancellationToken = default)
        => ToActionResult(await _workflowService.GetRequestByIdAsync(id, cancellationToken));

    /// <summary>Membuat pengajuan form baru (Save as Draft atau langsung Submit ke approver step 1).</summary>
    [HttpPost]
    [HasPermission(Permissions.Workflows.Create)]
    [Idempotent]
    public async Task<IActionResult> Create([FromBody] CreateWorkflowRequestDto request, CancellationToken cancellationToken = default)
        => ToActionResult(await _workflowService.CreateRequestAsync(request, cancellationToken));

    /// <summary>Edit dan Submit ulang pengajuan yang berstatus Draft atau RevisionRequested (khusus pembuatnya).</summary>
    [HttpPut("{id:guid}/resubmit")]
    [HasPermission(Permissions.Workflows.Create)]
    [Idempotent]
    public async Task<IActionResult> Resubmit(Guid id, [FromBody] UpdateAndResubmitWorkflowRequestDto request, CancellationToken cancellationToken = default)
        => ToActionResult(await _workflowService.ResubmitRequestAsync(id, request, cancellationToken));

    /// <summary>Menyetujui step approval yang sedang aktif (wajib sesuai role aktif dan bukan pengajuan milik sendiri).</summary>
    [HttpPost("{id:guid}/approve")]
    [HasPermission(Permissions.Workflows.Approve)]
    [Idempotent]
    public async Task<IActionResult> Approve(Guid id, [FromBody] ApprovalActionRequestDto request, CancellationToken cancellationToken = default)
        => ToActionResult(await _workflowService.ApproveAsync(id, request, cancellationToken));

    /// <summary>Mengembalikan pengajuan ke pembuat form untuk direvisi (catatan revisi wajib diisi).</summary>
    [HttpPost("{id:guid}/request-revision")]
    [HasPermission(Permissions.Workflows.Approve)]
    [Idempotent]
    public async Task<IActionResult> RequestRevision(Guid id, [FromBody] ApprovalActionRequestDto request, CancellationToken cancellationToken = default)
        => ToActionResult(await _workflowService.RequestRevisionAsync(id, request, cancellationToken));

    /// <summary>Menolak pengajuan secara final (alasan penolakan wajib diisi).</summary>
    [HttpPost("{id:guid}/reject")]
    [HasPermission(Permissions.Workflows.Approve)]
    [Idempotent]
    public async Task<IActionResult> Reject(Guid id, [FromBody] ApprovalActionRequestDto request, CancellationToken cancellationToken = default)
        => ToActionResult(await _workflowService.RejectAsync(id, request, cancellationToken));
}
