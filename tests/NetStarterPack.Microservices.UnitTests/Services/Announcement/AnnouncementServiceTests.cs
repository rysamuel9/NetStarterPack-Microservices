using Announcement.Api.Application.DTOs;
using Announcement.Api.Application.Services;
using BuildingBlocks.Core.Constants;
using NetStarterPack.Microservices.UnitTests.Common.Factories;
using NetStarterPack.Microservices.UnitTests.Common.TestDoubles;

namespace NetStarterPack.Microservices.UnitTests.Services.Announcement;

public class AnnouncementServiceTests
{
    [Fact]
    public async Task CreateAnnouncement_NonHrUser_ShouldBeBlockedWith403()
    {
        using var ctx = await TestDbFactory.CreateAnnouncementAsync();
        var staffUser = FakeCurrentUserService.AsUser(
            "staff", "Dewi Lestari (Staff)", [RoleNames.Staff], [Permissions.Announcements.View]);

        var service = new AnnouncementService(ctx.Uow, staffUser, TestCacheFactory.CreateInMemory(), new InMemoryEventBus());

        var blocked = await service.CreateAnnouncementAsync(new CreateOrUpdateAnnouncementRequest(
            Title: "Pengumuman Ilegal Staff",
            Summary: null,
            Type: "General",
            ContentHtml: "<p>Coba publish</p>",
            BannerUrl: null,
            AllowComments: true));

        Assert.False(blocked.Succeeded);
        Assert.Equal(403, blocked.StatusCode);
    }

