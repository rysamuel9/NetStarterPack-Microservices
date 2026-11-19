using System.Text.Json;
using BuildingBlocks.Core.Common;
using BuildingBlocks.Core.Constants;
using BuildingBlocks.Core.Contracts;
using BuildingBlocks.Core.Interfaces;
using Workflow.Api.Application.DTOs;
using Workflow.Api.Application.Interfaces;
using Workflow.Api.Domain.Entities;
using Workflow.Api.Domain.Interfaces;

namespace Workflow.Api.Application.Services;

/// <summary>
/// Core Business Service untuk Dynamic Form Builder dan Multi-Level Approval Workflow (Port 5084).
/// Dilengkapi proteksi keamanan berlapis:
/// 1. Dynamic Schema Validation di Backend (memvalidasi field wajib berdasarkan FormTemplate.FieldsJson)
/// 2. Ownership Guard (hanya pengaju asli yang bisa mengubah/resubmit Draft atau RevisionRequested)
/// 3. Anti-Self-Approval Guard (user tidak dapat menyetujui dokumen pengajuannya sendiri)
/// 4. Strict Current-Step Approver Role Guard (hanya role pada CurrentStepOrder aktif yang boleh Approve/Reject/Revision)
/// 5. Immutable WorkflowHistoryLog + Cross-Service AuditLogIntegrationEvent ke Identity.Api
/// </summary>
public class WorkflowService(
    IWorkflowUnitOfWork unitOfWork,
    ICurrentUserService currentUserService,
    ICacheService cacheService,
    IEventBus eventBus) : IWorkflowService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public async Task<Result<IReadOnlyList<FormTemplateDto>>> GetFormTemplatesAsync(
        bool activeOnly = true,
        CancellationToken cancellationToken = default)
    {
        var allTemplates = await cacheService.GetOrCreateAsync(
            CacheKeys.WorkflowTemplates(),
            async ct =>
            {
                var entities = await unitOfWork.Templates.GetListAsync(cancellationToken: ct);
                return entities
                    .OrderBy(t => t.Category)
                    .ThenBy(t => t.Name)
                    .Select(MapTemplate)
                    .ToList();
            },
            TimeSpan.FromMinutes(15),
            cancellationToken);

        var result = activeOnly ? allTemplates.Where(t => t.IsActive).ToList() : allTemplates;
        return Result<IReadOnlyList<FormTemplateDto>>.Success(result);
    }

    public async Task<Result<FormTemplateDto>> CreateFormTemplateAsync(
        CreateOrUpdateFormTemplateRequest request,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.Code) || string.IsNullOrWhiteSpace(request.Name))
        {
            return Result<FormTemplateDto>.Failure("Kode dan Nama Template Form wajib diisi.", 400);
        }

        if (request.Fields is null || request.Fields.Count == 0)
        {
            return Result<FormTemplateDto>.Failure("Template form minimal harus memiliki 1 field dinamis.", 400);
        }

        if (request.ApprovalFlow is null || request.ApprovalFlow.Count == 0)
        {
            return Result<FormTemplateDto>.Failure("Template form minimal harus memiliki 1 tahap approval.", 400);
        }

        var code = request.Code.Trim().ToUpperInvariant().Replace(' ', '_');
        if (await unitOfWork.Templates.AnyAsync(t => t.Code == code, cancellationToken))
        {
            return Result<FormTemplateDto>.Failure($"Template dengan kode '{code}' sudah ada.", 409);
        }

        var normalizedSteps = request.ApprovalFlow
            .OrderBy(s => s.StepOrder)
            .Select((s, index) => s with { StepOrder = index + 1 })
            .ToList();

        var template = new FormTemplate
        {
            Code = code,
            Name = request.Name.Trim(),
            Category = string.IsNullOrWhiteSpace(request.Category) ? "General" : request.Category.Trim(),
            Icon = string.IsNullOrWhiteSpace(request.Icon) ? "FileText" : request.Icon.Trim(),
            Description = request.Description.Trim(),
            FieldsJson = JsonSerializer.Serialize(request.Fields, JsonOptions),
            ApprovalFlowJson = JsonSerializer.Serialize(normalizedSteps, JsonOptions),
            IsActive = request.IsActive,
            CreatedBy = currentUserService.Username ?? "System"
        };

        await unitOfWork.Templates.AddAsync(template, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        await cacheService.RemoveByPrefixAsync(CacheKeys.WorkflowsPrefix, cancellationToken);

        await eventBus.PublishAuditAsync(new AuditLogIntegrationEvent(
            UserId: currentUserService.UserId,
            UserName: currentUserService.Username ?? "System",
            Action: "CREATE_FORM_TEMPLATE",
            Module: "Workflows",
            EntityId: template.Id.ToString(),
            Details: $"[Workflow.Api] Membuat template form dinamis '{template.Name}' ({template.Code}) dengan {normalizedSteps.Count} tahap approval.",
            IpAddress: currentUserService.IpAddress,
            SourceService: "Workflow.Api"), cancellationToken);

        return Result<FormTemplateDto>.Success(MapTemplate(template), "Template form dinamis berhasil dibuat.", 201);
    }

    public async Task<Result<WorkflowRequestDto>> CreateRequestAsync(
        CreateWorkflowRequestDto request,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.TemplateCode) || string.IsNullOrWhiteSpace(request.Title))
        {
            return Result<WorkflowRequestDto>.Failure("Jenis dokumen (TemplateCode) dan Judul pengajuan wajib diisi.", 400);
        }

        var code = request.TemplateCode.Trim().ToUpperInvariant();
        var template = await unitOfWork.Templates.FirstOrDefaultAsync(t => t.Code == code && t.IsActive, cancellationToken);
        if (template is null)
        {
            return Result<WorkflowRequestDto>.Failure($"Template formulir '{code}' tidak ditemukan atau tidak aktif.", 404);
        }

        var fields = DeserializeFields(template.FieldsJson);
        var flowSteps = DeserializeApprovalFlow(template.ApprovalFlowJson);
        var formData = request.FormData ?? new Dictionary<string, string>();

        if (request.SubmitImmediately)
        {
            var validationError = ValidateDynamicFormData(fields, formData);
            if (validationError is not null)
            {
                return Result<WorkflowRequestDto>.Failure(validationError, 400);
            }
        }

        var requesterId = currentUserService.UserId ?? Guid.NewGuid();
        var requesterUsername = currentUserService.Username ?? "anonymous";
        var requesterFullName = currentUserService.FullName ?? requesterUsername;
        var primaryRole = currentUserService.Roles.FirstOrDefault() ?? "Staff";

        var prefix = template.Code.Length >= 3 ? template.Code[..3] : template.Code;
        var count = await unitOfWork.Requests.CountAsync(cancellationToken: cancellationToken);
        var requestNumber = $"WF-{prefix}-{DateTime.UtcNow:yyyy}-{(count + 1):D3}";

        var now = DateTime.UtcNow;
        var workflowReq = new WorkflowRequest
        {
            RequestNumber = requestNumber,
            FormTemplateId = template.Id,
            FormTemplate = template,
            TemplateCode = template.Code,
            TemplateName = template.Name,
            TemplateCategory = template.Category,
            Title = request.Title.Trim(),
            FormDataJson = JsonSerializer.Serialize(formData, JsonOptions),
            RequesterUserId = requesterId,
            RequesterUsername = requesterUsername,
            RequesterFullName = requesterFullName,
            TotalSteps = flowSteps.Count,
            Status = request.SubmitImmediately ? WorkflowStatus.InReview : WorkflowStatus.Draft,
            CurrentStepOrder = request.SubmitImmediately && flowSteps.Count > 0 ? 1 : 0,
            CurrentApproverRole = request.SubmitImmediately && flowSteps.Count > 0 ? flowSteps[0].ApproverRole : null,
            SubmittedAt = request.SubmitImmediately ? now : null,
            CreatedBy = requesterUsername
        };

        foreach (var stepDef in flowSteps.OrderBy(s => s.StepOrder))
        {
            workflowReq.ApprovalSteps.Add(new WorkflowApprovalStep
            {
                WorkflowRequestId = workflowReq.Id,
                StepOrder = stepDef.StepOrder,
                StepName = stepDef.StepName,
                ApproverRole = stepDef.ApproverRole,
                Description = stepDef.Description,
                Status = request.SubmitImmediately && stepDef.StepOrder == 1
                    ? ApprovalStepStatus.Pending
                    : ApprovalStepStatus.Waiting,
                CreatedBy = requesterUsername
            });
        }

        workflowReq.HistoryLogs.Add(new WorkflowHistoryLog
        {
            WorkflowRequestId = workflowReq.Id,
            Action = request.SubmitImmediately ? "SUBMITTED" : "CREATED_DRAFT",
            ActorUsername = requesterUsername,
            ActorFullName = requesterFullName,
            ActorRole = primaryRole,
            FromStatus = "None",
            ToStatus = workflowReq.Status.ToString(),
            Notes = request.SubmitImmediately
                ? $"Pengajuan disubmit dan masuk antrean Step 1 ({workflowReq.CurrentApproverRole})."
                : "Pengajuan disimpan sebagai Draft.",
            Timestamp = now,
            CreatedBy = requesterUsername
        });

        await unitOfWork.Requests.AddAsync(workflowReq, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        await cacheService.RemoveByPrefixAsync(CacheKeys.WorkflowsPrefix, cancellationToken);

        await eventBus.PublishAuditAsync(new AuditLogIntegrationEvent(
            UserId: requesterId,
            UserName: requesterUsername,
            Action: request.SubmitImmediately ? "SUBMIT_WORKFLOW" : "CREATE_WORKFLOW_DRAFT",
            Module: "Workflows",
            EntityId: workflowReq.Id.ToString(),
            Details: $"[Workflow.Api] {requesterUsername} membuat pengajuan '{workflowReq.RequestNumber}' ({template.Name}) — Status: {workflowReq.Status}.",
            IpAddress: currentUserService.IpAddress,
            SourceService: "Workflow.Api"), cancellationToken);

        return Result<WorkflowRequestDto>.Success(
            MapRequest(workflowReq, fields),
            request.SubmitImmediately
                ? $"Pengajuan {workflowReq.RequestNumber} berhasil disubmit ke approver ({workflowReq.CurrentApproverRole})."
                : $"Draft {workflowReq.RequestNumber} berhasil disimpan.",
            201);
    }

    public async Task<Result<WorkflowRequestDto>> ResubmitRequestAsync(
        Guid id,
        UpdateAndResubmitWorkflowRequestDto request,
        CancellationToken cancellationToken = default)
    {
        var entity = await unitOfWork.Requests.GetWithDetailsByIdAsync(id, cancellationToken);
        if (entity is null)
        {
            return Result<WorkflowRequestDto>.Failure("Dokumen pengajuan tidak ditemukan.", 404);
        }

        var isOwner = entity.RequesterUserId == currentUserService.UserId ||
                      string.Equals(entity.RequesterUsername, currentUserService.Username, StringComparison.OrdinalIgnoreCase);
        var isSuperAdmin = currentUserService.Roles.Contains(RoleNames.SuperAdmin, StringComparer.OrdinalIgnoreCase);

        if (!isOwner && !isSuperAdmin)
        {
            return Result<WorkflowRequestDto>.Failure("Akses ditolak. Hanya pengaju asli dokumen ini yang dapat mengedit atau mengirim ulang.", 403);
        }

        if (entity.Status is not (WorkflowStatus.Draft or WorkflowStatus.RevisionRequested))
        {
            return Result<WorkflowRequestDto>.Failure($"Dokumen berstatus '{entity.Status}' tidak dapat diubah atau disubmit ulang.", 400);
        }

        var fields = DeserializeFields(entity.FormTemplate.FieldsJson);
        var formData = request.FormData ?? new Dictionary<string, string>();
        var validationError = ValidateDynamicFormData(fields, formData);
        if (validationError is not null)
        {
            return Result<WorkflowRequestDto>.Failure(validationError, 400);
        }

        var prevStatus = entity.Status.ToString();
        entity.Title = string.IsNullOrWhiteSpace(request.Title) ? entity.Title : request.Title.Trim();
        entity.FormDataJson = JsonSerializer.Serialize(formData, JsonOptions);
        entity.Status = WorkflowStatus.InReview;
        entity.SubmittedAt ??= DateTime.UtcNow;
        entity.UpdatedAt = DateTime.UtcNow;
        entity.UpdatedBy = currentUserService.Username ?? "System";

        var orderedSteps = entity.ApprovalSteps.OrderBy(s => s.StepOrder).ToList();
        var targetStep = orderedSteps.FirstOrDefault(s => s.Status == ApprovalStepStatus.RevisionRequested)
                         ?? orderedSteps.FirstOrDefault();

        if (targetStep is not null)
        {
            targetStep.Status = ApprovalStepStatus.Pending;
            targetStep.Comment = null;
            targetStep.ActionAt = null;
            targetStep.ActionByUserId = null;
            targetStep.ActionByUsername = null;
            targetStep.ActionByFullName = null;
            entity.CurrentStepOrder = targetStep.StepOrder;
            entity.CurrentApproverRole = targetStep.ApproverRole;
        }

        var actorUsername = currentUserService.Username ?? "System";
        var actorFullName = currentUserService.FullName ?? actorUsername;
        var actorRole = currentUserService.Roles.FirstOrDefault() ?? "Staff";

        await unitOfWork.Repository<WorkflowHistoryLog>().AddAsync(new WorkflowHistoryLog
        {
            WorkflowRequestId = entity.Id,
            Action = "RESUBMITTED",
            ActorUsername = actorUsername,
            ActorFullName = actorFullName,
            ActorRole = actorRole,
            FromStatus = prevStatus,
            ToStatus = WorkflowStatus.InReview.ToString(),
            Notes = string.IsNullOrWhiteSpace(request.ResubmitNotes)
                ? $"Dokumen diperbarui dan disubmit ulang ke Step {entity.CurrentStepOrder} ({entity.CurrentApproverRole})."
                : request.ResubmitNotes.Trim(),
            Timestamp = DateTime.UtcNow,
            CreatedBy = actorUsername
        }, cancellationToken);

        unitOfWork.Requests.Update(entity);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        await cacheService.RemoveByPrefixAsync(CacheKeys.WorkflowsPrefix, cancellationToken);

        await eventBus.PublishAuditAsync(new AuditLogIntegrationEvent(
            UserId: currentUserService.UserId,
            UserName: actorUsername,
            Action: "RESUBMIT_WORKFLOW",
            Module: "Workflows",
            EntityId: entity.Id.ToString(),
            Details: $"[Workflow.Api] {actorUsername} mengirim ulang '{entity.RequestNumber}' ke approver ({entity.CurrentApproverRole}).",
            IpAddress: currentUserService.IpAddress,
            SourceService: "Workflow.Api"), cancellationToken);

        return Result<WorkflowRequestDto>.Success(MapRequest(entity, fields), "Dokumen berhasil diperbarui dan disubmit ulang.");
    }

    public async Task<Result<IReadOnlyList<WorkflowRequestDto>>> GetWorkingListAsync(CancellationToken cancellationToken = default)
    {
        var userRoles = currentUserService.Roles;
        var isSuperAdmin = userRoles.Contains(RoleNames.SuperAdmin, StringComparer.OrdinalIgnoreCase);

        var pendingItems = await unitOfWork.Requests.GetPendingForRolesAsync(userRoles, isSuperAdmin, cancellationToken);

        if (!isSuperAdmin && currentUserService.UserId is not null)
        {
            pendingItems = pendingItems
                .Where(r => r.RequesterUserId != currentUserService.UserId.Value &&
                            !string.Equals(r.RequesterUsername, currentUserService.Username, StringComparison.OrdinalIgnoreCase))
                .ToList();
        }

        var dtos = pendingItems
            .Select(r => MapRequest(r, DeserializeFields(r.FormTemplate.FieldsJson)))
            .ToList();

        return Result<IReadOnlyList<WorkflowRequestDto>>.Success(dtos);
    }

    public async Task<Result<IReadOnlyList<WorkflowRequestDto>>> GetTrackingListAsync(
        string? scope = null,
        string? status = null,
        string? templateCode = null,
        string? search = null,
        CancellationToken cancellationToken = default)
    {
        var all = await unitOfWork.Requests.GetAllWithDetailsAsync(cancellationToken);
        IEnumerable<WorkflowRequest> query = all;

        var isSuperOrAdmin = currentUserService.Roles.Any(r =>
            r.Equals(RoleNames.SuperAdmin, StringComparison.OrdinalIgnoreCase) ||
            r.Equals(RoleNames.Admin, StringComparison.OrdinalIgnoreCase));

        if (string.Equals(scope, "mine", StringComparison.OrdinalIgnoreCase))
        {
            query = query.Where(r =>
                r.RequesterUserId == currentUserService.UserId ||
                string.Equals(r.RequesterUsername, currentUserService.Username, StringComparison.OrdinalIgnoreCase));
        }
        else if (string.Equals(scope, "involved", StringComparison.OrdinalIgnoreCase) && !isSuperOrAdmin)
        {
            var myRoles = currentUserService.Roles;
            query = query.Where(r =>
                r.RequesterUserId == currentUserService.UserId ||
                string.Equals(r.RequesterUsername, currentUserService.Username, StringComparison.OrdinalIgnoreCase) ||
                r.ApprovalSteps.Any(s => myRoles.Contains(s.ApproverRole, StringComparer.OrdinalIgnoreCase)));
        }

        if (!string.IsNullOrWhiteSpace(status))
        {
            query = query.Where(r => r.Status.ToString().Equals(status.Trim(), StringComparison.OrdinalIgnoreCase));
        }

        if (!string.IsNullOrWhiteSpace(templateCode))
        {
            query = query.Where(r => r.TemplateCode.Equals(templateCode.Trim(), StringComparison.OrdinalIgnoreCase));
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(r =>
                r.RequestNumber.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                r.Title.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                r.RequesterFullName.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                r.TemplateName.Contains(term, StringComparison.OrdinalIgnoreCase));
        }

        var dtos = query
            .Select(r => MapRequest(r, DeserializeFields(r.FormTemplate.FieldsJson)))
            .ToList();

        return Result<IReadOnlyList<WorkflowRequestDto>>.Success(dtos);
    }

    public async Task<Result<WorkflowRequestDto>> GetRequestByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var entity = await unitOfWork.Requests.GetWithDetailsByIdAsync(id, cancellationToken);
        if (entity is null)
        {
            return Result<WorkflowRequestDto>.Failure("Dokumen pengajuan tidak ditemukan.", 404);
        }

        return Result<WorkflowRequestDto>.Success(MapRequest(entity, DeserializeFields(entity.FormTemplate.FieldsJson)));
    }

    public async Task<Result<WorkflowRequestDto>> ApproveAsync(
        Guid id,
        ApprovalActionRequestDto actionRequest,
        CancellationToken cancellationToken = default)
    {
        var validation = await ValidateActiveApproverStepAsync(id, cancellationToken);
        if (!validation.Succeeded)
        {
            return Result<WorkflowRequestDto>.Failure(validation.Message, validation.StatusCode);
        }

        var (entity, activeStep) = validation.Data!;
        var now = DateTime.UtcNow;
        var actorUsername = currentUserService.Username ?? "System";
        var actorFullName = currentUserService.FullName ?? actorUsername;
        var actorRole = currentUserService.Roles.Contains(activeStep.ApproverRole, StringComparer.OrdinalIgnoreCase)
            ? activeStep.ApproverRole
            : currentUserService.Roles.FirstOrDefault() ?? RoleNames.SuperAdmin;

        activeStep.Status = ApprovalStepStatus.Approved;
        activeStep.ActionByUserId = currentUserService.UserId;
        activeStep.ActionByUsername = actorUsername;
        activeStep.ActionByFullName = actorFullName;
        activeStep.Comment = string.IsNullOrWhiteSpace(actionRequest.Comment) ? "Disetujui." : actionRequest.Comment.Trim();
        activeStep.ActionAt = now;

        var nextStep = entity.ApprovalSteps
            .Where(s => s.StepOrder > activeStep.StepOrder)
            .OrderBy(s => s.StepOrder)
            .FirstOrDefault();

        string historyAction;
        string summaryMessage;

        if (nextStep is not null)
        {
            nextStep.Status = ApprovalStepStatus.Pending;
            entity.CurrentStepOrder = nextStep.StepOrder;
            entity.CurrentApproverRole = nextStep.ApproverRole;
            entity.Status = WorkflowStatus.InReview;
            historyAction = "APPROVED_STEP";
            summaryMessage = $"Step {activeStep.StepOrder} ({activeStep.StepName}) disetujui. Dokumen diteruskan ke Step {nextStep.StepOrder} ({nextStep.ApproverRole}).";
        }
        else
        {
            entity.Status = WorkflowStatus.Approved;
            entity.CurrentApproverRole = null;
            entity.CompletedAt = now;
            historyAction = "FULLY_APPROVED";
            summaryMessage = $"Step terakhir ({activeStep.StepName}) disetujui. Dokumen {entity.RequestNumber} sekarang FULLY APPROVED!";
        }

        entity.UpdatedAt = now;
        entity.UpdatedBy = actorUsername;

        await unitOfWork.Repository<WorkflowHistoryLog>().AddAsync(new WorkflowHistoryLog
        {
            WorkflowRequestId = entity.Id,
            Action = historyAction,
            ActorUsername = actorUsername,
            ActorFullName = actorFullName,
            ActorRole = actorRole,
            FromStatus = WorkflowStatus.InReview.ToString(),
            ToStatus = entity.Status.ToString(),
            Notes = $"[{activeStep.StepName}] {activeStep.Comment}",
            Timestamp = now,
            CreatedBy = actorUsername
        }, cancellationToken);

        unitOfWork.Requests.Update(entity);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        await cacheService.RemoveByPrefixAsync(CacheKeys.WorkflowsPrefix, cancellationToken);

        await eventBus.PublishAuditAsync(new AuditLogIntegrationEvent(
            UserId: currentUserService.UserId,
            UserName: actorUsername,
            Action: historyAction,
            Module: "Workflows",
            EntityId: entity.Id.ToString(),
            Details: $"[Workflow.Api] {actorUsername} ({actorRole}) menyetujui '{entity.RequestNumber}' pada Step {activeStep.StepOrder}. Status: {entity.Status}.",
            IpAddress: currentUserService.IpAddress,
            SourceService: "Workflow.Api"), cancellationToken);

        return Result<WorkflowRequestDto>.Success(
            MapRequest(entity, DeserializeFields(entity.FormTemplate.FieldsJson)),
            summaryMessage);
    }

    public async Task<Result<WorkflowRequestDto>> RequestRevisionAsync(
        Guid id,
        ApprovalActionRequestDto actionRequest,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(actionRequest.Comment))
        {
            return Result<WorkflowRequestDto>.Failure("Catatan/alasan revisi wajib diisi agar pengaju tahu bagian mana yang harus diperbaiki.", 400);
        }

        var validation = await ValidateActiveApproverStepAsync(id, cancellationToken);
        if (!validation.Succeeded)
        {
            return Result<WorkflowRequestDto>.Failure(validation.Message, validation.StatusCode);
        }

        var (entity, activeStep) = validation.Data!;
        var now = DateTime.UtcNow;
        var actorUsername = currentUserService.Username ?? "System";
        var actorFullName = currentUserService.FullName ?? actorUsername;
        var actorRole = currentUserService.Roles.Contains(activeStep.ApproverRole, StringComparer.OrdinalIgnoreCase)
            ? activeStep.ApproverRole
            : currentUserService.Roles.FirstOrDefault() ?? RoleNames.SuperAdmin;

        activeStep.Status = ApprovalStepStatus.RevisionRequested;
        activeStep.ActionByUserId = currentUserService.UserId;
        activeStep.ActionByUsername = actorUsername;
        activeStep.ActionByFullName = actorFullName;
        activeStep.Comment = actionRequest.Comment.Trim();
        activeStep.ActionAt = now;

        entity.Status = WorkflowStatus.RevisionRequested;
        entity.CurrentApproverRole = null;
        entity.UpdatedAt = now;
        entity.UpdatedBy = actorUsername;

        await unitOfWork.Repository<WorkflowHistoryLog>().AddAsync(new WorkflowHistoryLog
        {
            WorkflowRequestId = entity.Id,
            Action = "REQUESTED_REVISION",
            ActorUsername = actorUsername,
            ActorFullName = actorFullName,
            ActorRole = actorRole,
            FromStatus = WorkflowStatus.InReview.ToString(),
            ToStatus = WorkflowStatus.RevisionRequested.ToString(),
            Notes = $"[{activeStep.StepName}] Minta revisi: {activeStep.Comment}",
            Timestamp = now,
            CreatedBy = actorUsername
        }, cancellationToken);

        unitOfWork.Requests.Update(entity);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        await cacheService.RemoveByPrefixAsync(CacheKeys.WorkflowsPrefix, cancellationToken);

        await eventBus.PublishAuditAsync(new AuditLogIntegrationEvent(
            UserId: currentUserService.UserId,
            UserName: actorUsername,
            Action: "REQUEST_WORKFLOW_REVISION",
            Module: "Workflows",
            EntityId: entity.Id.ToString(),
            Details: $"[Workflow.Api] {actorUsername} ({actorRole}) mengembalikan '{entity.RequestNumber}' untuk direvisi: {activeStep.Comment}",
            IpAddress: currentUserService.IpAddress,
            SourceService: "Workflow.Api"), cancellationToken);

        return Result<WorkflowRequestDto>.Success(
            MapRequest(entity, DeserializeFields(entity.FormTemplate.FieldsJson)),
            $"Dokumen {entity.RequestNumber} dikembalikan ke pengaju ({entity.RequesterUsername}) untuk direvisi.");
    }

    public async Task<Result<WorkflowRequestDto>> RejectAsync(
        Guid id,
        ApprovalActionRequestDto actionRequest,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(actionRequest.Comment))
        {
            return Result<WorkflowRequestDto>.Failure("Alasan penolakan (Reject) wajib diisi.", 400);
        }

        var validation = await ValidateActiveApproverStepAsync(id, cancellationToken);
        if (!validation.Succeeded)
        {
            return Result<WorkflowRequestDto>.Failure(validation.Message, validation.StatusCode);
        }

        var (entity, activeStep) = validation.Data!;
        var now = DateTime.UtcNow;
        var actorUsername = currentUserService.Username ?? "System";
        var actorFullName = currentUserService.FullName ?? actorUsername;
        var actorRole = currentUserService.Roles.Contains(activeStep.ApproverRole, StringComparer.OrdinalIgnoreCase)
            ? activeStep.ApproverRole
            : currentUserService.Roles.FirstOrDefault() ?? RoleNames.SuperAdmin;

        activeStep.Status = ApprovalStepStatus.Rejected;
        activeStep.ActionByUserId = currentUserService.UserId;
        activeStep.ActionByUsername = actorUsername;
        activeStep.ActionByFullName = actorFullName;
        activeStep.Comment = actionRequest.Comment.Trim();
        activeStep.ActionAt = now;

        entity.Status = WorkflowStatus.Rejected;
        entity.CurrentApproverRole = null;
        entity.CompletedAt = now;
        entity.UpdatedAt = now;
        entity.UpdatedBy = actorUsername;

        await unitOfWork.Repository<WorkflowHistoryLog>().AddAsync(new WorkflowHistoryLog
        {
            WorkflowRequestId = entity.Id,
            Action = "REJECTED",
            ActorUsername = actorUsername,
            ActorFullName = actorFullName,
            ActorRole = actorRole,
            FromStatus = WorkflowStatus.InReview.ToString(),
            ToStatus = WorkflowStatus.Rejected.ToString(),
            Notes = $"[{activeStep.StepName}] Ditolak: {activeStep.Comment}",
            Timestamp = now,
            CreatedBy = actorUsername
        }, cancellationToken);

        unitOfWork.Requests.Update(entity);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        await cacheService.RemoveByPrefixAsync(CacheKeys.WorkflowsPrefix, cancellationToken);

        await eventBus.PublishAuditAsync(new AuditLogIntegrationEvent(
            UserId: currentUserService.UserId,
            UserName: actorUsername,
            Action: "REJECT_WORKFLOW",
            Module: "Workflows",
            EntityId: entity.Id.ToString(),
            Details: $"[Workflow.Api] {actorUsername} ({actorRole}) menolak '{entity.RequestNumber}': {activeStep.Comment}",
            IpAddress: currentUserService.IpAddress,
            SourceService: "Workflow.Api"), cancellationToken);

        return Result<WorkflowRequestDto>.Success(
            MapRequest(entity, DeserializeFields(entity.FormTemplate.FieldsJson)),
            $"Dokumen {entity.RequestNumber} telah ditolak (Rejected).");
    }

    public async Task<Result<WorkflowStatsDto>> GetWorkflowStatsAsync(CancellationToken cancellationToken = default)
    {
        var stats = await cacheService.GetOrCreateAsync(
            CacheKeys.WorkflowStats(),
            async ct =>
            {
                var requests = await unitOfWork.Requests.GetListAsync(cancellationToken: ct);
                var activeTemplates = await unitOfWork.Templates.CountAsync(t => t.IsActive, ct);

                return new WorkflowStatsDto(
                    TotalRequests: requests.Count,
                    InReviewRequests: requests.Count(r => r.Status == WorkflowStatus.InReview),
                    ApprovedRequests: requests.Count(r => r.Status == WorkflowStatus.Approved),
                    RejectedRequests: requests.Count(r => r.Status == WorkflowStatus.Rejected),
                    RevisionRequests: requests.Count(r => r.Status == WorkflowStatus.RevisionRequested),
                    ActiveTemplates: activeTemplates);
            },
            TimeSpan.FromMinutes(5),
            cancellationToken);

        return Result<WorkflowStatsDto>.Success(stats);
    }

    private async Task<Result<(WorkflowRequest Entity, WorkflowApprovalStep ActiveStep)>> ValidateActiveApproverStepAsync(
        Guid requestId,
        CancellationToken cancellationToken)
    {
        var entity = await unitOfWork.Requests.GetWithDetailsByIdAsync(requestId, cancellationToken);
        if (entity is null)
        {
            return Result<(WorkflowRequest, WorkflowApprovalStep)>.Failure("Dokumen pengajuan tidak ditemukan.", 404);
        }

        if (entity.Status != WorkflowStatus.InReview)
        {
            return Result<(WorkflowRequest, WorkflowApprovalStep)>.Failure(
                $"Dokumen ini berstatus '{entity.Status}' sehingga tidak bisa diproses approval lagi.", 400);
        }

        var activeStep = entity.ApprovalSteps
            .FirstOrDefault(s => s.StepOrder == entity.CurrentStepOrder && s.Status == ApprovalStepStatus.Pending);

        if (activeStep is null)
        {
            return Result<(WorkflowRequest, WorkflowApprovalStep)>.Failure(
                "Tidak ditemukan tahap approval aktif (Pending) untuk dokumen ini.", 400);
        }

        var isSuperAdmin = currentUserService.Roles.Contains(RoleNames.SuperAdmin, StringComparer.OrdinalIgnoreCase);

        var isSameUser = (currentUserService.UserId is not null && entity.RequesterUserId == currentUserService.UserId.Value) ||
                         string.Equals(entity.RequesterUsername, currentUserService.Username, StringComparison.OrdinalIgnoreCase);

        if (isSameUser && !isSuperAdmin)
        {
            return Result<(WorkflowRequest, WorkflowApprovalStep)>.Failure(
                "Akses ditolak (Anti-Self-Approval Policy): Anda tidak boleh menyetujui atau menolak pengajuan yang Anda buat sendiri.", 403);
        }

        var hasRequiredApproverRole = currentUserService.Roles.Contains(activeStep.ApproverRole, StringComparer.OrdinalIgnoreCase);
        if (!hasRequiredApproverRole && !isSuperAdmin)
        {
            return Result<(WorkflowRequest, WorkflowApprovalStep)>.Failure(
                $"Akses ditolak. Tahap saat ini (Step {activeStep.StepOrder}: {activeStep.StepName}) hanya dapat diproses oleh role '{activeStep.ApproverRole}'.", 403);
        }

        return Result<(WorkflowRequest, WorkflowApprovalStep)>.Success((entity, activeStep));
    }

    private static string? ValidateDynamicFormData(
        IReadOnlyList<FormFieldDefinitionDto> fields,
        Dictionary<string, string> formData)
    {
        foreach (var field in fields.Where(f => f.Required))
        {
            if (!formData.TryGetValue(field.Key, out var value) || string.IsNullOrWhiteSpace(value))
            {
                return $"Field wajib '{field.Label}' belum diisi.";
            }
        }
        return null;
    }

    private static List<FormFieldDefinitionDto> DeserializeFields(string json)
    {
        try
        {
            return JsonSerializer.Deserialize<List<FormFieldDefinitionDto>>(json, JsonOptions) ?? [];
        }
        catch
        {
            return [];
        }
    }

    private static List<ApprovalFlowStepDefinitionDto> DeserializeApprovalFlow(string json)
    {
        try
        {
            return JsonSerializer.Deserialize<List<ApprovalFlowStepDefinitionDto>>(json, JsonOptions) ?? [];
        }
        catch
        {
            return [];
        }
    }

    private static Dictionary<string, string> DeserializeFormData(string json)
    {
        try
        {
            return JsonSerializer.Deserialize<Dictionary<string, string>>(json, JsonOptions) ?? new();
        }
        catch
        {
            return new();
        }
    }

    private static FormTemplateDto MapTemplate(FormTemplate t) =>
        new(
            t.Id,
            t.Code,
            t.Name,
            t.Category,
            t.Icon,
            t.Description,
            DeserializeFields(t.FieldsJson),
            DeserializeApprovalFlow(t.ApprovalFlowJson),
            t.IsActive);

    private static WorkflowRequestDto MapRequest(WorkflowRequest r, IReadOnlyList<FormFieldDefinitionDto> templateFields) =>
        new(
            r.Id,
            r.RequestNumber,
            r.FormTemplateId,
            r.TemplateCode,
            r.TemplateName,
            r.TemplateCategory,
            r.Title,
            DeserializeFormData(r.FormDataJson),
            templateFields,
            r.RequesterUserId,
            r.RequesterUsername,
            r.RequesterFullName,
            r.Status.ToString(),
            r.CurrentStepOrder,
            r.TotalSteps,
            r.CurrentApproverRole,
            r.CreatedAt,
            r.SubmittedAt,
            r.CompletedAt,
            r.ApprovalSteps
                .OrderBy(s => s.StepOrder)
                .Select(s => new WorkflowApprovalStepDto(
                    s.Id,
                    s.StepOrder,
                    s.StepName,
                    s.ApproverRole,
                    s.Description,
                    s.Status.ToString(),
                    s.ActionByUsername,
                    s.ActionByFullName,
                    s.Comment,
                    s.ActionAt))
                .ToList(),
            r.HistoryLogs
                .OrderByDescending(h => h.Timestamp)
                .Select(h => new WorkflowHistoryLogDto(
                    h.Id,
                    h.Action,
                    h.ActorUsername,
                    h.ActorFullName,
                    h.ActorRole,
                    h.FromStatus,
                    h.ToStatus,
                    h.Notes,
                    h.Timestamp))
                .ToList());
}
