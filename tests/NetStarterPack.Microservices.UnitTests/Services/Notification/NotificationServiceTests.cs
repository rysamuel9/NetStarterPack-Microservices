using BuildingBlocks.Core.Constants;
using BuildingBlocks.Core.Contracts;
using Identity.Api.Application.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using NetStarterPack.Microservices.UnitTests.Common.Factories;
using NetStarterPack.Microservices.UnitTests.Common.TestDoubles;
using Notification.Api.Application.DTOs;
using Notification.Api.Application.Interfaces;
using Notification.Api.Application.Services;
using Notification.Api.Domain.Entities;
using Notification.Api.Infrastructure.Persistence;
using Notification.Api.Infrastructure.Senders;
using Notification.Api.Infrastructure.Templating;
using Notification.Api.Infrastructure.Workers;

namespace NetStarterPack.Microservices.UnitTests.Services.Notification;

public class NotificationServiceTests
{
    private static EmailSettings CreateDefaultEmailSettings() => new()
    {
        ActiveProvider = "Office365",
        EnableSending = true,
        AppName = "NetStarterPack",
        AppBaseUrl = "http://localhost:5173",
        DevOverrideRecipient = "ronysamuel19@gmail.com"
    };

    private static async Task<(NotificationDbContext Db, NotificationUnitOfWork Uow, ScribanEmailTemplateRenderer Renderer)> CreateNotificationDbAsync()
    {
        var options = new DbContextOptionsBuilder<NotificationDbContext>()
            .UseInMemoryDatabase($"NotificationTestDb_{Guid.NewGuid()}")
            .Options;

        var db = new NotificationDbContext(options);
        var hostEnv = new FakeHostEnvironment();
        var renderer = new ScribanEmailTemplateRenderer(
            hostEnv,
            Options.Create(CreateDefaultEmailSettings()),
            NullLogger<ScribanEmailTemplateRenderer>.Instance);

        var seeder = new NotificationDatabaseSeeder(db, renderer, NullLogger<NotificationDatabaseSeeder>.Instance);
        await seeder.SeedAsync();

        return (db, new NotificationUnitOfWork(db), renderer);
    }

    [Fact]
    public async Task ScribanRenderer_ShouldEscapeHtmlVariables_AndWrapInBaseLayout()
    {
        using var hostEnv = new FakeHostEnvironment();
        var renderer = new ScribanEmailTemplateRenderer(
            hostEnv,
            Options.Create(CreateDefaultEmailSettings()),
            NullLogger<ScribanEmailTemplateRenderer>.Instance);

        var rendered = await renderer.RenderAsync(
            subjectTemplate: "[Ditolak] {{ document_number }}",
            bodyHtmlTemplate: "<p>Halo {{ recipient_name }}</p><div>{{ notes }}</div>",
            accentColor: "#DC2626",
            actionLabel: "Lihat Detail",
            actionUrl: "/workflow-tracking",
            variables: new()
            {
                ["document_number"] = "WF-2026-0099",
                ["recipient_name"] = "Dewi Lestari",
                ["notes"] = "<script>alert('xss')</script> Budget melebihi batas",
                ["category"] = "Workflow"
            },
            devRedirectOriginalEmail: "staff@starterpack.local");

        Assert.Equal("[Ditolak] WF-2026-0099", rendered.Subject);
        Assert.DoesNotContain("<script>", rendered.HtmlBody);
        Assert.Contains("&lt;script&gt;", rendered.HtmlBody);
        Assert.Contains("Budget melebihi batas", rendered.HtmlBody);
        Assert.Contains("http://localhost:5173/workflow-tracking", rendered.HtmlBody);
    }

