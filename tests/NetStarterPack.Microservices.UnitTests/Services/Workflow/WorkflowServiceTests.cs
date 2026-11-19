using BuildingBlocks.Core.Constants;
using NetStarterPack.Microservices.UnitTests.Common.Factories;
using NetStarterPack.Microservices.UnitTests.Common.TestDoubles;
using Workflow.Api.Application.DTOs;
using Workflow.Api.Application.Services;

namespace NetStarterPack.Microservices.UnitTests.Services.Workflow;

public class WorkflowServiceTests
{
    private static Dictionary<string, string> CreateValidLaptopFormData() => new()
    {
        ["brandModel"] = "Lenovo ThinkPad P14s Gen 5",
        ["specifications"] = "AMD Ryzen 7 PRO 8840HS, 32GB RAM, 1TB NVMe SSD",
        ["estimatedCost"] = "28500000",
        ["urgency"] = "Urgent (7 Hari)",
        ["neededDate"] = "2026-12-01",
        ["justification"] = "Dibutuhkan untuk run Docker + SQL Server + 5 microservice lokal."
    };

    [Fact]
    public async Task DynamicSchemaValidation_ShouldRejectMissingRequiredFields()
    {
        using var ctx = await TestDbFactory.CreateWorkflowAsync();
        var staffUser = FakeCurrentUserService.AsUser("staff", "Dewi Lestari (Staff)", [RoleNames.Staff]);
        var service = new WorkflowService(ctx.Uow, staffUser, TestCacheFactory.CreateInMemory(), new InMemoryEventBus());

        // Submit LAPTOP_PROCUREMENT tanpa mengisi field wajib
        var result = await service.CreateRequestAsync(new CreateWorkflowRequestDto(
            TemplateCode: "LAPTOP_PROCUREMENT",
            Title: "Pengajuan Laptop Kurang Lengkap",
            FormData: new Dictionary<string, string>
            {
                ["deviceBrand"] = "MacBook Pro 14 M4"
            },
            SubmitImmediately: true));

        Assert.False(result.Succeeded);
        Assert.Equal(400, result.StatusCode);
        Assert.NotEmpty(result.Errors);
    }

    [Fact]
    public async Task MultiLevelApproval_FromStaffToFullyApproved_ShouldAdvance3StepsAndBlockQueueJumping()
    {
        using var ctx = await TestDbFactory.CreateWorkflowAsync();
        var cache = TestCacheFactory.CreateInMemory();
        var eventBus = new InMemoryEventBus();

        var staffId = Guid.NewGuid();
        var managerId = Guid.NewGuid();
        var itLeadId = Guid.NewGuid();
        var financeId = Guid.NewGuid();

        var currentUser = FakeCurrentUserService.AsUser("staff", "Dewi Lestari (Staff)", [RoleNames.Staff], userId: staffId);
        var service = new WorkflowService(ctx.Uow, currentUser, cache, eventBus);

        // 1. Staff mengajukan Form Pengadaan Laptop (3 Level Approval: Manager -> ITLead -> FinanceDirector)
        var createRes = await service.CreateRequestAsync(new CreateWorkflowRequestDto(
            TemplateCode: "LAPTOP_PROCUREMENT",
            Title: "Pengadaan ThinkPad P14s Gen 5 untuk Backend Dev",
            FormData: CreateValidLaptopFormData(),
            SubmitImmediately: true));

        Assert.True(createRes.Succeeded);
        Assert.Equal("InReview", createRes.Data!.Status);
        Assert.Equal(1, createRes.Data.CurrentStepOrder);
        Assert.Equal(RoleNames.Manager, createRes.Data.CurrentApproverRole);
        var requestId = createRes.Data.Id;

        // 2. Security Guard #1 (Anti-Queue-Jumping): FinanceDirector mencoba bypass di Step 1 -> HARUS 403
        currentUser.SwitchTo(financeId, "financedirector", "Surya Darmawan (Finance Director)", [RoleNames.FinanceDirector]);
        var bypassAttempt = await service.ApproveAsync(requestId, new ApprovalActionRequestDto("Coba bypass step 1"));
        Assert.False(bypassAttempt.Succeeded);
        Assert.Equal(403, bypassAttempt.StatusCode);

        // 3. Manager (Step 1) melihat Working List & Approve
        currentUser.SwitchTo(managerId, "manager", "Andi Pratama (Manager)", [RoleNames.Manager]);
        var managerInbox = await service.GetWorkingListAsync();
        Assert.Contains(managerInbox.Data!, x => x.Id == requestId);

        var step1Res = await service.ApproveAsync(requestId, new ApprovalActionRequestDto("Kebutuhan dev valid, lanjut cek IT."));
        Assert.True(step1Res.Succeeded);
        Assert.Equal("InReview", step1Res.Data!.Status);
        Assert.Equal(2, step1Res.Data.CurrentStepOrder);
        Assert.Equal(RoleNames.ITLead, step1Res.Data.CurrentApproverRole);

        // 4. ITLead (Step 2) Approve
        currentUser.SwitchTo(itLeadId, "itlead", "Hendra Wijaya (IT Lead)", [RoleNames.ITLead]);
        var step2Res = await service.ApproveAsync(requestId, new ApprovalActionRequestDto("Spek ThinkPad 32GB sesuai standar IT."));
        Assert.True(step2Res.Succeeded);
        Assert.Equal(3, step2Res.Data!.CurrentStepOrder);
        Assert.Equal(RoleNames.FinanceDirector, step2Res.Data.CurrentApproverRole);

        // 5. FinanceDirector (Step 3 Final) Approve -> Fully Approved
        currentUser.SwitchTo(financeId, "financedirector", "Surya Darmawan (Finance Director)", [RoleNames.FinanceDirector]);
        var finalRes = await service.ApproveAsync(requestId, new ApprovalActionRequestDto("Budget Capex IT Q4 disetujui."));
        Assert.True(finalRes.Succeeded);
        Assert.Equal("Approved", finalRes.Data!.Status);
        Assert.Null(finalRes.Data.CurrentApproverRole);
        Assert.NotNull(finalRes.Data.CompletedAt);
        Assert.All(finalRes.Data.ApprovalSteps, s => Assert.Equal("Approved", s.Status));
        Assert.Contains(eventBus.PublishedEvents, e => e.Action == "FULLY_APPROVED" && e.SourceService == "Workflow.Api");
    }

