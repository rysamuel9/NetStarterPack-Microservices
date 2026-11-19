using Announcement.Api.Application.DTOs;
using Announcement.Api.Application.Services;
using Announcement.Api.Infrastructure.Persistence;
using BuildingBlocks.Core.Constants;
using BuildingBlocks.Core.Contracts;
using BuildingBlocks.Core.Interfaces;
using BuildingBlocks.Infrastructure.Caching;
using BuildingBlocks.Security;
using Catalog.Api.Application.DTOs;
using Catalog.Api.Application.Services;
using Catalog.Api.Infrastructure.Persistence;
using Identity.Api.Application.DTOs;
using Identity.Api.Application.Interfaces;
using Identity.Api.Application.Services;
using Identity.Api.Infrastructure.Persistence;
using Identity.Api.Infrastructure.Security;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Order.Api.Application.DTOs;
using Order.Api.Application.Services;
using Order.Api.Infrastructure.Persistence;
using Workflow.Api.Application.DTOs;
using Workflow.Api.Application.Services;
using Workflow.Api.Infrastructure.Persistence;

namespace NetStarterPack.Microservices.UnitTests;

public class MicroservicesArchitectureTests
{
    private sealed class FakeCurrentUserService : ICurrentUserService
    {
        public Guid? UserId { get; set; } = Guid.NewGuid();
        public string? Username { get; set; } = "superadmin";
        public string? FullName { get; set; } = "Budi Santoso (Super Admin)";
        public IReadOnlyList<string> Roles { get; set; } = [RoleNames.SuperAdmin];
        public IReadOnlyList<string> Permissions { get; set; } =
            BuildingBlocks.Core.Constants.Permissions.GetAll().Select(p => p.Code).ToList();
        public string? IpAddress => "127.0.0.1";
        public string CorrelationId => "test-correlation-id-001";
    }

    private sealed class InMemoryEventBus : IEventBus
    {
        public List<AuditLogIntegrationEvent> PublishedEvents { get; } = new();

        public Task PublishAuditAsync(AuditLogIntegrationEvent auditEvent, CancellationToken cancellationToken = default)
        {
            PublishedEvents.Add(auditEvent);
            return Task.CompletedTask;
        }
    }

    private sealed class FakeCatalogStatsClient(CatalogStatsDto stats) : ICatalogStatsClient
    {
        public Task<CatalogStatsDto> GetCatalogStatsAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(stats);
    }

    private static ICacheService CreateTestCacheService()
    {
        var memoryDistributed = new MemoryDistributedCache(Options.Create(new MemoryDistributedCacheOptions()));
        var settings = Options.Create(new CacheSettings { Provider = "InMemory", DefaultExpirationMinutes = 10 });
        return new DistributedCacheService(memoryDistributed, settings, NullLogger<DistributedCacheService>.Instance);
    }

    private static async Task<(IdentityDbContext Db, IdentityUnitOfWork Uow, PasswordHasher Hasher, JwtTokenService Jwt)> CreateSeededIdentityAsync()
    {
        var options = new DbContextOptionsBuilder<IdentityDbContext>()
            .UseInMemoryDatabase($"IdentityTestDb_{Guid.NewGuid()}")
            .Options;

        var db = new IdentityDbContext(options);
        var hasher = new PasswordHasher();
        var jwt = new JwtTokenService(Options.Create(new JwtSettings()));
        var seeder = new IdentityDatabaseSeeder(db, hasher, NullLogger<IdentityDatabaseSeeder>.Instance);
        await seeder.SeedAsync();

        var uow = new IdentityUnitOfWork(db);
        return (db, uow, hasher, jwt);
    }

    private static async Task<(CatalogDbContext Db, CatalogUnitOfWork Uow)> CreateSeededCatalogAsync()
    {
        var options = new DbContextOptionsBuilder<CatalogDbContext>()
            .UseInMemoryDatabase($"CatalogTestDb_{Guid.NewGuid()}")
            .Options;

        var db = new CatalogDbContext(options);
        var seeder = new CatalogDatabaseSeeder(db, NullLogger<CatalogDatabaseSeeder>.Instance);
        await seeder.SeedAsync();

        var uow = new CatalogUnitOfWork(db);
        return (db, uow);
    }