    [Fact]
    public async Task IngestEvent_ShouldRespectUserPreferences_AndEnqueueEmailAndPush()
    {
        var (db, uow, renderer) = await CreateNotificationDbAsync();
        using var _ = db;

        var user1 = Guid.NewGuid();
        var user2 = Guid.NewGuid();

        // User 2 mematikan Email untuk Workflow, tapi tetap aktif In-App & Push
        await uow.Preferences.AddAsync(new NotificationPreference
        {
            UserId = user2,
            Category = NotificationCategories.Workflow,
            InAppEnabled = true,
            EmailEnabled = false,
            PushEnabled = true
        });
        await uow.PushDevices.AddAsync(new UserPushDevice
        {
            UserId = user1,
            Username = "manager",
            PushToken = "ExponentPushToken[test-token-user1]",
            Platform = "android",
            DeviceName = "Pixel 9",
            IsActive = true
        });
        await uow.SaveChangesAsync();

        var fakeRecipients = new FakeIdentityRecipientClient([
            new ResolvedRecipientDto(user1, "manager", "Andi Pratama", "manager@starterpack.local", [RoleNames.Manager]),
            new ResolvedRecipientDto(user2, "admin", "Siti Rahmawati", "admin@starterpack.local", [RoleNames.Admin])
        ]);
        var fakeEmailSender = new FakeEmailSender();
        var fakePushSender = new FakePushSender();
        var fakeRealtime = new FakeNotificationRealtimeNotifier();

        var service = new NotificationService(
            uow,
            new FakeCurrentUserService { UserId = user1, Username = "manager", FullName = "Andi Pratama" },
            TestCacheFactory.CreateInMemory(),
            new InMemoryEventBus(),
            fakeRecipients,
            renderer,
            fakeEmailSender,
            fakePushSender,
            fakeRealtime,
            Options.Create(CreateDefaultEmailSettings()),
            NullLogger<NotificationService>.Instance);

        var result = await service.IngestEventAsync(new NotificationIntegrationEvent(
            TemplateCode: NotificationTemplateCodes.WorkflowSubmitted,
            Category: NotificationCategories.Workflow,
            Title: "Pengajuan Baru: WF-2026-0100",
            Message: "Dewi mengajukan pengadaan laptop.",
            TargetRoles: [RoleNames.Manager, RoleNames.Admin],
            Variables: new()
            {
                ["document_number"] = "WF-2026-0100",
                ["form_name"] = "Pengadaan Laptop",
                ["title"] = "MacBook Pro",
                ["requester_name"] = "Dewi Lestari",
                ["step_name"] = "Approval Manager"
            },
            ActionUrl: "/workflow-working-list",
            SourceService: "Workflow.Api"));

        Assert.True(result.Succeeded);
        Assert.Equal(2, result.Data);

        // Kedua user dapat In-App + SignalR
        Assert.Equal(2, await db.Notifications.CountAsync());
        Assert.Equal(2, fakeRealtime.Received.Count);

        // Hanya user1 dapat Email (user2 mematikan email di preference), dan user1 dapat Push
        var emailLogs = await db.DeliveryLogs.Where(d => d.Channel == DeliveryChannel.Email).ToListAsync();
        var pushLogs = await db.DeliveryLogs.Where(d => d.Channel == DeliveryChannel.Push).ToListAsync();

        Assert.Single(emailLogs);
        Assert.Equal("manager@starterpack.local", emailLogs[0].RecipientEmail);
        Assert.Equal("ronysamuel19@gmail.com", emailLogs[0].EffectiveRecipientEmail);
        Assert.Equal(DeliveryStatus.Pending, emailLogs[0].Status);

        Assert.Single(pushLogs);
        Assert.Equal("ExponentPushToken[test-token-user1]", pushLogs[0].RecipientPushToken);
    }

    [Fact]
    public async Task MarkAsRead_And_MarkAllAsRead_ShouldUpdateUnreadCount()
    {
        var (db, uow, renderer) = await CreateNotificationDbAsync();
        using var _ = db;

        var userId = Guid.NewGuid();
        var item1 = new NotificationItem { UserId = userId, Category = "Workflow", Title = "A", Message = "Msg A", IsRead = false };
        var item2 = new NotificationItem { UserId = userId, Category = "Order", Title = "B", Message = "Msg B", IsRead = false };
        await uow.Notifications.AddRangeAsync([item1, item2]);
        await uow.SaveChangesAsync();

        var service = new NotificationService(
            uow,
            new FakeCurrentUserService { UserId = userId, Username = "staff" },
            TestCacheFactory.CreateInMemory(),
            new InMemoryEventBus(),
            new FakeIdentityRecipientClient([]),
            renderer,
            new FakeEmailSender(),
            new FakePushSender(),
            new FakeNotificationRealtimeNotifier(),
            Options.Create(CreateDefaultEmailSettings()),
            NullLogger<NotificationService>.Instance);

        var bellBefore = await service.GetBellSummaryAsync();
        Assert.Equal(2, bellBefore.Data!.UnreadCount);

        await service.MarkAsReadAsync(item1.Id);
        var bellMid = await service.GetBellSummaryAsync();
        Assert.Equal(1, bellMid.Data!.UnreadCount);

        var markAllRes = await service.MarkAllAsReadAsync();
        Assert.Equal(1, markAllRes.Data);

        var bellAfter = await service.GetBellSummaryAsync();
        Assert.Equal(0, bellAfter.Data!.UnreadCount);
    }

