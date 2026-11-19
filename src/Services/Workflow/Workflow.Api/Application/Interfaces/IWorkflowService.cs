using BuildingBlocks.Core.Common;
using BuildingBlocks.Core.Contracts;
using Workflow.Api.Application.DTOs;

namespace Workflow.Api.Application.Interfaces;

public interface IWorkflowService
{
    // Dynamic Form Templates
    Task<Result<IReadOnlyList<FormTemplateDto>>> GetFormTemplatesAsync(bool activeOnly = true, CancellationToken cancellationToken = default);
    Task<Result<FormTemplateDto>> CreateFormTemplateAsync(CreateOrUpdateFormTemplateRequest request, CancellationToken cancellationToken = default);

    // Create / Draft / Resubmit
    Task<Result<WorkflowRequestDto>> CreateRequestAsync(CreateWorkflowRequestDto request, CancellationToken cancellationToken = default);
    Task<Result<WorkflowRequestDto>> ResubmitRequestAsync(Guid id, UpdateAndResubmitWorkflowRequestDto request, CancellationToken cancellationToken = default);

    // Working List (Inbox Approval) & Tracking List
    Task<Result<IReadOnlyList<WorkflowRequestDto>>> GetWorkingListAsync(CancellationToken cancellationToken = default);
    Task<Result<IReadOnlyList<WorkflowRequestDto>>> GetTrackingListAsync(string? scope = null, string? status = null, string? templateCode = null, string? search = null, CancellationToken cancellationToken = default);
    Task<Result<WorkflowRequestDto>> GetRequestByIdAsync(Guid id, CancellationToken cancellationToken = default);

    // Approval State-Machine Actions (Zero-Trust Role & Anti-Self-Approval Guard)
    Task<Result<WorkflowRequestDto>> ApproveAsync(Guid id, ApprovalActionRequestDto actionRequest, CancellationToken cancellationToken = default);
    Task<Result<WorkflowRequestDto>> RequestRevisionAsync(Guid id, ApprovalActionRequestDto actionRequest, CancellationToken cancellationToken = default);
    Task<Result<WorkflowRequestDto>> RejectAsync(Guid id, ApprovalActionRequestDto actionRequest, CancellationToken cancellationToken = default);

    // Aggregator Stats
    Task<Result<WorkflowStatsDto>> GetWorkflowStatsAsync(CancellationToken cancellationToken = default);
}
