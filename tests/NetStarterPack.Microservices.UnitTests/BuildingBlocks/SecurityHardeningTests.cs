using System.Security.Cryptography;
using Announcement.Api.Application.DTOs;
using Announcement.Api.Application.Services;
using BuildingBlocks.Core.Constants;
using BuildingBlocks.Security;
using Identity.Api.Application.DTOs;
using Identity.Api.Application.Services;
using Identity.Api.Domain.Entities;
using Identity.Api.Infrastructure.Security;
using NetStarterPack.Microservices.UnitTests.Common.Factories;
using NetStarterPack.Microservices.UnitTests.Common.TestDoubles;
using Workflow.Api.Application.DTOs;
using Workflow.Api.Application.Services;

namespace NetStarterPack.Microservices.UnitTests.BuildingBlocks;

public class SecurityHardeningTests
{
    [Fact]
    public async Task UserService_NonSuperAdmin_ShouldBeBlockedFromSuperAdminEscalationAndModification()
    {
        using var ctx = await TestDbFactory.CreateIdentityAsync();
        var superAdmin = await ctx.Uow.Users.FirstOrDefaultAsync(u => u.Username == "superadmin");
        var staff = await ctx.Uow.Users.FirstOrDefaultAsync(u => u.Username == "staff");
        Assert.NotNull(superAdmin);
        Assert.NotNull(staff);

        var adminCaller = FakeCurrentUserService.AsUser(
            "admin",
            "Admin Biasa",
            [RoleNames.Admin],
            [Permissions.Users.View, Permissions.Users.Create, Permissions.Users.Edit, Permissions.Users.Delete]);

        var service = new UserService(ctx.Uow, ctx.Hasher, adminCaller, TestCacheFactory.CreateInMemory());

        // 1. Admin biasa tidak boleh membuat user baru dengan role SuperAdmin
        var createSuper = await service.CreateUserAsync(new CreateUserRequest(
            Username: "hacker.super",
            Email: "hacker.super@company.id",
            FullName: "Hacker Super",
            Password: "Password123!",
            PhoneNumber: null,
            Department: "IT",
            Status: "Active",
            Roles: [RoleNames.SuperAdmin]));
        Assert.False(createSuper.Succeeded);
        Assert.Equal(403, createSuper.StatusCode);

        // 2. Admin biasa tidak boleh me-reset password atau mengubah akun SuperAdmin
        var hijackSuper = await service.UpdateUserAsync(superAdmin!.Id, new UpdateUserRequest(
            Email: superAdmin.Email,
            FullName: superAdmin.FullName,
            PhoneNumber: superAdmin.PhoneNumber,
            Department: superAdmin.Department,
            Status: "Active",
            NewPassword: "HijackedPassword1!",
            Roles: [RoleNames.SuperAdmin]));
        Assert.False(hijackSuper.Succeeded);
        Assert.Equal(403, hijackSuper.StatusCode);

        // 3. Admin biasa tidak boleh menaikkan role staff menjadi SuperAdmin
        var promoteStaff = await service.UpdateUserAsync(staff!.Id, new UpdateUserRequest(
            Email: staff.Email,
            FullName: staff.FullName,
            PhoneNumber: staff.PhoneNumber,
            Department: staff.Department,
            Status: "Active",
            NewPassword: null,
            Roles: [RoleNames.SuperAdmin]));
        Assert.False(promoteStaff.Succeeded);
        Assert.Equal(403, promoteStaff.StatusCode);
    }

    [Fact]
    public async Task RoleService_NonSuperAdmin_ShouldBeBlockedFromPermissionEscalation()
    {
        using var ctx = await TestDbFactory.CreateIdentityAsync();
        var limitedAdmin = FakeCurrentUserService.AsUser(
            "role.manager",
            "Role Manager",
            [RoleNames.Admin],
            [Permissions.Roles.Manage, Permissions.Dashboard.View]);

        var service = new RoleService(ctx.Uow, limitedAdmin, TestCacheFactory.CreateInMemory());

        // Tidak boleh membuat role baru dengan permission yang caller sendiri tidak miliki (Users.Delete)
        var escalate = await service.CreateRoleAsync(new CreateOrUpdateRoleRequest(
            Name: "EscalatedRole",
            DisplayName: "Escalated",
            Description: "Mencoba eskalasi",
            BadgeColor: "rose",
            Permissions: [Permissions.Dashboard.View, Permissions.Users.Delete],
            MenuIds: []));

        Assert.False(escalate.Succeeded);
        Assert.Equal(403, escalate.StatusCode);

        // Tidak boleh memodifikasi role SuperAdmin
        var roles = (await service.GetAllRolesAsync()).Data!;
        var superAdminRole = roles.Single(r => r.Name == RoleNames.SuperAdmin);
        var editSuperRole = await service.UpdateRoleAsync(superAdminRole.Id, new CreateOrUpdateRoleRequest(
            Name: RoleNames.SuperAdmin,
            DisplayName: "Hacked",
            Description: "Hacked",
            BadgeColor: "rose",
            Permissions: [Permissions.Dashboard.View],
            MenuIds: []));

        Assert.False(editSuperRole.Succeeded);
        Assert.Equal(403, editSuperRole.StatusCode);
    }