    [Fact]
    public async Task SendTestEmail_And_UpdateTemplate_ShouldWorkCleanly()
    {
        var (db, uow, renderer) = await CreateNotificationDbAsync();
        using var _ = db;

        var fakeEmail = new FakeEmailSender();
        var eventBus = new InMemoryEventBus();
        var service = new NotificationService(
            uow,
            new FakeCurrentUserService { UserId = Guid.NewGuid(), Username = "superadmin", Roles = [RoleNames.SuperAdmin] },
            TestCacheFactory.CreateInMemory(),
            eventBus,
            new FakeIdentityRecipientClient([]),
            renderer,
            fakeEmail,
            new FakePushSender(),
            new FakeNotificationRealtimeNotifier(),
            Options.Create(CreateDefaultEmailSettings()),
            NullLogger<NotificationService>.Instance);

        var updateRes = await service.UpdateTemplateAsync(
            NotificationTemplateCodes.WorkflowRejected,
            new UpdateNotificationTemplateRequest(
                Name: "Pengajuan Ditolak (Custom)",
                Description: "Custom desc",
                SubjectTemplate: "[REJECTED] {{ document_number }}",
                BodyHtmlTemplate: "<p>Ditolak: {{ notes }}</p>",
                AccentColor: "#B91C1C",
                ActionLabel: "Cek Alasan",
                DefaultSendInApp: true,
                DefaultSendEmail: true,
                DefaultSendPush: true,
                IsActive: true));

        Assert.True(updateRes.Succeeded);
        Assert.Single(eventBus.PublishedEvents);

        var testRes = await service.SendTestEmailAsync(
            NotificationTemplateCodes.WorkflowRejected,
            new SendTestEmailRequest("ronysamuel19@gmail.com"));

        Assert.True(testRes.Succeeded);
        Assert.Single(fakeEmail.SentEmails);
        Assert.Equal("ronysamuel19@gmail.com", fakeEmail.SentEmails[0].ToEmail);
        Assert.Contains("[TEST] [REJECTED]", fakeEmail.SentEmails[0].Subject);
    }

    [Fact]
    public async Task DispatcherWorker_ShouldRetryFailedDelivery_ThenMarkSent()
    {
        var dbName = $"NotificationWorkerDb_{Guid.NewGuid()}";
        var fakeEmail = new FakeEmailSender { FailNextCount = 1 };
        var fakePush = new FakePushSender();

        var services = new ServiceCollection();
        services.AddDbContext<NotificationDbContext>(o => o.UseInMemoryDatabase(dbName));
        services.AddSingleton<IEmailSender>(fakeEmail);
        services.AddSingleton<IPushNotificationSender>(fakePush);
        await using var provider = services.BuildServiceProvider();

        using (var seedScope = provider.CreateScope())
        {
            var db = seedScope.ServiceProvider.GetRequiredService<NotificationDbContext>();
            await db.DeliveryLogs.AddAsync(new NotificationDeliveryLog
            {
                RecipientName = "Rony",
                RecipientEmail = "ronysamuel19@gmail.com",
                TemplateCode = NotificationTemplateCodes.WorkflowApproved,
                Category = NotificationCategories.Workflow,
                Channel = DeliveryChannel.Email,
                Subject = "Test Retry",
                BodyPreview = "Body",
                RenderedHtml = "<p>Body</p>",
                Status = DeliveryStatus.Pending,
                MaxAttempts = 3
            });
            await db.SaveChangesAsync();
        }

        var worker = new NotificationDispatcherWorker(
            provider.GetRequiredService<IServiceScopeFactory>(),
            NullLogger<NotificationDispatcherWorker>.Instance);

        // Percobaan 1 gagal -> dijadwalkan ulang ke Pending dengan AttemptCount=1 & NextRetryAt
        await worker.ProcessPendingDeliveriesAsync();
        using (var checkScope = provider.CreateScope())
        {
            var db = checkScope.ServiceProvider.GetRequiredService<NotificationDbContext>();
            var log = await db.DeliveryLogs.FirstAsync();
            Assert.Equal(DeliveryStatus.Pending, log.Status);
            Assert.Equal(1, log.AttemptCount);
            Assert.NotNull(log.NextRetryAt);

            // Majukan waktu retry supaya langsung diproses di percobaan ke-2
            log.NextRetryAt = DateTime.UtcNow.AddSeconds(-1);
            await db.SaveChangesAsync();
        }

        // Percobaan 2 berhasil -> status Sent
        await worker.ProcessPendingDeliveriesAsync();
        using (var checkScope2 = provider.CreateScope())
        {
            var db = checkScope2.ServiceProvider.GetRequiredService<NotificationDbContext>();
            var log = await db.DeliveryLogs.FirstAsync();
            Assert.Equal(DeliveryStatus.Sent, log.Status);
            Assert.Equal(2, log.AttemptCount);
            Assert.NotNull(log.SentAt);
        }
    }

