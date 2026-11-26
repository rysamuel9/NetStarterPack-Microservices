using BuildingBlocks.Core.Common;
using BuildingBlocks.Core.Constants;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NetStarterPack.Microservices.UnitTests.Common.Factories;
using NetStarterPack.Microservices.UnitTests.Common.TestDoubles;
using Tracking.Api.Application.DTOs;
using Tracking.Api.Application.Interfaces;
using Tracking.Api.Application.Services;
using Tracking.Api.Infrastructure.Persistence;

namespace NetStarterPack.Microservices.UnitTests.Services.Tracking;

public class TrackingServiceTests
{
    private sealed class FakeTrackingRealtimeNotifier : ITrackingRealtimeNotifier
    {
        public List<string> Events { get; } = [];

        public Task NotifyLocationUpdatedAsync(LivePositionCacheDto position, CancellationToken cancellationToken = default)
        {
            Events.Add($"Location:{position.AssignmentCode}:{position.Latitude:F4},{position.Longitude:F4}");
            return Task.CompletedTask;
        }

        public Task NotifyStatusChangedAsync(TrackingSummaryDto summary, string action, string? note = null, CancellationToken cancellationToken = default)
        {
            Events.Add($"Status:{summary.AssignmentCode}:{action}");
            return Task.CompletedTask;
        }

        public Task NotifyAssignmentCreatedAsync(TrackingSummaryDto summary, CancellationToken cancellationToken = default)
        {
            Events.Add($"Created:{summary.AssignmentCode}");
            return Task.CompletedTask;
        }
    }

    private static (TrackingDbContext Db, TrackingUnitOfWork Uow) CreateTrackingDb()
    {
        var options = new DbContextOptionsBuilder<TrackingDbContext>()
            .UseInMemoryDatabase($"TrackingTestDb_{Guid.NewGuid():N}")
            .Options;
        var db = new TrackingDbContext(options);
        db.Database.EnsureCreated();
        return (db, new TrackingUnitOfWork(db));
    }

    [Fact]
    public void GeoDistanceCalculator_ShouldCalculateHaversineAndRejectInvalidCoords()
    {
        // Monas -> Menara Sudirman (~5.8 km)
        var meters = GeoDistanceCalculator.CalculateHaversineMeters(-6.175392, 106.827153, -6.224495, 106.807755);
        Assert.InRange(meters, 5500, 6200);

        Assert.True(GeoDistanceCalculator.IsValidCoordinate(-6.2, 106.8));
        Assert.False(GeoDistanceCalculator.IsValidCoordinate(0, 0));
        Assert.False(GeoDistanceCalculator.IsValidCoordinate(95, 106.8));
        Assert.False(GeoDistanceCalculator.IsValidCoordinate(-6.2, 200));
    }

    [Fact]
    public async Task FullLifecycle_DownsampledPing_And_GeofenceAutoComplete_ShouldSucceed()
    {
        using var db = CreateTrackingDb().Db;
        var uow = new TrackingUnitOfWork(db);
        var cache = TestCacheFactory.CreateInMemory();
        var eventBus = new InMemoryEventBus();
        var realtime = new FakeTrackingRealtimeNotifier();

        var managerId = Guid.NewGuid();
        var staffId = Guid.NewGuid();
        var currentUser = FakeCurrentUserService.AsUser(
            "manager", "Andi Pratama", [RoleNames.Manager],
            [Permissions.Tracking.View, Permissions.Tracking.Dispatch, Permissions.Tracking.Operate], managerId);

        var service = new TrackingService(uow, currentUser, cache, eventBus, realtime);

        // 1. Dispatcher membuat tugas
        var created = await service.CreateAssignmentAsync(new CreateTrackingAssignmentRequest(
            Title: "Kirim Server Rack ke SCBD",
            TaskType: "Delivery",
            ReferenceCode: "ORD-2026-999",
            Notes: "Hati-hati barang elektronik",
            AssigneeUserId: staffId,
            AssigneeUsername: "staff",
            AssigneeFullName: "Dewi Lestari",
            OriginLabel: "HQ Monas",
            OriginLatitude: -6.175392,
            OriginLongitude: 106.827153,
            DestinationLabel: "Menara Sudirman",
            DestinationAddress: "Jl. Sudirman Kav 60",
            DestinationLatitude: -6.224495,
            DestinationLongitude: 106.807755,
            GeofenceRadiusMeters: 200));

        Assert.True(created.Succeeded);
        Assert.Equal(201, created.StatusCode);
        var assignmentId = created.Data!.Summary.Id;

        // 2. Staff memulai perjalanan
        currentUser.SwitchTo(staffId, "staff", "Dewi Lestari", [RoleNames.Staff], [Permissions.Tracking.View, Permissions.Tracking.Operate]);
        var started = await service.StartTripAsync(assignmentId, new StartTripRequest(-6.175392, 106.827153));
        Assert.True(started.Succeeded);
        Assert.Equal("InTransit", started.Data!.Summary.Status);

        // 3. Ping kecil (~5m < 30m threshold) -> masuk Hot Cache & SignalR, TIDAK spam DB
        var tinyPing = await service.RecordLocationPingAsync(assignmentId, new LocationPingRequest(-6.175420, 106.827153, 10, 2.0, false));
        Assert.True(tinyPing.Succeeded);
        Assert.False(tinyPing.Data!.PersistedToDatabase);

        // 4. Ping signifikan (~200m >= 30m threshold) -> disimpan ke DB breadcrumb
        var movedPing = await service.RecordLocationPingAsync(assignmentId, new LocationPingRequest(-6.177200, 106.827153, 10, 8.0, false));
        Assert.True(movedPing.Succeeded);
        Assert.True(movedPing.Data!.PersistedToDatabase);

        // 5. Complete di dalam radius geofence (jarak ~10m) dengan POD internal valid -> otomatis Completed
        var completed = await service.CompleteAssignmentAsync(assignmentId, new CompleteAssignmentRequest(
            RecipientName: "Pak Budi (IT Gedung)",
            Notes: "Diterima utuh",
            PodPhotoUrl: "/api/v1/tracking/files/pod_test.jpg",
            Latitude: -6.224450,
            Longitude: 106.807755));

        Assert.True(completed.Succeeded);
        Assert.Equal("Completed", completed.Data!.Summary.Status);
        Assert.True(completed.Data.Summary.IsInsideGeofence);
        Assert.Contains(realtime.Events, e => e.StartsWith("Location:"));
        Assert.Contains(eventBus.PublishedEvents, e => e.Action == "COMPLETE_TRACKING_ASSIGNMENT");
    }