    private static async Task<(OrderDbContext Db, OrderUnitOfWork Uow)> CreateSeededOrderAsync()
    {
        var options = new DbContextOptionsBuilder<OrderDbContext>()
            .UseInMemoryDatabase($"OrderTestDb_{Guid.NewGuid()}")
            .Options;

        var db = new OrderDbContext(options);
        var seeder = new OrderDatabaseSeeder(db, NullLogger<OrderDatabaseSeeder>.Instance);
        await seeder.SeedAsync();

        var uow = new OrderUnitOfWork(db);
        return (db, uow);
    }

    private static async Task<(WorkflowDbContext Db, WorkflowUnitOfWork Uow)> CreateSeededWorkflowAsync()
    {
        var options = new DbContextOptionsBuilder<WorkflowDbContext>()
            .UseInMemoryDatabase($"WorkflowTestDb_{Guid.NewGuid()}")
            .Options;

        var db = new WorkflowDbContext(options);
        var seeder = new WorkflowDatabaseSeeder(db, NullLogger<WorkflowDatabaseSeeder>.Instance);
        await seeder.SeedAsync();

        var uow = new WorkflowUnitOfWork(db);
        return (db, uow);
    }

    [Fact]
    public async Task IdentityService_Login_And_RefreshTokenRotation_ShouldSucceed()
    {
        var (_, uow, hasher, jwt) = await CreateSeededIdentityAsync();
        var currentUser = new FakeCurrentUserService();
        var cache = CreateTestCacheService();
        var authService = new AuthService(uow, jwt, hasher, currentUser, cache);

        var loginResult = await authService.LoginAsync(new LoginRequest("superadmin", "Password123!"));

        Assert.True(loginResult.Succeeded);
        Assert.NotNull(loginResult.Data);
        Assert.False(string.IsNullOrWhiteSpace(loginResult.Data!.AccessToken));
        Assert.Contains(RoleNames.SuperAdmin, loginResult.Data.User.Roles);

        var oldRefreshToken = loginResult.Data.RefreshToken;
        var refreshResult = await authService.RefreshTokenAsync(new RefreshTokenRequest(oldRefreshToken));

        Assert.True(refreshResult.Succeeded);
        Assert.NotEqual(oldRefreshToken, refreshResult.Data!.RefreshToken);
    }

    [Fact]
    public async Task CatalogService_CreateProduct_ShouldPersistToIsolatedCatalogDb_And_PublishAuditIntegrationEvent()
    {
        var (_, catalogUow) = await CreateSeededCatalogAsync();
        var currentUser = new FakeCurrentUserService { Username = "staff" };
        var cache = CreateTestCacheService();
        var eventBus = new InMemoryEventBus();

        var productService = new ProductService(catalogUow, currentUser, cache, eventBus);

        var createResult = await productService.CreateProductAsync(new CreateOrUpdateProductRequest(
            Sku: "MS-TEST-900",
            Name: "Kubernetes Worker Node",
            Category: "Cloud & Infrastructure",
            Description: "Dedicated node untuk cluster microservice",
            Price: 3500000m,
            Stock: 10,
            Status: "Active"));

        Assert.True(createResult.Succeeded);
        Assert.Equal("MS-TEST-900", createResult.Data!.Sku);

        Assert.Single(eventBus.PublishedEvents);
        var publishedEvent = eventBus.PublishedEvents[0];
        Assert.Equal("CREATE_PRODUCT", publishedEvent.Action);
        Assert.Equal("Catalog.Api", publishedEvent.SourceService);
    }

