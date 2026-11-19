namespace Workflow.Api.Application.DTOs;

public record FormFieldDefinitionDto(
    string Key,
    string Label,
    string Type,       // text | textarea | number | currency | date | select
    bool Required,
    string? Placeholder = null,
    List<string>? Options = null
);

public record ApprovalFlowStepDefinitionDto(
    int StepOrder,
    string StepName,
    string ApproverRole,
    string Description
);

public record FormTemplateDto(
    Guid Id,
    string Code,
    string Name,
    string Category,
    string Icon,
    string Description,
    IReadOnlyList<FormFieldDefinitionDto> Fields,
    IReadOnlyList<ApprovalFlowStepDefinitionDto> ApprovalFlow,
    bool IsActive
);

public record CreateOrUpdateFormTemplateRequest(
    string Code,
    string Name,
    string Category,
    string Icon,
    string Description,
    List<FormFieldDefinitionDto> Fields,
    List<ApprovalFlowStepDefinitionDto> ApprovalFlow,
    bool IsActive = true
);

public record CreateWorkflowRequestDto(
    string TemplateCode,
    string Title,
    Dictionary<string, string> FormData,
    bool SubmitImmediately = true
);

public record UpdateAndResubmitWorkflowRequestDto(
    string Title,
    Dictionary<string, string> FormData,
    string? ResubmitNotes = null
);

public record ApprovalActionRequestDto(
    string? Comment
);

public record WorkflowApprovalStepDto(
    Guid Id,
    int StepOrder,
    string StepName,
    string ApproverRole,
    string Description,
    string Status,
    string? ActionByUsername,
    string? ActionByFullName,
    string? Comment,
    DateTime? ActionAt
);

public record WorkflowHistoryLogDto(
    Guid Id,
    string Action,
    string ActorUsername,
    string ActorFullName,
    string ActorRole,
    string FromStatus,
    string ToStatus,
    string Notes,
    DateTime Timestamp
);

public record WorkflowRequestDto(
    Guid Id,
    string RequestNumber,
    Guid FormTemplateId,
    string TemplateCode,
    string TemplateName,
    string TemplateCategory,
    string Title,
    Dictionary<string, string> FormData,
    IReadOnlyList<FormFieldDefinitionDto> TemplateFields,
    Guid RequesterUserId,
    string RequesterUsername,
    string RequesterFullName,
    string Status,
    int CurrentStepOrder,
    int TotalSteps,
    string? CurrentApproverRole,
    DateTime CreatedAt,
    DateTime? SubmittedAt,
    DateTime? CompletedAt,
    IReadOnlyList<WorkflowApprovalStepDto> ApprovalSteps,
    IReadOnlyList<WorkflowHistoryLogDto> HistoryLogs
);