    [Fact]
    public async Task IdentityUserService_ResolveRecipients_ShouldMatchRoleAndExcludeActor()
    {
        using var ctx = await TestDbFactory.CreateIdentityAsync();
        var userService = new UserService(
            ctx.Uow,
            ctx.Hasher,
            new FakeCurrentUserService { Username = "system" },
            TestCacheFactory.CreateInMemory());

        var managerUser = await ctx.Db.Users.FirstAsync(u => u.Username == "manager");
        var res = await userService.ResolveRecipientsAsync(new ResolveRecipientsRequest(
            RoleNames: [RoleNames.Manager, RoleNames.FinanceDirector],
            ExcludeUserId: managerUser.Id));

        Assert.True(res.Succeeded);
        Assert.DoesNotContain(res.Data!, r => r.UserId == managerUser.Id);
        Assert.Contains(res.Data!, r => r.Username == "financedirector");
    }

    // ================= TEST DOUBLES =================

    private sealed class FakeIdentityRecipientClient(IReadOnlyList<ResolvedRecipientDto> recipients) : IIdentityRecipientClient
    {
        public Task<IReadOnlyList<ResolvedRecipientDto>> ResolveRecipientsAsync(
            ResolveRecipientsRequest request,
            CancellationToken cancellationToken = default) =>
            Task.FromResult(recipients);
    }

    private sealed class FakeEmailSender : IEmailSender
    {
        public int FailNextCount { get; set; }
        public List<(string ToEmail, string Subject, string Html)> SentEmails { get; } = [];

        public Task<EmailSendResult> SendAsync(
            string toEmail,
            string toName,
            string subject,
            string htmlBody,
            CancellationToken cancellationToken = default)
        {
            if (FailNextCount > 0)
            {
                FailNextCount--;
                return Task.FromResult(new EmailSendResult(false, false, "Office365", toEmail, "Simulated SMTP timeout"));
            }

            SentEmails.Add((toEmail, subject, htmlBody));
            return Task.FromResult(new EmailSendResult(true, false, "Office365", toEmail));
        }

        public EmailProviderStatusDto GetProviderStatus() =>
            new("Office365", true, "ronysamuel19@gmail.com", "http://localhost:5173", true, []);
    }

    private sealed class FakePushSender : IPushNotificationSender
    {
        public List<(string Token, string Title)> SentPushes { get; } = [];

        public Task<PushSendResult> SendAsync(
            string pushToken,
            string title,
            string body,
            Dictionary<string, string>? data = null,
            CancellationToken cancellationToken = default)
        {
            SentPushes.Add((pushToken, title));
            return Task.FromResult(new PushSendResult(true, false, "ExpoPush"));
        }
    }

    private sealed class FakeNotificationRealtimeNotifier : INotificationRealtimeNotifier
    {
        public List<(Guid UserId, NotificationItemDto Item, int UnreadCount)> Received { get; } = [];

        public Task NotifyUserAsync(Guid userId, NotificationItemDto notification, int unreadCount, CancellationToken cancellationToken = default)
        {
            Received.Add((userId, notification, unreadCount));
            return Task.CompletedTask;
        }

        public Task NotifyUnreadCountAsync(Guid userId, int unreadCount, CancellationToken cancellationToken = default) =>
            Task.CompletedTask;
    }
}
