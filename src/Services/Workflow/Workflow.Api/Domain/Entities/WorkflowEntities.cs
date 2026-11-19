using BuildingBlocks.Core.Common;

namespace Workflow.Api.Domain.Entities;

public enum WorkflowStatus
{
    Draft = 0,
    InReview = 1,
    RevisionRequested = 2,
    Approved = 3,
    Rejected = 4
}

public enum ApprovalStepStatus
{
    Waiting = 0,
    Pending = 1,
    Approved = 2,
    Rejected = 3,
    RevisionRequested = 4
}

/// <summary>
/// Definisi template formulir dinamis (Schema-Driven Form) dan blueprint alur approval per jenis dokumen.
/// Contoh: Pengadaan Laptop, Pengajuan Cuti, Pengadaan Barang Kantor.
/// </summary>
public class FormTemplate : BaseEntity
{
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string Icon { get; set; } = "FileText";
    public string Description { get; set; } = string.Empty;
    public string FieldsJson { get; set; } = "[]";
    public string ApprovalFlowJson { get; set; } = "[]";
    public bool IsActive { get; set; } = true;

    public ICollection<WorkflowRequest> Requests { get; set; } = new List<WorkflowRequest>();
}

/// <summary>
/// Instansiasi pengajuan formulir oleh karyawan beserta nilai field dinamis (FormDataJson) dan status state-machine.
/// </summary>
public class WorkflowRequest : BaseEntity
{
    public string RequestNumber { get; set; } = string.Empty;
    public Guid FormTemplateId { get; set; }
    public FormTemplate FormTemplate { get; set; } = null!;

    public string TemplateCode { get; set; } = string.Empty;
    public string TemplateName { get; set; } = string.Empty;
    public string TemplateCategory { get; set; } = string.Empty;

    public string Title { get; set; } = string.Empty;
    public string FormDataJson { get; set; } = "{}";

    public Guid RequesterUserId { get; set; }
    public string RequesterUsername { get; set; } = string.Empty;
    public string RequesterFullName { get; set; } = string.Empty;

    public WorkflowStatus Status { get; set; } = WorkflowStatus.Draft;
    public int CurrentStepOrder { get; set; } = 0;
    public int TotalSteps { get; set; } = 0;
    public string? CurrentApproverRole { get; set; }

    public DateTime? SubmittedAt { get; set; }
    public DateTime? CompletedAt { get; set; }

    public ICollection<WorkflowApprovalStep> ApprovalSteps { get; set; } = new List<WorkflowApprovalStep>();
    public ICollection<WorkflowHistoryLog> HistoryLogs { get; set; } = new List<WorkflowHistoryLog>();
}

/// <summary>
/// Tahapan approval konkret untuk sebuah WorkflowRequest (Level 1 -> Level 2 -> Level 3).
/// </summary>
public class WorkflowApprovalStep : BaseEntity
{
    public Guid WorkflowRequestId { get; set; }
    public WorkflowRequest WorkflowRequest { get; set; } = null!;

    public int StepOrder { get; set; }
    public string StepName { get; set; } = string.Empty;
    public string ApproverRole { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;

    public ApprovalStepStatus Status { get; set; } = ApprovalStepStatus.Waiting;
    public Guid? ActionByUserId { get; set; }
    public string? ActionByUsername { get; set; }
    public string? ActionByFullName { get; set; }
    public string? Comment { get; set; }
    public DateTime? ActionAt { get; set; }
}

/// <summary>
/// Riwayat immutable setiap perpindahan status dokumen untuk ditampilkan pada Tracking List.
/// </summary>
public class WorkflowHistoryLog : BaseEntity
{
    public Guid WorkflowRequestId { get; set; }
    public WorkflowRequest WorkflowRequest { get; set; } = null!;

    public string Action { get; set; } = string.Empty;
    public string ActorUsername { get; set; } = string.Empty;
    public string ActorFullName { get; set; } = string.Empty;
    public string ActorRole { get; set; } = string.Empty;
    public string FromStatus { get; set; } = string.Empty;
    public string ToStatus { get; set; } = string.Empty;
    public string Notes { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}