    [Fact]
    public async Task OrderService_Example2Microservice_ShouldCalculateTotal_InvalidateCache_And_PublishAuditEvent()
    {
        var (db, orderUow) = await CreateSeededOrderAsync();
        var currentUser = new FakeCurrentUserService { Username = "manager" };
        var cache = CreateTestCacheService();
        var eventBus = new InMemoryEventBus();

        var orderService = new OrderService(orderUow, currentUser, cache, eventBus);

        var initialList = await orderService.GetAllOrdersAsync();
        Assert.Equal(4, initialList.Data!.Count);

        var createResult = await orderService.CreateOrderAsync(new CreateOrUpdateOrderRequest(
            OrderNumber: "ord-2026-999",
            CustomerName: "PT Garuda Digital Nusantara",
            CustomerEmail: "finance@garudadigital.id",
            ProductSku: "PRD-CLOUD-001",
            ProductName: "Enterprise Cloud Server Instance",
            Quantity: 3,
            UnitPrice: 2000000m,
            Status: "Completed",
            Notes: "Unit test Order Microservice Example 2"));

        Assert.True(createResult.Succeeded);
        Assert.Equal(201, createResult.StatusCode);
        Assert.Equal("ORD-2026-999", createResult.Data!.OrderNumber);
        Assert.Equal(6000000m, createResult.Data.TotalAmount);

        var afterCreateList = await orderService.GetAllOrdersAsync();
        Assert.Equal(5, afterCreateList.Data!.Count);

        Assert.Single(eventBus.PublishedEvents);
        Assert.Equal("CREATE_ORDER", eventBus.PublishedEvents[0].Action);
        Assert.Equal("Order.Api", eventBus.PublishedEvents[0].SourceService);

        await orderService.DeleteOrderAsync(createResult.Data.Id);
        var deletedEntity = await db.Orders.IgnoreQueryFilters().FirstOrDefaultAsync(o => o.Id == createResult.Data.Id);
        Assert.NotNull(deletedEntity);
        Assert.True(deletedEntity!.IsDeleted);
    }

    [Fact]
    public async Task CrossService_AuditEvent_And_DashboardAggregation_ShouldCombineIdentityAndCatalogMetrics()
    {
        var (_, identityUow, _, _) = await CreateSeededIdentityAsync();
        var (_, catalogUow) = await CreateSeededCatalogAsync();
        var currentUser = new FakeCurrentUserService();
        var cache = CreateTestCacheService();
        var eventBus = new InMemoryEventBus();

        var productService = new ProductService(catalogUow, currentUser, cache, eventBus);
        await productService.CreateProductAsync(new CreateOrUpdateProductRequest(
            Sku: "MS-AGG-001",
            Name: "API Gateway Appliance",
            Category: "Hardware",
            Description: "YARP Gateway Hardware",
            Price: 5000000m,
            Stock: 2,
            Status: "Active"));

        var catalogStatsResult = await productService.GetCatalogStatsAsync();
        Assert.True(catalogStatsResult.Succeeded);
        Assert.Equal(7, catalogStatsResult.Data!.TotalProducts);

        var dashboardService = new DashboardService(
            identityUow,
            new FakeCatalogStatsClient(catalogStatsResult.Data),
            cache);

        await dashboardService.RecordIntegrationAuditLogAsync(eventBus.PublishedEvents.Single());

        var summaryResult = await dashboardService.GetSummaryAsync();
        Assert.True(summaryResult.Succeeded);
        Assert.Equal(10, summaryResult.Data!.TotalUsers);
        Assert.Equal(7, summaryResult.Data.TotalProducts);
        Assert.Contains(summaryResult.Data.RecentActivities, a => a.Action == "CREATE_PRODUCT");
    }

    [Fact]
    public async Task WorkflowService_DynamicSchemaValidation_ShouldRejectMissingRequiredFields()
    {
        var (_, uow) = await CreateSeededWorkflowAsync();
        var staffUser = new FakeCurrentUserService
        {
            UserId = Guid.NewGuid(),
            Username = "staff",
            FullName = "Dewi Lestari (Staff)",
            Roles = [RoleNames.Staff]
        };
        var service = new WorkflowService(uow, staffUser, CreateTestCacheService(), new InMemoryEventBus());

        // Submit LAPTOP_PROCUREMENT tanpa mengisi field wajib (deviceBrand, processor, ram, dll)
        var result = await service.CreateRequestAsync(new CreateWorkflowRequestDto(
            TemplateCode: "LAPTOP_PROCUREMENT",
            Title: "Pengajuan Laptop Kurang Lengkap",
            FormData: new Dictionary<string, string>
            {
                ["deviceBrand"] = "MacBook Pro 14 M4"
                // Field wajib lainnya sengaja dikosongkan
            },
            SubmitImmediately: true));

        Assert.False(result.Succeeded);
        Assert.Equal(400, result.StatusCode);
        Assert.NotEmpty(result.Errors);
    }