    [Fact]
    public async Task AuthService_ShouldEnforceLockout_HashRefreshTokens_DetectReuse_AndBlockInactiveRefresh()
    {
        using var ctx = await TestDbFactory.CreateIdentityAsync();
        var cache = TestCacheFactory.CreateInMemory();
        var currentUser = new FakeCurrentUserService();
        var authService = new AuthService(ctx.Uow, ctx.Jwt, ctx.Hasher, currentUser, cache);

        // 1. Brute-force 5x gagal -> terkunci HTTP 429 + tercatat di AuditLog
        for (var i = 1; i <= AuthService.MaxFailedLoginAttempts; i++)
        {
            var failed = await authService.LoginAsync(new LoginRequest("staff", "WrongPass9!"));
            Assert.False(failed.Succeeded);
            Assert.Equal(i == AuthService.MaxFailedLoginAttempts ? 429 : 401, failed.StatusCode);
        }

        // Login dengan password benar saat masih terkunci tetap ditolak 429
        var lockedAttempt = await authService.LoginAsync(new LoginRequest("staff", "Password123!"));
        Assert.False(lockedAttempt.Succeeded);
        Assert.Equal(429, lockedAttempt.StatusCode);

        var auditLogs = await ctx.Uow.Repository<AuditLog>().GetListAsync(l => l.Module == "Auth");
        Assert.Contains(auditLogs, l => l.Action == "LOGIN_FAILED");
        Assert.Contains(auditLogs, l => l.Action == "ACCOUNT_LOCKED");

        // 2. Refresh token tersimpan dalam bentuk SHA-256 hash (bukan plaintext) + Reuse Detection
        var login = await authService.LoginAsync(new LoginRequest("superadmin", "Password123!"));
        Assert.True(login.Succeeded);
        var rawToken1 = login.Data!.RefreshToken;

        var storedTokens = await ctx.Uow.Repository<RefreshToken>().GetListAsync(rt => rt.UserId == login.Data.User.Id);
        Assert.All(storedTokens, rt =>
        {
            Assert.StartsWith("sha256:", rt.Token);
            Assert.NotEqual(rawToken1, rt.Token);
        });

        // Rotasi ke token ke-2
        var rotated = await authService.RefreshTokenAsync(new RefreshTokenRequest(rawToken1));
        Assert.True(rotated.Succeeded);
        var rawToken2 = rotated.Data!.RefreshToken;

        // Replay token lama (rawToken1) -> memicu Reuse Detection & mencabut rawToken2 juga!
        var reuseAttempt = await authService.RefreshTokenAsync(new RefreshTokenRequest(rawToken1));
        Assert.False(reuseAttempt.Succeeded);
        Assert.Equal(401, reuseAttempt.StatusCode);

        var token2AfterReuse = await authService.RefreshTokenAsync(new RefreshTokenRequest(rawToken2));
        Assert.False(token2AfterReuse.Succeeded);
        Assert.Equal(401, token2AfterReuse.StatusCode);

        // 3. Logout IDOR check: user lain tidak boleh mencabut refresh token milik user lain
        var loginAgain = await authService.LoginAsync(new LoginRequest("superadmin", "Password123!"));
        var victimToken = loginAgain.Data!.RefreshToken;
        currentUser.UserId = Guid.NewGuid(); // attacker dengan userId berbeda
        await authService.LogoutAsync(victimToken);

        // Token milik superadmin masih valid karena logout dari user lain diabaikan
        var stillValid = await authService.RefreshTokenAsync(new RefreshTokenRequest(victimToken));
        Assert.True(stillValid.Succeeded);

        // 4. ChangePassword menolak password lemah & mencabut sesi aktif saat sukses
        currentUser.UserId = loginAgain.Data.User.Id;
        var weakPwd = await authService.ChangePasswordAsync(new ChangePasswordRequest("Password123!", "123456"));
        Assert.False(weakPwd.Succeeded);
        Assert.Equal(400, weakPwd.StatusCode);

        var strongPwd = await authService.ChangePasswordAsync(new ChangePasswordRequest("Password123!", "NewStrongPass1!"));
        Assert.True(strongPwd.Succeeded);

        var refreshAfterPwdChange = await authService.RefreshTokenAsync(new RefreshTokenRequest(stillValid.Data!.RefreshToken));
        Assert.False(refreshAfterPwdChange.Succeeded);
        Assert.Equal(401, refreshAfterPwdChange.StatusCode);
    }

