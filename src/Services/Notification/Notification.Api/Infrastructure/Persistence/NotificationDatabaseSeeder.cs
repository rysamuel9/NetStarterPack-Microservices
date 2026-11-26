using System.Text.Json;
using BuildingBlocks.Core.Constants;
using Microsoft.EntityFrameworkCore;
using Notification.Api.Application.Interfaces;
using Notification.Api.Domain.Entities;

namespace Notification.Api.Infrastructure.Persistence;

public class NotificationDatabaseSeeder(
    NotificationDbContext dbContext,
    IEmailTemplateRenderer templateRenderer,
    ILogger<NotificationDatabaseSeeder> logger)
{
    public async Task SeedAsync(CancellationToken cancellationToken = default)
    {
        if (dbContext.Database.IsRelational())
        {
            var pendingMigrations = await dbContext.Database.GetPendingMigrationsAsync(cancellationToken);
            if (pendingMigrations.Any())
            {
                await dbContext.Database.MigrateAsync(cancellationToken);
            }
            else
            {
                await dbContext.Database.EnsureCreatedAsync(cancellationToken);
            }
        }
        else
        {
            await dbContext.Database.EnsureCreatedAsync(cancellationToken);
        }

        var existingCodes = (await dbContext.Templates
            .Select(t => t.Code)
            .ToListAsync(cancellationToken))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var definitions = GetDefaultTemplateDefinitions();
        var addedCount = 0;

        foreach (var def in definitions)
        {
            if (existingCodes.Contains(def.Code))
            {
                continue;
            }

            var htmlBody = await templateRenderer.LoadDefaultBodyHtmlAsync(def.DefaultFileName, cancellationToken)
                           ?? "<p>Halo <strong>{{ recipient_name }}</strong>,</p><p>{{ message }}</p>";

            await dbContext.Templates.AddAsync(new NotificationTemplate
            {
                Code = def.Code,
                Name = def.Name,
                Category = def.Category,
                Description = def.Description,
                SubjectTemplate = def.SubjectTemplate,
                BodyHtmlTemplate = htmlBody,
                AccentColor = def.AccentColor,
                ActionLabel = def.ActionLabel,
                DefaultFileName = def.DefaultFileName,
                SampleDataJson = JsonSerializer.Serialize(def.SampleData),
                DefaultSendInApp = def.DefaultSendInApp,
                DefaultSendEmail = def.DefaultSendEmail,
                DefaultSendPush = def.DefaultSendPush,
                IsActive = true,
                CreatedBy = "SystemSeeder"
            }, cancellationToken);

            addedCount++;
        }

        if (addedCount > 0)
        {
            await dbContext.SaveChangesAsync(cancellationToken);
            logger.LogInformation("[Notification.Api] Seeded {Count} default HTML email templates into NetStarterPack_NotificationDb.", addedCount);
        }
    }

    public static IReadOnlyList<DefaultTemplateDefinition> GetDefaultTemplateDefinitions() =>
    [
        new(
            Code: NotificationTemplateCodes.WorkflowSubmitted,
            Name: "Pengajuan Baru (Butuh Approval)",
            Category: NotificationCategories.Workflow,
            Description: "Dikirim ke approver aktif ketika ada pengajuan dokumen baru masuk atau naik tahap.",
            SubjectTemplate: "[Perlu Approval] {{ document_number }} — {{ title }}",
            AccentColor: "#2563EB",
            ActionLabel: "Buka Working List",
            DefaultFileName: "workflow-submitted.html",
            DefaultSendInApp: true,
            DefaultSendEmail: true,
            DefaultSendPush: true,
            SampleData: new()
            {
                ["recipient_name"] = "Andi Pratama (Manager)",
                ["document_number"] = "WF-2026-0042",
                ["form_name"] = "Pengadaan Laptop Kerja",
                ["title"] = "MacBook Pro 14\" untuk Engineer Baru",
                ["requester_name"] = "Dewi Lestari (Staff)",
                ["step_name"] = "Approval Manager (L1)",
                ["category"] = "Workflow"
            }),
        new(
            Code: NotificationTemplateCodes.WorkflowApproved,
            Name: "Pengajuan Disetujui (Approved)",
            Category: NotificationCategories.Workflow,
            Description: "Dikirim ke pemohon ketika dokumen disetujui pada satu tahap atau final approved.",
            SubjectTemplate: "[Disetujui] {{ document_number }} — {{ form_name }}",
            AccentColor: "#059669",
            ActionLabel: "Lihat Tracking Dokumen",
            DefaultFileName: "workflow-approved.html",
            DefaultSendInApp: true,
            DefaultSendEmail: true,
            DefaultSendPush: true,
            SampleData: new()
            {
                ["recipient_name"] = "Dewi Lestari (Staff)",
                ["document_number"] = "WF-2026-0042",
                ["form_name"] = "Pengadaan Laptop Kerja",
                ["actor_name"] = "Surya Darmawan (Finance Director)",
                ["step_name"] = "Final Sign-Off Finance (L3)",
                ["status_label"] = "Final Approved",
                ["notes"] = "Budget disetujui, silakan koordinasi dengan Tim IT untuk serah terima.",
                ["category"] = "Workflow"
            }),
        new(
            Code: NotificationTemplateCodes.WorkflowRejected,
            Name: "Pengajuan Ditolak (Rejected)",
            Category: NotificationCategories.Workflow,
            Description: "Dikirim ke pemohon ketika dokumen ditolak oleh approver beserta alasan penolakan.",
            SubjectTemplate: "[Ditolak] {{ document_number }} — {{ form_name }}",
            AccentColor: "#DC2626",
            ActionLabel: "Lihat Detail Penolakan",
            DefaultFileName: "workflow-rejected.html",
            DefaultSendInApp: true,
            DefaultSendEmail: true,
            DefaultSendPush: true,
            SampleData: new()
            {
                ["recipient_name"] = "Dewi Lestari (Staff)",
                ["document_number"] = "WF-2026-0042",
                ["form_name"] = "Pengadaan Laptop Kerja",
                ["title"] = "MacBook Pro 14\" untuk Engineer Baru",
                ["actor_name"] = "Surya Darmawan (Finance Director)",
                ["step_name"] = "Review Budget Finance",
                ["notes"] = "Alokasi budget perangkat kuartal ini sudah terpakai, silakan ajukan ulang di kuartal depan.",
                ["category"] = "Workflow"
            }),
        new(
            Code: NotificationTemplateCodes.WorkflowRevision,
            Name: "Permintaan Revisi Dokumen",
            Category: NotificationCategories.Workflow,
            Description: "Dikirim ke pemohon ketika approver meminta perbaikan data sebelum disetujui.",
            SubjectTemplate: "[Perlu Revisi] {{ document_number }} — {{ form_name }}",
            AccentColor: "#D97706",
            ActionLabel: "Perbaiki & Submit Ulang",
            DefaultFileName: "workflow-revision.html",
            DefaultSendInApp: true,
            DefaultSendEmail: true,
            DefaultSendPush: true,
            SampleData: new()
            {
                ["recipient_name"] = "Dewi Lestari (Staff)",
                ["document_number"] = "WF-2026-0042",
                ["form_name"] = "Pengadaan Laptop Kerja",
                ["actor_name"] = "Hendra Wijaya (IT Lead)",
                ["step_name"] = "Validasi Teknis IT (L2)",
                ["notes"] = "Mohon lengkapi spesifikasi RAM minimal 16GB dan lampirkan 2 penawaran vendor.",
                ["category"] = "Workflow"
            }),
        new(
            Code: NotificationTemplateCodes.OrderCreated,
            Name: "Pesanan Baru Dibuat",
            Category: NotificationCategories.Order,
            Description: "Dikirim ke Manager & Finance saat pesanan baru berhasil dibuat di Order.Api.",
            SubjectTemplate: "[Order Baru] {{ order_number }} — {{ customer_name }}",
            AccentColor: "#0D9488",
            ActionLabel: "Lihat Daftar Pesanan",
            DefaultFileName: "order-created.html",
            DefaultSendInApp: true,
            DefaultSendEmail: true,
            DefaultSendPush: true,
            SampleData: new()
            {
                ["recipient_name"] = "Andi Pratama (Manager)",
                ["order_number"] = "ORD-2026-0199",
                ["customer_name"] = "PT Nusantara Digital Solusi",
                ["total_amount"] = "Rp 18.500.000",
                ["status"] = "Pending",
                ["actor_name"] = "Dewi Lestari (Staff)",
                ["category"] = "Order"
            }),
        new(
            Code: NotificationTemplateCodes.OrderStatusChanged,
            Name: "Perubahan Status Pesanan",
            Category: NotificationCategories.Order,
            Description: "Dikirim ketika status pesanan diperbarui (misal Paid, Completed, Cancelled).",
            SubjectTemplate: "[Order {{ status }}] {{ order_number }} — {{ customer_name }}",
            AccentColor: "#0284C7",
            ActionLabel: "Buka Detail Pesanan",
            DefaultFileName: "order-status-changed.html",
            DefaultSendInApp: true,
            DefaultSendEmail: true,
            DefaultSendPush: true,
            SampleData: new()
            {
                ["recipient_name"] = "Surya Darmawan (Finance Director)",
                ["order_number"] = "ORD-2026-0199",
                ["customer_name"] = "PT Nusantara Digital Solusi",
                ["status"] = "Completed",
                ["actor_name"] = "Andi Pratama (Manager)",
                ["category"] = "Order"
            }),
        new(
            Code: NotificationTemplateCodes.TrackingAssigned,
            Name: "Penugasan Lapangan Baru",
            Category: NotificationCategories.Tracking,
            Description: "Dikirim ke petugas lapangan saat Dispatcher membuat tugas tracking/delivery baru.",
            SubjectTemplate: "[Tugas Lapangan] {{ assignment_code }} — {{ destination_name }}",
            AccentColor: "#0F766E",
            ActionLabel: "Buka Live Tracking",
            DefaultFileName: "tracking-assigned.html",
            DefaultSendInApp: true,
            DefaultSendEmail: true,
            DefaultSendPush: true,
            SampleData: new()
            {
                ["recipient_name"] = "Dewi Lestari (Staff)",
                ["assignment_code"] = "DSP-2026-018",
                ["title"] = "Pengiriman Perangkat Server Rack",
                ["destination_name"] = "Menara Sudirman Lt. 14, Jakarta Pusat",
                ["actor_name"] = "Andi Pratama (Manager)",
                ["category"] = "Tracking"
            }),
        new(
            Code: NotificationTemplateCodes.TrackingPodSubmitted,
            Name: "POD Menunggu Verifikasi",
            Category: NotificationCategories.Tracking,
            Description: "Dikirim ke Manager/Dispatcher saat petugas lapangan mengunggah Proof of Delivery (POD).",
            SubjectTemplate: "[Verifikasi POD] {{ assignment_code }} — {{ title }}",
            AccentColor: "#2563EB",
            ActionLabel: "Verifikasi POD Sekarang",
            DefaultFileName: "tracking-pod-submitted.html",
            DefaultSendInApp: true,
            DefaultSendEmail: true,
            DefaultSendPush: true,
            SampleData: new()
            {
                ["recipient_name"] = "Andi Pratama (Manager)",
                ["assignment_code"] = "DSP-2026-018",
                ["title"] = "Pengiriman Perangkat Server Rack",
                ["field_user_name"] = "Dewi Lestari (Staff)",
                ["receiver_name"] = "Bpk. Agus (Tim Fasilitas)",
                ["category"] = "Tracking"
            }),
        new(
            Code: NotificationTemplateCodes.AnnouncementPublished,
            Name: "Pengumuman Internal HR",
            Category: NotificationCategories.Announcement,
            Description: "Dikirim saat HR menerbitkan pengumuman baru (email disarankan aktif untuk tipe Urgent/Policy).",
            SubjectTemplate: "[Pengumuman {{ announcement_type }}] {{ title }}",
            AccentColor: "#7C3AED",
            ActionLabel: "Baca Pengumuman",
            DefaultFileName: "announcement-published.html",
            DefaultSendInApp: true,
            DefaultSendEmail: true,
            DefaultSendPush: true,
            SampleData: new()
            {
                ["recipient_name"] = "Seluruh Karyawan",
                ["announcement_type"] = "Policy",
                ["title"] = "Pembaruan Kebijakan Hybrid Working Q4 2026",
                ["summary"] = "Mulai bulan depan jadwal WFO/WFH dapat diajukan langsung lewat modul Workflow.",
                ["author_name"] = "Rina Kusuma (HR Manager)",
                ["category"] = "Announcement"
            }),
        new(
            Code: NotificationTemplateCodes.Generic,
            Name: "Notifikasi Umum Sistem",
            Category: NotificationCategories.System,
            Description: "Template fallback umum jika event tidak cocok dengan kode template spesifik.",
            SubjectTemplate: "[NetStarterPack] {{ title }}",
            AccentColor: "#0D9488",
            ActionLabel: "Buka Aplikasi",
            DefaultFileName: "generic-notification.html",
            DefaultSendInApp: true,
            DefaultSendEmail: true,
            DefaultSendPush: true,
            SampleData: new()
            {
                ["recipient_name"] = "Pengguna",
                ["title"] = "Notifikasi Sistem",
                ["message"] = "Ini adalah contoh pesan notifikasi sistem dari NetStarterPack.",
                ["category"] = "System"
            })
    ];
}

public record DefaultTemplateDefinition(
    string Code,
    string Name,
    string Category,
    string Description,
    string SubjectTemplate,
    string AccentColor,
    string ActionLabel,
    string DefaultFileName,
    bool DefaultSendInApp,
    bool DefaultSendEmail,
    bool DefaultSendPush,
    Dictionary<string, string> SampleData
);