    [Fact]
    public async Task WorkflowService_MultiLevelApproval_FromStaffToFullyApproved_WithSecurityGuards()
    {
        var (_, uow) = await CreateSeededWorkflowAsync();
        var cache = CreateTestCacheService();
        var eventBus = new InMemoryEventBus();

        var staffId = Guid.NewGuid();
        var managerId = Guid.NewGuid();
        var itLeadId = Guid.NewGuid();
        var financeId = Guid.NewGuid();

        var currentUser = new FakeCurrentUserService
        {
            UserId = staffId,
            Username = "staff",
            FullName = "Dewi Lestari (Staff)",
            Roles = [RoleNames.Staff]
        };

        var service = new WorkflowService(uow, currentUser, cache, eventBus);

        // 1. Staff mengajukan Form Pengadaan Laptop (3 Level Approval: Manager -> ITLead -> FinanceDirector)
        var createRes = await service.CreateRequestAsync(new CreateWorkflowRequestDto(
            TemplateCode: "LAPTOP_PROCUREMENT",
            Title: "Pengadaan ThinkPad P14s Gen 5 untuk Backend Dev",
            FormData: new Dictionary<string, string>
            {
                ["brandModel"] = "Lenovo ThinkPad P14s Gen 5",
                ["specifications"] = "AMD Ryzen 7 PRO 8840HS, 32GB RAM, 1TB NVMe SSD",
                ["estimatedCost"] = "28500000",
                ["urgency"] = "Urgent (7 Hari)",
                ["neededDate"] = "2026-12-01",
                ["justification"] = "Dibutuhkan untuk run Docker + SQL Server + 5 microservice lokal."
            },
            SubmitImmediately: true));

        Assert.True(createRes.Succeeded);
        Assert.Equal("InReview", createRes.Data!.Status);
        Assert.Equal(1, createRes.Data.CurrentStepOrder);
        Assert.Equal(RoleNames.Manager, createRes.Data.CurrentApproverRole);
        var requestId = createRes.Data.Id;

        // 2. Security Guard #1 (Anti-Queue-Jumping): FinanceDirector mencoba bypass & approve di Step 1 -> HARUS 403!
        currentUser.UserId = financeId;
        currentUser.Username = "financedirector";
        currentUser.FullName = "Surya Darmawan (Finance Director)";
        currentUser.Roles = [RoleNames.FinanceDirector];

        var bypassAttempt = await service.ApproveAsync(requestId, new ApprovalActionRequestDto("Coba bypass step 1"));
        Assert.False(bypassAttempt.Succeeded);
        Assert.Equal(403, bypassAttempt.StatusCode);

        // 3. Manager (Step 1) melihat Working List & Approve
        currentUser.UserId = managerId;
        currentUser.Username = "manager";
        currentUser.FullName = "Andi Pratama (Manager)";
        currentUser.Roles = [RoleNames.Manager];

        var managerInbox = await service.GetWorkingListAsync();
        Assert.Contains(managerInbox.Data!, x => x.Id == requestId);

        var step1Res = await service.ApproveAsync(requestId, new ApprovalActionRequestDto("Kebutuhan dev valid, lanjut cek IT."));
        Assert.True(step1Res.Succeeded);
        Assert.Equal("InReview", step1Res.Data!.Status);
        Assert.Equal(2, step1Res.Data.CurrentStepOrder);
        Assert.Equal(RoleNames.ITLead, step1Res.Data.CurrentApproverRole);

        // 4. ITLead (Step 2) Approve
        currentUser.UserId = itLeadId;
        currentUser.Username = "itlead";
        currentUser.FullName = "Hendra Wijaya (IT Lead)";
        currentUser.Roles = [RoleNames.ITLead];

        var step2Res = await service.ApproveAsync(requestId, new ApprovalActionRequestDto("Spek ThinkPad 32GB sesuai standar IT."));
        Assert.True(step2Res.Succeeded);
        Assert.Equal(3, step2Res.Data!.CurrentStepOrder);
        Assert.Equal(RoleNames.FinanceDirector, step2Res.Data.CurrentApproverRole);

        // 5. FinanceDirector (Step 3 Final) Approve -> Status menjadi Approved (Fully Approved)
        currentUser.UserId = financeId;
        currentUser.Username = "financedirector";
        currentUser.FullName = "Surya Darmawan (Finance Director)";
        currentUser.Roles = [RoleNames.FinanceDirector];

        var finalRes = await service.ApproveAsync(requestId, new ApprovalActionRequestDto("Budget Capex IT Q4 disetujui."));
        Assert.True(finalRes.Succeeded);
        Assert.Equal("Approved", finalRes.Data!.Status);
        Assert.Null(finalRes.Data.CurrentApproverRole);
        Assert.NotNull(finalRes.Data.CompletedAt);
        Assert.All(finalRes.Data.ApprovalSteps, s => Assert.Equal("Approved", s.Status));
        Assert.Contains(eventBus.PublishedEvents, e => e.Action == "FULLY_APPROVED" && e.SourceService == "Workflow.Api");
    }