    [Fact]
    public async Task WorkflowService_AntiIdor_ShouldBlockUnrelatedStaffFromViewingOtherUsersRequests()
    {
        using var ctx = await TestDbFactory.CreateWorkflowAsync();
        var staffAId = Guid.NewGuid();
        var staffBId = Guid.NewGuid();
        var managerId = Guid.NewGuid();

        var currentUser = FakeCurrentUserService.AsUser("staff.a", "Staff A", [RoleNames.Staff], userId: staffAId);
        var service = new WorkflowService(ctx.Uow, currentUser, TestCacheFactory.CreateInMemory(), new InMemoryEventBus());

        var created = await service.CreateRequestAsync(new CreateWorkflowRequestDto(
            TemplateCode: "LEAVE_REQUEST",
            Title: "Cuti Medis Pribadi Staff A",
            FormData: new Dictionary<string, string>
            {
                ["leaveType"] = "Cuti Sakit",
                ["startDate"] = "2026-12-01",
                ["endDate"] = "2026-12-02",
                ["totalDays"] = "2",
                ["backupPic"] = "Budi",
                ["reason"] = "Alasan medis rahasia"
            },
            SubmitImmediately: true));

        Assert.True(created.Succeeded);
        var requestId = created.Data!.Id;

        // Staff B (bukan pemilik dan bukan approver) tidak boleh melihat dokumen Staff A lewat tracking maupun detail ID
        currentUser.SwitchTo(staffBId, "staff.b", "Staff B", [RoleNames.Staff]);
        var trackingForB = await service.GetTrackingListAsync(scope: null);
        Assert.True(trackingForB.Succeeded);
        Assert.DoesNotContain(trackingForB.Data!, r => r.Id == requestId);

        var detailForB = await service.GetRequestByIdAsync(requestId);
        Assert.False(detailForB.Succeeded);
        Assert.Equal(403, detailForB.StatusCode);

        // Manager (approver pada flow) tetap boleh mengakses
        currentUser.SwitchTo(managerId, "manager", "Manager", [RoleNames.Manager]);
        var detailForManager = await service.GetRequestByIdAsync(requestId);
        Assert.True(detailForManager.Succeeded);
    }

    [Fact]
    public async Task AnnouncementService_ShouldSanitizeSvgAndImgXss_AndRejectExternalBannerUrl()
    {
        using var ctx = await TestDbFactory.CreateAnnouncementAsync();
        var hrStaff = FakeCurrentUserService.AsUser(
            "hrstaff",
            "HR Staff",
            [RoleNames.HRStaff],
            [Permissions.Announcements.View, Permissions.Announcements.Manage]);

        var service = new AnnouncementService(ctx.Uow, hrStaff, TestCacheFactory.CreateInMemory(), new InMemoryEventBus());

        // 1. HTML Sanitizer berbasis DOM harus membersihkan payload bypass regex (svg/img/onerror/javascript:)
        var created = await service.CreateAnnouncementAsync(new CreateOrUpdateAnnouncementRequest(
            Title: "Uji Sanitasi HTML",
            Summary: null,
            Type: "General",
            ContentHtml: "<p>Halo <strong>Tim</strong></p><svg onload=\"alert(1)\"></svg><img src=\"x\" onerror=\"alert(2)\"><a href=\"javascript:alert(3)\">Klik</a>",
            BannerUrl: "/api/v1/announcements/files/valid-banner.png",
            AllowComments: true));

        Assert.True(created.Succeeded);
        Assert.Contains("<strong>Tim</strong>", created.Data!.ContentHtml);
        Assert.DoesNotContain("<svg", created.Data.ContentHtml, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("onerror", created.Data.ContentHtml, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("javascript:", created.Data.ContentHtml, StringComparison.OrdinalIgnoreCase);

        // 2. BannerUrl eksternal / javascript: harus ditolak (400)
        var badBanner = await service.CreateAnnouncementAsync(new CreateOrUpdateAnnouncementRequest(
            Title: "Banner Phishing",
            Summary: null,
            Type: "General",
            ContentHtml: "<p>Isi aman</p>",
            BannerUrl: "https://evil.example/tracker.png",
            AllowComments: true));

        Assert.False(badBanner.Succeeded);
        Assert.Equal(400, badBanner.StatusCode);
    }

    [Fact]
    public void InternalApiKeyHelper_And_PasswordHasherV2_ShouldValidateSecurelyAndStayBackwardCompatible()
    {
        Assert.True(InternalApiKeyHelper.IsValid("SecretKey_2026", "SecretKey_2026"));
        Assert.False(InternalApiKeyHelper.IsValid("SecretKey_2025", "SecretKey_2026"));
        Assert.False(InternalApiKeyHelper.IsValid("short", "SecretKey_2026"));
        Assert.False(InternalApiKeyHelper.IsValid(null, "SecretKey_2026"));

        var hasher = new PasswordHasher();
        var v2Hash = hasher.HashPassword("Password123!");
        Assert.StartsWith("v2.600000.", v2Hash);
        Assert.True(hasher.VerifyPassword("Password123!", v2Hash));
        Assert.False(hasher.VerifyPassword("WrongPass123!", v2Hash));

        // Uji kompatibilitas backward dengan hash v1 (2 bagian, 100_000 iterasi)
        var salt = RandomNumberGenerator.GetBytes(16);
        var legacyKey = Rfc2898DeriveBytes.Pbkdf2("LegacyPass1!", salt, 100_000, HashAlgorithmName.SHA256, 32);
        var legacyHash = $"{Convert.ToBase64String(salt)}.{Convert.ToBase64String(legacyKey)}";
        Assert.True(hasher.VerifyPassword("LegacyPass1!", legacyHash));
    }
}