    [Fact]
    public async Task CreateAnnouncement_HrStaff_ShouldSanitizeXssScriptAndPublishAuditEvent()
    {
        using var ctx = await TestDbFactory.CreateAnnouncementAsync();
        var eventBus = new InMemoryEventBus();
        var hrStaff = FakeCurrentUserService.AsUser(
            "hrstaff",
            "Nadia Putri (HR Staff)",
            [RoleNames.HRStaff],
            [Permissions.Announcements.View, Permissions.Announcements.Manage]);

        var service = new AnnouncementService(ctx.Uow, hrStaff, TestCacheFactory.CreateInMemory(), eventBus);

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
    public async Task Pagination10PerPage_BellUnread_And_MarkRead_ShouldTrackUserReadState()
    {
        using var ctx = await TestDbFactory.CreateAnnouncementAsync();
        var staffUser = FakeCurrentUserService.AsUser(
            "staff", "Dewi Lestari (Staff)", [RoleNames.Staff], [Permissions.Announcements.View]);

        var service = new AnnouncementService(ctx.Uow, staffUser, TestCacheFactory.CreateInMemory(), new InMemoryEventBus());

        // 1. Total 12 seeded items -> Page 1: 10 item, Page 2: 2 item
        var page1 = await service.GetAnnouncementsAsync(page: 1, pageSize: 10);
        var page2 = await service.GetAnnouncementsAsync(page: 2, pageSize: 10);

        Assert.True(page1.Succeeded);
        Assert.Equal(12, page1.Data!.TotalCount);
        Assert.Equal(2, page1.Data.TotalPages);
        Assert.Equal(10, page1.Data.Items.Count);
        Assert.Equal(2, page2.Data!.Items.Count);

        // 2. Bell awal menunjukkan 12 belum dibaca
        var bellBefore = await service.GetBellFeedAsync();
        Assert.Equal(12, bellBefore.Data!.UnreadCount);
        Assert.NotEmpty(bellBefore.Data.Items);

        // 3. Buka 1 detail -> otomatis mark-as-read (UnreadCount jadi 11)
        var firstId = page1.Data.Items[0].Id;
        var detail = await service.GetAnnouncementByIdAsync(firstId, markAsRead: true);
        Assert.True(detail.Succeeded);
        Assert.True(detail.Data!.IsReadByMe);

        var bellAfterOne = await service.GetBellFeedAsync();
        Assert.Equal(11, bellAfterOne.Data!.UnreadCount);

        // 4. Mark all read -> UnreadCount 0, Bell tetap tampilkan 3 pengumuman terbaru
        await service.MarkAllAsReadAsync();
        var bellAfterAll = await service.GetBellFeedAsync();
        Assert.Equal(0, bellAfterAll.Data!.UnreadCount);
        Assert.Equal(3, bellAfterAll.Data.Items.Count);
    }

    [Fact]
    public async Task ToggleLike_And_PostPublishCommentToggle_ShouldEnforceStateAndEmitRealtimeEvents()
    {
        using var ctx = await TestDbFactory.CreateAnnouncementAsync();
        var realtime = new FakeAnnouncementRealtimeNotifier();
        var hrSupervisorId = Guid.NewGuid();
        var staffId = Guid.NewGuid();

        var currentUser = FakeCurrentUserService.AsUser(
            "hrsupervisor",
            "Dimas Prakoso (HR Supervisor)",
            [RoleNames.HRSupervisor],
            [Permissions.Announcements.View, Permissions.Announcements.Manage],
            hrSupervisorId);

        var service = new AnnouncementService(ctx.Uow, currentUser, TestCacheFactory.CreateInMemory(), new InMemoryEventBus(), realtime);

        var created = await service.CreateAnnouncementAsync(new CreateOrUpdateAnnouncementRequest(
            Title: "Info Gathering Tahunan",
            Summary: "Diskusi lokasi gathering.",
            Type: "Event",
            ContentHtml: "<p>Yuk vote lokasi gathering di komentar!</p>",
            BannerUrl: null,
            AllowComments: true));
        var annId = created.Data!.Id;

        // Staff Like & Komentar saat dibuka -> Sukses
        currentUser.SwitchTo(staffId, "staff", "Dewi Lestari (Staff)", [RoleNames.Staff], [Permissions.Announcements.View]);
        var like1 = await service.ToggleLikeAsync(annId);
        Assert.True(like1.Data!.IsLiked);
        Assert.Equal(1, like1.Data.LikeCount);

        var comment1 = await service.AddCommentAsync(annId, new CreateCommentRequest("Usul di Bandung aja!"));
        Assert.True(comment1.Succeeded);
        Assert.Equal(201, comment1.StatusCode);

        // HRSupervisor mematikan komentar -> Staff diblokir (400)
        currentUser.SwitchTo(hrSupervisorId, "hrsupervisor", "Dimas Prakoso (HR Supervisor)", [RoleNames.HRSupervisor], [Permissions.Announcements.View, Permissions.Announcements.Manage]);
        var toggleOff = await service.ToggleCommentsAsync(annId, new ToggleCommentsRequest(false));
        Assert.True(toggleOff.Succeeded);
        Assert.False(toggleOff.Data!.AllowComments);

        currentUser.SwitchTo(staffId, "staff", "Dewi Lestari (Staff)", [RoleNames.Staff], [Permissions.Announcements.View]);
        var blockedComment = await service.AddCommentAsync(annId, new CreateCommentRequest("Coba komentar pas mati"));
        Assert.False(blockedComment.Succeeded);
        Assert.Equal(400, blockedComment.StatusCode);

        // HRManager mengaktifkan lagi -> Staff bisa komentar lagi
        currentUser.SwitchTo(Guid.NewGuid(), "hrmanager", "HR Manager", [RoleNames.HRManager], [Permissions.Announcements.View, Permissions.Announcements.Manage]);
        var toggleOn = await service.ToggleCommentsAsync(annId, new ToggleCommentsRequest(true));
        Assert.True(toggleOn.Succeeded);
        Assert.True(toggleOn.Data!.AllowComments);

        currentUser.SwitchTo(staffId, "staff", "Dewi Lestari (Staff)", [RoleNames.Staff], [Permissions.Announcements.View]);
        var comment2 = await service.AddCommentAsync(annId, new CreateCommentRequest("Sip sudah dibuka lagi!"));
        Assert.True(comment2.Succeeded);

        Assert.Contains(realtime.Events, e => e.StartsWith("Published:"));
        Assert.Contains(realtime.Events, e => e == "LikeUpdated:1:True");
        Assert.Contains(realtime.Events, e => e == "CommentsToggled:False");
        Assert.Contains(realtime.Events, e => e == "CommentsToggled:True");
    }

    [Fact]
    public async Task Comments_ThreadedReplyWithEmoji_ShouldAutoFlattenReplyToReplyAndEmitRealtimeEvent()
    {
        using var ctx = await TestDbFactory.CreateAnnouncementAsync();
        var realtime = new FakeAnnouncementRealtimeNotifier();
        var currentUser = FakeCurrentUserService.AsUser(
            "hrstaff",
            "Nadia Putri (HR Staff)",
            [RoleNames.HRStaff],
            [Permissions.Announcements.View, Permissions.Announcements.Manage]);

        var service = new AnnouncementService(ctx.Uow, currentUser, TestCacheFactory.CreateInMemory(), new InMemoryEventBus(), realtime);

        var created = await service.CreateAnnouncementAsync(new CreateOrUpdateAnnouncementRequest(
            Title: "Diskusi Fasilitas Kantor",
            Summary: null,
            Type: "General",
            ContentHtml: "<p>Silakan tulis saran di bawah.</p>",
            BannerUrl: null,
            AllowComments: true));
        var annId = created.Data!.Id;

        currentUser.SwitchTo(Guid.NewGuid(), "staff", "Dewi Lestari (Staff)", [RoleNames.Staff], [Permissions.Announcements.View]);

        var rootComment = await service.AddCommentAsync(annId, new CreateCommentRequest("Tambah mesin kopi dong!"));
        var reply1 = await service.AddCommentAsync(annId, new CreateCommentRequest("Setuju banget! 🎉🔥", rootComment.Data!.Id));
        var replyToReply = await service.AddCommentAsync(annId, new CreateCommentRequest("Ikutan juga ya 👍", reply1.Data!.Id));

        Assert.True(reply1.Succeeded);
        Assert.Equal(rootComment.Data.Id, reply1.Data.ParentCommentId);
        Assert.Contains("🎉🔥", reply1.Data.Content);

        // Reply-to-reply harus otomatis di-flatten ke root comment
        Assert.True(replyToReply.Succeeded);
        Assert.Equal(rootComment.Data.Id, replyToReply.Data!.ParentCommentId);
        Assert.Contains(realtime.Events, e => e.StartsWith($"CommentAdded:{reply1.Data.Id}:"));
    }
}