    [Fact]
    public async Task WorkflowService_AntiSelfApproval_And_RevisionResubmitCycle_ShouldEnforceSecurity()
    {
        var (_, uow) = await CreateSeededWorkflowAsync();
        var cache = CreateTestCacheService();
        var eventBus = new InMemoryEventBus();

        var managerId = Guid.NewGuid();
        var staffId = Guid.NewGuid();

        // Kasus A: Manager submit form sendiri -> tidak boleh approve form sendiri (403 Anti-Self-Approval)
        var currentUser = new FakeCurrentUserService
        {
            UserId = managerId,
            Username = "manager",
            FullName = "Andi Pratama (Manager)",
            Roles = [RoleNames.Manager]
        };
        var service = new WorkflowService(uow, currentUser, cache, eventBus);

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

        // Kasus B: Staff submit -> Manager minta revisi -> Staff edit & resubmit -> kembali InReview
        currentUser.UserId = staffId;
        currentUser.Username = "staff";
        currentUser.FullName = "Dewi Lestari (Staff)";
        currentUser.Roles = [RoleNames.Staff];

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
        currentUser.UserId = managerId;
        currentUser.Username = "manager";
        currentUser.Roles = [RoleNames.Manager];

        var revRes = await service.RequestRevisionAsync(supplyId, new ApprovalActionRequestDto("Lampirkan tipe kursi dan vendornya."));
        Assert.True(revRes.Succeeded);
        Assert.Equal("RevisionRequested", revRes.Data!.Status);

        // Orang lain (Manager) mencoba mengedit form milik Staff -> HARUS 403!
        var illegalEdit = await service.ResubmitRequestAsync(supplyId, new UpdateAndResubmitWorkflowRequestDto(
            Title: "Diedit bukan pemilik",
            FormData: supplyReq.Data.FormData,
            ResubmitNotes: "Coba edit paksa"));
        Assert.False(illegalEdit.Succeeded);
        Assert.Equal(403, illegalEdit.StatusCode);

        // Staff (pemilik asli) merevisi & submit ulang -> sukses kembali ke InReview Step 1
        currentUser.UserId = staffId;
        currentUser.Username = "staff";
        currentUser.Roles = [RoleNames.Staff];

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

    private sealed class FakeHostEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Development";
        public string ApplicationName { get; set; } = "Announcement.Api.Tests";
        public string ContentRootPath { get; set; } = Path.Combine(Path.GetTempPath(), "nsp-ann-tests");
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    private static async Task<(AnnouncementDbContext Db, AnnouncementUnitOfWork Uow)> CreateSeededAnnouncementAsync()
    {
        var options = new DbContextOptionsBuilder<AnnouncementDbContext>()
            .UseInMemoryDatabase($"AnnouncementTestDb_{Guid.NewGuid()}")
            .Options;

        var db = new AnnouncementDbContext(options);
        var seeder = new AnnouncementDatabaseSeeder(db, new FakeHostEnvironment(), NullLogger<AnnouncementDatabaseSeeder>.Instance);
        await seeder.SeedAsync();

        var uow = new AnnouncementUnitOfWork(db);
        return (db, uow);
    }

    [Fact]
    public async Task AnnouncementService_HrRoleGuard_And_XssSanitization_ShouldBlockNonHrAndSanitizeHtml()
    {
        var (_, uow) = await CreateSeededAnnouncementAsync();
        var cache = CreateTestCacheService();
        var eventBus = new InMemoryEventBus();

        // 1. Non-HR (Staff biasa) mencoba publish -> HARUS 403 Forbidden!
        var currentUser = new FakeCurrentUserService
        {
            UserId = Guid.NewGuid(),
            Username = "staff",
            FullName = "Dewi Lestari (Staff)",
            Roles = [RoleNames.Staff],
            Permissions = [Permissions.Announcements.View]
        };

        var service = new AnnouncementService(uow, currentUser, cache, eventBus);
        var blocked = await service.CreateAnnouncementAsync(new CreateOrUpdateAnnouncementRequest(
            Title: "Pengumuman Ilegal Staff",
            Summary: null,
            Type: "General",
            ContentHtml: "<p>Coba publish</p>",
            BannerUrl: null,
            AllowComments: true));

        Assert.False(blocked.Succeeded);
        Assert.Equal(403, blocked.StatusCode);

        // 2. HRStaff publish dengan tag <script> berbahaya -> HARUS sukses 201 & tag <script> dibersihkan!
        currentUser.Username = "hrstaff";
        currentUser.FullName = "Nadia Putri (HR Staff)";
        currentUser.Roles = [RoleNames.HRStaff];
        currentUser.Permissions = [Permissions.Announcements.View, Permissions.Announcements.Manage];

        var created = await service.CreateAnnouncementAsync(new CreateOrUpdateAnnouncementRequest(
            Title: "Pengumuman Resmi HR",
            Summary: null,
            Type: "HRPolicy",
            ContentHtml: "<p><strong>Penting:</strong> <em>Wajib baca</em></p><script>alert('xss')</script>",
            BannerUrl: "/api/announcements/files/seed-banner-hr-policy.svg",
            AllowComments: true));

        Assert.True(created.Succeeded);
        Assert.Equal(201, created.StatusCode);
        Assert.DoesNotContain("<script>", created.Data!.ContentHtml, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("<strong>Penting:</strong>", created.Data.ContentHtml);
        Assert.Contains(eventBus.PublishedEvents, e => e.Action == "PUBLISH_ANNOUNCEMENT" && e.SourceService == "Announcement.Api");
    }

    [Fact]
    public async Task AnnouncementService_Pagination10PerPage_BellUnread_And_MarkRead_ShouldWork()
    {
        var (_, uow) = await CreateSeededAnnouncementAsync();
        var currentUser = new FakeCurrentUserService
        {
            UserId = Guid.NewGuid(),
            Username = "staff",
            FullName = "Dewi Lestari (Staff)",
            Roles = [RoleNames.Staff],
            Permissions = [Permissions.Announcements.View]
        };

        var service = new AnnouncementService(uow, currentUser, CreateTestCacheService(), new InMemoryEventBus());

        // 1. Total 12 seeded items -> Page 1 harus 10 item, Page 2 harus 2 item
        var page1 = await service.GetAnnouncementsAsync(page: 1, pageSize: 10);
        var page2 = await service.GetAnnouncementsAsync(page: 2, pageSize: 10);

        Assert.True(page1.Succeeded);
        Assert.Equal(12, page1.Data!.TotalCount);
        Assert.Equal(2, page1.Data.TotalPages);
        Assert.Equal(10, page1.Data.Items.Count);
        Assert.Equal(2, page2.Data!.Items.Count);

        // 2. Bell dropdown awal menunjukkan 12 belum dibaca
        var bellBefore = await service.GetBellFeedAsync();
        Assert.Equal(12, bellBefore.Data!.UnreadCount);
        Assert.NotEmpty(bellBefore.Data.Items);

        // 3. Buka 1 detail -> otomatis tertandai sudah dibaca (UnreadCount jadi 11)
        var firstId = page1.Data.Items[0].Id;
        var detail = await service.GetAnnouncementByIdAsync(firstId, markAsRead: true);
        Assert.True(detail.Succeeded);
        Assert.True(detail.Data!.IsReadByMe);

        var bellAfterOne = await service.GetBellFeedAsync();
        Assert.Equal(11, bellAfterOne.Data!.UnreadCount);

        // 4. Mark all read -> UnreadCount 0, Bell tetap menampilkan 3 pengumuman terbaru
        await service.MarkAllAsReadAsync();
        var bellAfterAll = await service.GetBellFeedAsync();
        Assert.Equal(0, bellAfterAll.Data!.UnreadCount);
        Assert.Equal(3, bellAfterAll.Data.Items.Count);
    }

    [Fact]
    public async Task AnnouncementService_LikeToggle_And_PostPublishCommentToggle_ShouldEnforceState()
    {
        var (_, uow) = await CreateSeededAnnouncementAsync();
        var cache = CreateTestCacheService();
        var eventBus = new InMemoryEventBus();

        var hrSupervisorId = Guid.NewGuid();
        var staffId = Guid.NewGuid();

        var currentUser = new FakeCurrentUserService
        {
            UserId = hrSupervisorId,
            Username = "hrsupervisor",
            FullName = "Dimas Prakoso (HR Supervisor)",
            Roles = [RoleNames.HRSupervisor],
            Permissions = [Permissions.Announcements.View, Permissions.Announcements.Manage]
        };

        var service = new AnnouncementService(uow, currentUser, cache, eventBus);

        // 1. HRSupervisor buat pengumuman dengan AllowComments = true
        var created = await service.CreateAnnouncementAsync(new CreateOrUpdateAnnouncementRequest(
            Title: "Info Gathering Tahunan",
            Summary: "Diskusi lokasi gathering.",
            Type: "Event",
            ContentHtml: "<p>Yuk vote lokasi gathering di komentar!</p>",
            BannerUrl: null,
            AllowComments: true));

        var annId = created.Data!.Id;

        // 2. Staff melakukan Like & tambah Komentar -> Sukses
        currentUser.UserId = staffId;
        currentUser.Username = "staff";
        currentUser.FullName = "Dewi Lestari (Staff)";
        currentUser.Roles = [RoleNames.Staff];
        currentUser.Permissions = [Permissions.Announcements.View];

        var like1 = await service.ToggleLikeAsync(annId);
        Assert.True(like1.Data!.IsLiked);
        Assert.Equal(1, like1.Data.LikeCount);

        var comment1 = await service.AddCommentAsync(annId, new CreateCommentRequest("Usul di Bandung aja!"));
        Assert.True(comment1.Succeeded);
        Assert.Equal(201, comment1.StatusCode);

        // 3. Setelah dipublish, HRSupervisor mematikan komentar -> Staff tidak bisa komentar lagi (400)
        currentUser.UserId = hrSupervisorId;
        currentUser.Username = "hrsupervisor";
        currentUser.Roles = [RoleNames.HRSupervisor];
        currentUser.Permissions = [Permissions.Announcements.View, Permissions.Announcements.Manage];

        var toggleOff = await service.ToggleCommentsAsync(annId, new ToggleCommentsRequest(false));
        Assert.True(toggleOff.Succeeded);
        Assert.False(toggleOff.Data!.AllowComments);

        currentUser.UserId = staffId;
        currentUser.Username = "staff";
        currentUser.Roles = [RoleNames.Staff];
        currentUser.Permissions = [Permissions.Announcements.View];

        var blockedComment = await service.AddCommentAsync(annId, new CreateCommentRequest("Coba komentar pas mati"));
        Assert.False(blockedComment.Succeeded);
        Assert.Equal(400, blockedComment.StatusCode);

        // 4. HRManager mengaktifkan komentar lagi -> Staff bisa komentar lagi!
        currentUser.UserId = Guid.NewGuid();
        currentUser.Username = "hrmanager";
        currentUser.Roles = [RoleNames.HRManager];
        currentUser.Permissions = [Permissions.Announcements.View, Permissions.Announcements.Manage];

        var toggleOn = await service.ToggleCommentsAsync(annId, new ToggleCommentsRequest(true));
        Assert.True(toggleOn.Succeeded);
        Assert.True(toggleOn.Data!.AllowComments);

        currentUser.UserId = staffId;
        currentUser.Username = "staff";
        currentUser.Roles = [RoleNames.Staff];
        currentUser.Permissions = [Permissions.Announcements.View];

        var comment2 = await service.AddCommentAsync(annId, new CreateCommentRequest("Sip sudah dibuka lagi!"));
        Assert.True(comment2.Succeeded);

        // 5. Reply berjenjang + emoji (ParentCommentId) & auto-flatten jika reply-to-reply
        var reply1 = await service.AddCommentAsync(annId, new CreateCommentRequest("Setuju banget! 🎉🔥", comment1.Data!.Id));
        Assert.True(reply1.Succeeded);
        Assert.Equal(comment1.Data.Id, reply1.Data!.ParentCommentId);
        Assert.Contains("🎉🔥", reply1.Data.Content);

        var replyToReply = await service.AddCommentAsync(annId, new CreateCommentRequest("Ikutan juga ya 👍", reply1.Data.Id));
        Assert.True(replyToReply.Succeeded);
        Assert.Equal(comment1.Data.Id, replyToReply.Data!.ParentCommentId);
    }
}