    [Fact]
    public async Task OutsideGeofenceOrMockGps_ShouldForcePendingVerification_AndEnforceAntiIdor()
    {
        var (db, uow) = CreateTrackingDb();
        using var _ = db;
        var seeder = new TrackingDatabaseSeeder(db, NullLogger<TrackingDatabaseSeeder>.Instance);
        await seeder.SeedAsync();

        var cache = TestCacheFactory.CreateInMemory();
        var eventBus = new InMemoryEventBus();

        var staffA = FakeCurrentUserService.AsUser("staff", "Dewi Lestari", [RoleNames.Staff], [Permissions.Tracking.View, Permissions.Tracking.Operate]);
        var service = new TrackingService(uow, staffA, cache, eventBus);

        var myList = await service.GetAssignmentsAsync();
        var activeTrip = myList.Data!.First(a => a.Status == "InTransit");

        // 1. Anti-IDOR: Staff lain tidak boleh melihat atau mengirim ping ke tugas milik "staff"
        var staffB = FakeCurrentUserService.AsUser("other.staff", "Staff Lain", [RoleNames.Staff], [Permissions.Tracking.View, Permissions.Tracking.Operate]);
        var serviceForB = new TrackingService(uow, staffB, cache, eventBus);
        var listForB = await serviceForB.GetAssignmentsAsync();
        Assert.Empty(listForB.Data!);

        var unauthorizedDetail = await serviceForB.GetByIdAsync(activeTrip.Id);
        Assert.False(unauthorizedDetail.Succeeded);
        Assert.Equal(403, unauthorizedDetail.StatusCode);

        var unauthorizedPing = await serviceForB.RecordLocationPingAsync(activeTrip.Id, new LocationPingRequest(-6.21, 106.81));
        Assert.False(unauthorizedPing.Succeeded);
        Assert.Equal(403, unauthorizedPing.StatusCode);

        // 2. Anti-Fraud: Mock GPS flag -> menandai suspicious & publish GPS_ANOMALY_DETECTED
        var mockPing = await service.RecordLocationPingAsync(activeTrip.Id, new LocationPingRequest(-6.224495, 106.807755, 10, 0, IsMocked: true));
        Assert.True(mockPing.Succeeded);
        Assert.True(mockPing.Data!.IsSuspicious);
        Assert.Contains(eventBus.PublishedEvents, e => e.Action == "GPS_ANOMALY_DETECTED");

        // 3. Complete saat sudah flagged suspicious -> WAJIB PendingVerification meski koordinat di titik tujuan
        var submitPod = await service.CompleteAssignmentAsync(activeTrip.Id, new CompleteAssignmentRequest(
            RecipientName: "Resepsionis",
            Notes: "Coba selesaikan",
            PodPhotoUrl: null,
            Latitude: -6.224495,
            Longitude: 106.807755));

        Assert.True(submitPod.Succeeded);
        Assert.Equal("PendingVerification", submitPod.Data!.Summary.Status);

        // 4. Staff biasa tidak boleh approve verifikasi sendiri (403); Manager bisa approve (200)
        var selfVerify = await service.VerifyAssignmentAsync(activeTrip.Id, new VerifyAssignmentRequest(true, "Approve sendiri"));
        Assert.False(selfVerify.Succeeded);
        Assert.Equal(403, selfVerify.StatusCode);

        var manager = FakeCurrentUserService.AsUser("manager", "Andi Pratama", [RoleNames.Manager], [Permissions.Tracking.View, Permissions.Tracking.Dispatch]);
        var managerService = new TrackingService(uow, manager, cache, eventBus);
        var approved = await managerService.VerifyAssignmentAsync(activeTrip.Id, new VerifyAssignmentRequest(true, "Diverifikasi manual setelah konfirmasi telepon."));
        Assert.True(approved.Succeeded);
        Assert.Equal("Completed", approved.Data!.Summary.Status);

        // 5. Seeder idempotent (dipanggil ulang tidak duplikat) & Viewer (Auditor) bisa lihat semua tugas secara read-only
        await seeder.SeedAsync();
        var viewer = FakeCurrentUserService.AsUser("viewer", "Rizky Ramadhan", [RoleNames.Viewer], [Permissions.Tracking.View]);
        var viewerService = new TrackingService(uow, viewer, cache, eventBus);
        var viewerList = await viewerService.GetAssignmentsAsync();
        Assert.True(viewerList.Succeeded);
        Assert.Equal(10, viewerList.Data!.Count);

        var viewerCannotCancel = await viewerService.CancelAssignmentAsync(activeTrip.Id, new CancelAssignmentRequest("Test"));
        Assert.False(viewerCannotCancel.Succeeded);
        Assert.Equal(403, viewerCannotCancel.StatusCode);
    }
}