    [Fact]
    public async Task AntiSelfApproval_ShouldRejectApprovingOwnSubmissionWith403()
    {
        using var ctx = await TestDbFactory.CreateWorkflowAsync();
        var currentUser = FakeCurrentUserService.AsUser("manager", "Andi Pratama (Manager)", [RoleNames.Manager]);
        var service = new WorkflowService(ctx.Uow, currentUser, TestCacheFactory.CreateInMemory(), new InMemoryEventBus());

        var selfRequest = await service.CreateRequestAsync(new CreateWorkflowRequestDto(
            TemplateCode: "LEAVE_REQUEST",
            Title: "Cuti Tahunan Manager",
            FormData: new Dictionary<string, string>
            {
                ["leaveType"] = "Cuti Tahunan",
                ["startDate"] = "2026-12-10",
                ["endDate"] = "2026-12-12",
                ["totalDays"] = "3",
                ["backupPic"] = "Budi Santoso",
                ["reason"] = "Urusan keluarga"
            },
            SubmitImmediately: true));

        Assert.True(selfRequest.Succeeded);

        var selfApproveRes = await service.ApproveAsync(selfRequest.Data!.Id, new ApprovalActionRequestDto("Approve sendiri"));
        Assert.False(selfApproveRes.Succeeded);
        Assert.Equal(403, selfApproveRes.StatusCode);
    }

    [Fact]
    public async Task RevisionAndResubmitCycle_ShouldBlockNonOwnerEditAndReturnToStep1OnOwnerResubmit()
    {
        using var ctx = await TestDbFactory.CreateWorkflowAsync();
        var staffId = Guid.NewGuid();
        var managerId = Guid.NewGuid();

        var currentUser = FakeCurrentUserService.AsUser("staff", "Dewi Lestari (Staff)", [RoleNames.Staff], userId: staffId);
        var service = new WorkflowService(ctx.Uow, currentUser, TestCacheFactory.CreateInMemory(), new InMemoryEventBus());

        var supplyReq = await service.CreateRequestAsync(new CreateWorkflowRequestDto(
            TemplateCode: "OFFICE_SUPPLY",
            Title: "Beli Kursi Ergonomis",
            FormData: new Dictionary<string, string>
            {
                ["itemName"] = "Kursi Ergonomis Kantor",
                ["supplyCategory"] = "Furniture & Ruang Kerja",
                ["quantity"] = "2",
                ["estimatedTotal"] = "6000000",
                ["deliveryDivision"] = "Lantai 3 - Engineering"
            },
            SubmitImmediately: true));

        var supplyId = supplyReq.Data!.Id;

        // Manager minta revisi
        currentUser.SwitchTo(managerId, "manager", "Andi Pratama (Manager)", [RoleNames.Manager]);
        var revRes = await service.RequestRevisionAsync(supplyId, new ApprovalActionRequestDto("Lampirkan tipe kursi dan vendornya."));
        Assert.True(revRes.Succeeded);
        Assert.Equal("RevisionRequested", revRes.Data!.Status);

        // Non-owner (Manager) mencoba mengedit form milik Staff -> HARUS 403
        var illegalEdit = await service.ResubmitRequestAsync(supplyId, new UpdateAndResubmitWorkflowRequestDto(
            Title: "Diedit bukan pemilik",
            FormData: supplyReq.Data.FormData,
            ResubmitNotes: "Coba edit paksa"));
        Assert.False(illegalEdit.Succeeded);
        Assert.Equal(403, illegalEdit.StatusCode);

        // Pemilik asli (Staff) revisi & submit ulang -> kembali InReview Step 1
        currentUser.SwitchTo(staffId, "staff", "Dewi Lestari (Staff)", [RoleNames.Staff]);
        var updatedData = new Dictionary<string, string>(supplyReq.Data.FormData)
        {
            ["itemName"] = "Kursi Ergonomis Pexio Mike (Vendor Resmi)",
            ["notes"] = "Link vendor sudah dicek"
        };

        var resubmitRes = await service.ResubmitRequestAsync(supplyId, new UpdateAndResubmitWorkflowRequestDto(
            Title: "Beli Kursi Ergonomis (Revisi Vendor)",
            FormData: updatedData,
            ResubmitNotes: "Sudah ditambahkan detail tipe & vendor resmi"));

        Assert.True(resubmitRes.Succeeded);
        Assert.Equal("InReview", resubmitRes.Data!.Status);
        Assert.Equal(1, resubmitRes.Data.CurrentStepOrder);
    }
}
