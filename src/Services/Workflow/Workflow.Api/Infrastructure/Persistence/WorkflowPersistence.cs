using System.Text.Json;
using BuildingBlocks.Core.Common;
using BuildingBlocks.Core.Constants;
using BuildingBlocks.Core.Interfaces;
using BuildingBlocks.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Workflow.Api.Application.DTOs;
using Workflow.Api.Domain.Entities;
using Workflow.Api.Domain.Interfaces;

namespace Workflow.Api.Infrastructure.Persistence;

/// <summary>
/// DbContext terisolasi khusus untuk Workflow dan Approval Microservice (Database-per-Service: NetStarterPack_WorkflowDb).
/// Menggabungkan tabel relasional (WorkflowRequests, WorkflowApprovalSteps, WorkflowHistoryLogs)
/// dengan skema JSON fleksibel (FormTemplates.FieldsJson dan WorkflowRequests.FormDataJson).
/// </summary>
public class WorkflowDbContext(DbContextOptions<WorkflowDbContext> options) : DbContext(options)
{
    public DbSet<FormTemplate> FormTemplates => Set<FormTemplate>();
    public DbSet<WorkflowRequest> WorkflowRequests => Set<WorkflowRequest>();
    public DbSet<WorkflowApprovalStep> WorkflowApprovalSteps => Set<WorkflowApprovalStep>();
    public DbSet<WorkflowHistoryLog> WorkflowHistoryLogs => Set<WorkflowHistoryLog>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // [TEMPLATE OPSI 1 DATABASE BERSAMA - SCHEMA ISOLATION]
        // Jika memakai 1 Database bersama (NetStarterPack_SharedDb), uncomment baris di bawah ini:
        // modelBuilder.HasDefaultSchema("workflow");

        modelBuilder.Entity<FormTemplate>(entity =>
        {
            entity.ToTable("FormTemplates");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Code).HasMaxLength(64).IsRequired();
            entity.Property(x => x.Name).HasMaxLength(200).IsRequired();
            entity.Property(x => x.Category).HasMaxLength(100).IsRequired();
            entity.Property(x => x.Icon).HasMaxLength(64).IsRequired();
            entity.Property(x => x.Description).HasMaxLength(500);
            entity.Property(x => x.FieldsJson).IsRequired();
            entity.Property(x => x.ApprovalFlowJson).IsRequired();
            entity.HasIndex(x => x.Code).IsUnique();
            entity.HasQueryFilter(x => !x.IsDeleted);
        });

        modelBuilder.Entity<WorkflowRequest>(entity =>
        {
            entity.ToTable("WorkflowRequests");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.RequestNumber).HasMaxLength(64).IsRequired();
            entity.Property(x => x.TemplateCode).HasMaxLength(64).IsRequired();
            entity.Property(x => x.TemplateName).HasMaxLength(200).IsRequired();
            entity.Property(x => x.TemplateCategory).HasMaxLength(100).IsRequired();
            entity.Property(x => x.Title).HasMaxLength(250).IsRequired();
            entity.Property(x => x.FormDataJson).IsRequired();
            entity.Property(x => x.RequesterUsername).HasMaxLength(100).IsRequired();
            entity.Property(x => x.RequesterFullName).HasMaxLength(150).IsRequired();
            entity.Property(x => x.CurrentApproverRole).HasMaxLength(100);
            entity.HasIndex(x => x.RequestNumber).IsUnique();
            entity.HasIndex(x => new { x.Status, x.CurrentApproverRole });
            entity.HasOne(x => x.FormTemplate)
                .WithMany(t => t.Requests)
                .HasForeignKey(x => x.FormTemplateId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasQueryFilter(x => !x.IsDeleted);
        });

        modelBuilder.Entity<WorkflowApprovalStep>(entity =>
        {
            entity.ToTable("WorkflowApprovalSteps");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.StepName).HasMaxLength(150).IsRequired();
            entity.Property(x => x.ApproverRole).HasMaxLength(100).IsRequired();
            entity.Property(x => x.Description).HasMaxLength(300);
            entity.Property(x => x.ActionByUsername).HasMaxLength(100);
            entity.Property(x => x.ActionByFullName).HasMaxLength(150);
            entity.Property(x => x.Comment).HasMaxLength(1000);
            entity.HasOne(x => x.WorkflowRequest)
                .WithMany(r => r.ApprovalSteps)
                .HasForeignKey(x => x.WorkflowRequestId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasQueryFilter(x => !x.IsDeleted);
        });

        modelBuilder.Entity<WorkflowHistoryLog>(entity =>
        {
            entity.ToTable("WorkflowHistoryLogs");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Action).HasMaxLength(64).IsRequired();
            entity.Property(x => x.ActorUsername).HasMaxLength(100).IsRequired();
            entity.Property(x => x.ActorFullName).HasMaxLength(150).IsRequired();
            entity.Property(x => x.ActorRole).HasMaxLength(100).IsRequired();
            entity.Property(x => x.FromStatus).HasMaxLength(64).IsRequired();
            entity.Property(x => x.ToStatus).HasMaxLength(64).IsRequired();
            entity.Property(x => x.Notes).HasMaxLength(1000);
            entity.HasOne(x => x.WorkflowRequest)
                .WithMany(r => r.HistoryLogs)
                .HasForeignKey(x => x.WorkflowRequestId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasQueryFilter(x => !x.IsDeleted);
        });
    }
}

public class WorkflowRequestRepository(WorkflowDbContext dbContext)
    : GenericRepository<WorkflowRequest, WorkflowDbContext>(dbContext), IWorkflowRequestRepository
{
    public async Task<List<WorkflowRequest>> GetAllWithDetailsAsync(CancellationToken cancellationToken = default) =>
        await DbSet
            .AsNoTracking()
            .AsSplitQuery()
            .Include(r => r.FormTemplate)
            .Include(r => r.ApprovalSteps)
            .Include(r => r.HistoryLogs)
            .OrderByDescending(r => r.CreatedAt)
            .ToListAsync(cancellationToken);

    public async Task<WorkflowRequest?> GetWithDetailsByIdAsync(Guid id, CancellationToken cancellationToken = default) =>
        await DbSet
            .AsSplitQuery()
            .Include(r => r.FormTemplate)
            .Include(r => r.ApprovalSteps)
            .Include(r => r.HistoryLogs)
            .FirstOrDefaultAsync(r => r.Id == id, cancellationToken);

    public async Task<List<WorkflowRequest>> GetPendingForRolesAsync(
        IEnumerable<string> roles,
        bool isSuperAdmin,
        CancellationToken cancellationToken = default)
    {
        var query = DbSet
            .AsNoTracking()
            .AsSplitQuery()
            .Include(r => r.FormTemplate)
            .Include(r => r.ApprovalSteps)
            .Include(r => r.HistoryLogs)
            .Where(r => r.Status == WorkflowStatus.InReview);

        if (!isSuperAdmin)
        {
            var normalizedRoles = roles.Select(r => r.ToLowerInvariant()).ToList();
            query = query.Where(r => r.CurrentApproverRole != null &&
                                     normalizedRoles.Contains(r.CurrentApproverRole.ToLower()));
        }

        return await query
            .OrderBy(r => r.SubmittedAt ?? r.CreatedAt)
            .ToListAsync(cancellationToken);
    }
}

public class WorkflowUnitOfWork(WorkflowDbContext dbContext) : IWorkflowUnitOfWork
{
    private readonly Dictionary<Type, object> _repositories = new();
    private IRepository<FormTemplate>? _templates;
    private IWorkflowRequestRepository? _requests;

    public IRepository<FormTemplate> Templates =>
        _templates ??= new GenericRepository<FormTemplate, WorkflowDbContext>(dbContext);

    public IWorkflowRequestRepository Requests =>
        _requests ??= new WorkflowRequestRepository(dbContext);

    public IRepository<T> Repository<T>() where T : BaseEntity
    {
        var type = typeof(T);
        if (!_repositories.TryGetValue(type, out var repo))
        {
            repo = new GenericRepository<T, WorkflowDbContext>(dbContext);
            _repositories[type] = repo;
        }
        return (IRepository<T>)repo;
    }

    public Task<int> SaveChangesAsync(CancellationToken cancellationToken = default) =>
        dbContext.SaveChangesAsync(cancellationToken);
}

public class WorkflowDatabaseSeeder(
    WorkflowDbContext dbContext,
    ILogger<WorkflowDatabaseSeeder> logger)
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public async Task SeedAsync(CancellationToken cancellationToken = default)
    {
        if (dbContext.Database.IsRelational())
        {
            var pending = await dbContext.Database.GetPendingMigrationsAsync(cancellationToken);
            if (pending.Any())
            {
                await dbContext.Database.MigrateAsync(cancellationToken);
            }
            else
            {
                await dbContext.Database.EnsureCreatedAsync(cancellationToken);

                // [TEMPLATE OPSI 1 DATABASE BERSAMA (SINGLE SHARED DB)]
                // Uncomment blok try-catch di bawah jika memakai 1 database bersama (NetStarterPack_SharedDb):
                // try
                // {
                //     var creator = dbContext.Database.GetService<Microsoft.EntityFrameworkCore.Storage.IRelationalDatabaseCreator>();
                //     await creator.CreateTablesAsync(cancellationToken);
                // }
                // catch { }
            }
        }
        else
        {
            await dbContext.Database.EnsureCreatedAsync(cancellationToken);
        }

        if (await dbContext.FormTemplates.AnyAsync(cancellationToken))
        {
            return;
        }

        logger.LogInformation("Seeding Dynamic Form Templates and sample Multi-Level Approval Requests into NetStarterPack_WorkflowDb...");

        // =====================================================================
        // 1. Seed 3 Template Formulir Dinamis yang Berbeda Skema & Alur Approval
        // =====================================================================
        var laptopTemplate = new FormTemplate
        {
            Code = "LAPTOP_PROCUREMENT",
            Name = "Form Pengadaan Laptop / IT Asset",
            Category = "IT & Asset",
            Icon = "Laptop",
            Description = "Pengajuan perangkat kerja (Laptop / Workstation) lengkap dengan spesifikasi teknis, urgensi, dan estimasi harga. Membutuhkan 3 level persetujuan (Manager -> ITLead -> FinanceDirector).",
            FieldsJson = JsonSerializer.Serialize(new List<FormFieldDefinitionDto>
            {
                new("brandModel", "Merk & Tipe Laptop", "text", true, "Contoh: MacBook Pro M4 16-inch / ThinkPad X1 Carbon"),
                new("specifications", "Spesifikasi Teknis (CPU / RAM / SSD)", "textarea", true, "Contoh: 14-Core CPU, 32GB Unified Memory, 1TB NVMe SSD"),
                new("estimatedCost", "Estimasi Harga (IDR)", "currency", true, "32000000"),
                new("urgency", "Tingkat Urgensi", "select", true, null, ["Normal (14 Hari)", "Urgent (7 Hari)", "Critical (Segera)"]),
                new("neededDate", "Tanggal Dibutuhkan", "date", true),
                new("justification", "Alasan Bisnis / Kebutuhan Proyek", "textarea", true, "Jelaskan kenapa perangkat ini dibutuhkan...")
            }, JsonOptions),
            ApprovalFlowJson = JsonSerializer.Serialize(new List<ApprovalFlowStepDefinitionDto>
            {
                new(1, "Persetujuan Department Manager", RoleNames.Manager, "Verifikasi kebutuhan kerja dari atasan langsung"),
                new(2, "Validasi Teknis IT Lead", RoleNames.ITLead, "Pengecekan kesesuaian spesifikasi hardware & stok aset IT"),
                new(3, "Persetujuan Anggaran Finance Director", RoleNames.FinanceDirector, "Otorisasi final biaya pengadaan aset perusahaan")
            }, JsonOptions),
            IsActive = true,
            CreatedBy = "SystemSeeder"
        };

        var leaveTemplate = new FormTemplate
        {
            Code = "LEAVE_REQUEST",
            Name = "Form Pengajuan Cuti Karyawan",
            Category = "HR & Personalia",
            Icon = "Calendar",
            Description = "Pengajuan cuti tahunan, cuti sakit, atau izin khusus karyawan. Membutuhkan 2 level persetujuan (Manager -> HRManager).",
            FieldsJson = JsonSerializer.Serialize(new List<FormFieldDefinitionDto>
            {
                new("leaveType", "Jenis Cuti", "select", true, null, ["Cuti Tahunan", "Cuti Sakit (Dengan Surat Dokter)", "Cuti Melahirkan / Keluarga", "Izin Khusus"]),
                new("startDate", "Tanggal Mulai Cuti", "date", true),
                new("endDate", "Tanggal Selesai Cuti", "date", true),
                new("totalDays", "Total Hari Kerja", "number", true, "3"),
                new("backupPic", "PIC Pengganti Selama Cuti", "text", true, "Nama rekan kerja yang mem-backup tugas"),
                new("reason", "Keterangan / Alasan Cuti", "textarea", true, "Keterangan singkat keperluan cuti...")
            }, JsonOptions),
            ApprovalFlowJson = JsonSerializer.Serialize(new List<ApprovalFlowStepDefinitionDto>
            {
                new(1, "Persetujuan Atasan (Manager)", RoleNames.Manager, "Memastikan jadwal tim dan serah terima pekerjaan aman"),
                new(2, "Validasi & Pencatatan HR Manager", RoleNames.HRManager, "Pengecekan sisa kuota cuti & pencatatan ke sistem HR")
            }, JsonOptions),
            IsActive = true,
            CreatedBy = "SystemSeeder"
        };

        var officeSupplyTemplate = new FormTemplate
        {
            Code = "OFFICE_SUPPLY",
            Name = "Form Pengadaan Barang Kantor & ATK",
            Category = "General Affairs",
            Icon = "Briefcase",
            Description = "Permintaan pembelian perlengkapan kantor, furniture, atau kebutuhan divisi. Membutuhkan 2 level persetujuan (Manager -> FinanceDirector).",
            FieldsJson = JsonSerializer.Serialize(new List<FormFieldDefinitionDto>
            {
                new("itemName", "Nama Barang / Perlengkapan", "text", true, "Contoh: Kursi Ergonomis / Monitor 27 inch / Kertas A4"),
                new("supplyCategory", "Kategori Barang", "select", true, null, ["ATK & Perlengkapan Meja", "Furniture & Ruang Kerja", "Elektronik Kantor", "Pantry & Operasional"]),
                new("quantity", "Jumlah Unit", "number", true, "5"),
                new("estimatedTotal", "Estimasi Total Biaya (IDR)", "currency", true, "7500000"),
                new("deliveryDivision", "Divisi / Lokasi Penerima", "text", true, "Lantai 3 - Ruang Engineering"),
                new("notes", "Catatan Tambahan / Link Vendor", "textarea", false, "Opsional: link referensi atau preferensi merek")
            }, JsonOptions),
            ApprovalFlowJson = JsonSerializer.Serialize(new List<ApprovalFlowStepDefinitionDto>
            {
                new(1, "Persetujuan Kepala Divisi (Manager)", RoleNames.Manager, "Verifikasi kebutuhan operasional divisi"),
                new(2, "Persetujuan Anggaran Finance Director", RoleNames.FinanceDirector, "Approval final pencairan anggaran pengadaan kantor")
            }, JsonOptions),
            IsActive = true,
            CreatedBy = "SystemSeeder"
        };

        await dbContext.FormTemplates.AddRangeAsync([laptopTemplate, leaveTemplate, officeSupplyTemplate], cancellationToken);

        // =====================================================================
        // 2. Seed 3 Sample Workflow Requests di Tahap yang Berbeda-beda
        // =====================================================================
        var now = DateTime.UtcNow;

        // Sample 1: Pengadaan Laptop (Step 1 Manager APPROVED -> Sedang Pending di Step 2 ITLead!)
        var req1 = new WorkflowRequest
        {
            RequestNumber = "WF-LAP-2026-001",
            FormTemplateId = laptopTemplate.Id,
            TemplateCode = laptopTemplate.Code,
            TemplateName = laptopTemplate.Name,
            TemplateCategory = laptopTemplate.Category,
            Title = "Pengadaan MacBook Pro M4 untuk Backend Microservices",
            FormDataJson = JsonSerializer.Serialize(new Dictionary<string, string>
            {
                ["brandModel"] = "Apple MacBook Pro 16-inch M4 Pro",
                ["specifications"] = "14-Core CPU, 36GB RAM, 1TB SSD NVMe (untuk menjalankan Docker & .NET 10 Microservices)",
                ["estimatedCost"] = "38500000",
                ["urgency"] = "Urgent (7 Hari)",
                ["neededDate"] = DateTime.UtcNow.AddDays(10).ToString("yyyy-MM-dd"),
                ["justification"] = "Laptop saat ini (RAM 8GB) sering hang saat menjalankan 4 container microservice + SQL Server secara paralel."
            }),
            RequesterUserId = Guid.Parse("11111111-1111-1111-1111-111111111104"),
            RequesterUsername = "staff",
            RequesterFullName = "Dewi Lestari (Staff)",
            Status = WorkflowStatus.InReview,
            CurrentStepOrder = 2,
            TotalSteps = 3,
            CurrentApproverRole = RoleNames.ITLead,
            SubmittedAt = now.AddHours(-6),
            CreatedAt = now.AddHours(-6),
            CreatedBy = "staff"
        };
        req1.ApprovalSteps.Add(new WorkflowApprovalStep
        {
            WorkflowRequestId = req1.Id,
            StepOrder = 1,
            StepName = "Persetujuan Department Manager",
            ApproverRole = RoleNames.Manager,
            Description = "Verifikasi kebutuhan kerja dari atasan langsung",
            Status = ApprovalStepStatus.Approved,
            ActionByUsername = "manager",
            ActionByFullName = "Andi Pratama (Manager)",
            Comment = "Setuju, kebutuhan proyek Q4 memang butuh spek RAM minimal 32GB.",
            ActionAt = now.AddHours(-3),
            CreatedBy = "SystemSeeder"
        });
        req1.ApprovalSteps.Add(new WorkflowApprovalStep
        {
            WorkflowRequestId = req1.Id,
            StepOrder = 2,
            StepName = "Validasi Teknis IT Lead",
            ApproverRole = RoleNames.ITLead,
            Description = "Pengecekan kesesuaian spesifikasi hardware & stok aset IT",
            Status = ApprovalStepStatus.Pending,
            CreatedBy = "SystemSeeder"
        });
        req1.ApprovalSteps.Add(new WorkflowApprovalStep
        {
            WorkflowRequestId = req1.Id,
            StepOrder = 3,
            StepName = "Persetujuan Anggaran Finance Director",
            ApproverRole = RoleNames.FinanceDirector,
            Description = "Otorisasi final biaya pengadaan aset perusahaan",
            Status = ApprovalStepStatus.Waiting,
            CreatedBy = "SystemSeeder"
        });
        req1.HistoryLogs.Add(new WorkflowHistoryLog
        {
            WorkflowRequestId = req1.Id,
            Action = "SUBMITTED",
            ActorUsername = "staff",
            ActorFullName = "Dewi Lestari (Staff)",
            ActorRole = RoleNames.Staff,
            FromStatus = "None",
            ToStatus = "InReview",
            Notes = "Pengajuan pengadaan laptop disubmit ke Step 1 (Manager).",
            Timestamp = now.AddHours(-6)
        });
        req1.HistoryLogs.Add(new WorkflowHistoryLog
        {
            WorkflowRequestId = req1.Id,
            Action = "APPROVED_STEP",
            ActorUsername = "manager",
            ActorFullName = "Andi Pratama (Manager)",
            ActorRole = RoleNames.Manager,
            FromStatus = "InReview",
            ToStatus = "InReview",
            Notes = "[Persetujuan Department Manager] Setuju, kebutuhan proyek Q4 memang butuh spek RAM minimal 32GB.",
            Timestamp = now.AddHours(-3)
        });

        // Sample 2: Pengajuan Cuti (Sedang Pending di Step 1 Manager!)
        var req2 = new WorkflowRequest
        {
            RequestNumber = "WF-LEA-2026-002",
            FormTemplateId = leaveTemplate.Id,
            TemplateCode = leaveTemplate.Code,
            TemplateName = leaveTemplate.Name,
            TemplateCategory = leaveTemplate.Category,
            Title = "Pengajuan Cuti Tahunan 3 Hari — Acara Keluarga",
            FormDataJson = JsonSerializer.Serialize(new Dictionary<string, string>
            {
                ["leaveType"] = "Cuti Tahunan",
                ["startDate"] = DateTime.UtcNow.AddDays(5).ToString("yyyy-MM-dd"),
                ["endDate"] = DateTime.UtcNow.AddDays(7).ToString("yyyy-MM-dd"),
                ["totalDays"] = "3",
                ["backupPic"] = "Rizky Ramadhan (Operasional)",
                ["reason"] = "Menghadiri acara pernikahan adik di luar kota. Semua task sprint sudah diselesaikan."
            }),
            RequesterUserId = Guid.Parse("11111111-1111-1111-1111-111111111104"),
            RequesterUsername = "staff",
            RequesterFullName = "Dewi Lestari (Staff)",
            Status = WorkflowStatus.InReview,
            CurrentStepOrder = 1,
            TotalSteps = 2,
            CurrentApproverRole = RoleNames.Manager,
            SubmittedAt = now.AddHours(-2),
            CreatedAt = now.AddHours(-2),
            CreatedBy = "staff"
        };
        req2.ApprovalSteps.Add(new WorkflowApprovalStep
        {
            WorkflowRequestId = req2.Id,
            StepOrder = 1,
            StepName = "Persetujuan Atasan (Manager)",
            ApproverRole = RoleNames.Manager,
            Description = "Memastikan jadwal tim dan serah terima pekerjaan aman",
            Status = ApprovalStepStatus.Pending,
            CreatedBy = "SystemSeeder"
        });
        req2.ApprovalSteps.Add(new WorkflowApprovalStep
        {
            WorkflowRequestId = req2.Id,
            StepOrder = 2,
            StepName = "Validasi & Pencatatan HR Manager",
            ApproverRole = RoleNames.HRManager,
            Description = "Pengecekan sisa kuota cuti & pencatatan ke sistem HR",
            Status = ApprovalStepStatus.Waiting,
            CreatedBy = "SystemSeeder"
        });
        req2.HistoryLogs.Add(new WorkflowHistoryLog
        {
            WorkflowRequestId = req2.Id,
            Action = "SUBMITTED",
            ActorUsername = "staff",
            ActorFullName = "Dewi Lestari (Staff)",
            ActorRole = RoleNames.Staff,
            FromStatus = "None",
            ToStatus = "InReview",
            Notes = "Pengajuan cuti disubmit dan menunggu persetujuan Step 1 (Manager).",
            Timestamp = now.AddHours(-2)
        });

        // Sample 3: Pengadaan Barang Kantor (Sudah FULLY APPROVED oleh Manager & FinanceDirector!)
        var req3 = new WorkflowRequest
        {
            RequestNumber = "WF-OFF-2026-003",
            FormTemplateId = officeSupplyTemplate.Id,
            TemplateCode = officeSupplyTemplate.Code,
            TemplateName = officeSupplyTemplate.Name,
            TemplateCategory = officeSupplyTemplate.Category,
            Title = "Pengadaan 4 Monitor 27-inch & Whiteboard Ruang Dev",
            FormDataJson = JsonSerializer.Serialize(new Dictionary<string, string>
            {
                ["itemName"] = "Dell UltraSharp 27-inch 4K + Glass Whiteboard",
                ["supplyCategory"] = "Elektronik Kantor",
                ["quantity"] = "4",
                ["estimatedTotal"] = "16800000",
                ["deliveryDivision"] = "Lantai 4 - Divisi Software Engineering",
                ["notes"] = "Untuk onboarding 4 engineer baru bulan depan."
            }),
            RequesterUserId = Guid.Parse("11111111-1111-1111-1111-111111111106"),
            RequesterUsername = "itlead",
            RequesterFullName = "Hendra Wijaya (IT Lead)",
            Status = WorkflowStatus.Approved,
            CurrentStepOrder = 2,
            TotalSteps = 2,
            CurrentApproverRole = null,
            SubmittedAt = now.AddDays(-2),
            CompletedAt = now.AddDays(-1),
            CreatedAt = now.AddDays(-2),
            CreatedBy = "itlead"
        };
        req3.ApprovalSteps.Add(new WorkflowApprovalStep
        {
            WorkflowRequestId = req3.Id,
            StepOrder = 1,
            StepName = "Persetujuan Kepala Divisi (Manager)",
            ApproverRole = RoleNames.Manager,
            Description = "Verifikasi kebutuhan operasional divisi",
            Status = ApprovalStepStatus.Approved,
            ActionByUsername = "manager",
            ActionByFullName = "Andi Pratama (Manager)",
            Comment = "Disetujui, memang dibutuhkan untuk ruang kerja tim baru.",
            ActionAt = now.AddDays(-1).AddHours(-5),
            CreatedBy = "SystemSeeder"
        });
        req3.ApprovalSteps.Add(new WorkflowApprovalStep
        {
            WorkflowRequestId = req3.Id,
            StepOrder = 2,
            StepName = "Persetujuan Anggaran Finance Director",
            ApproverRole = RoleNames.FinanceDirector,
            Description = "Approval final pencairan anggaran pengadaan kantor",
            Status = ApprovalStepStatus.Approved,
            ActionByUsername = "financedirector",
            ActionByFullName = "Surya Darmawan (Finance Director)",
            Comment = "Anggaran Q4 tersedia. Silakan proses PO ke vendor resmi.",
            ActionAt = now.AddDays(-1),
            CreatedBy = "SystemSeeder"
        });
        req3.HistoryLogs.Add(new WorkflowHistoryLog
        {
            WorkflowRequestId = req3.Id,
            Action = "SUBMITTED",
            ActorUsername = "itlead",
            ActorFullName = "Hendra Wijaya (IT Lead)",
            ActorRole = RoleNames.ITLead,
            FromStatus = "None",
            ToStatus = "InReview",
            Notes = "Pengajuan pengadaan barang kantor disubmit.",
            Timestamp = now.AddDays(-2)
        });
        req3.HistoryLogs.Add(new WorkflowHistoryLog
        {
            WorkflowRequestId = req3.Id,
            Action = "APPROVED_STEP",
            ActorUsername = "manager",
            ActorFullName = "Andi Pratama (Manager)",
            ActorRole = RoleNames.Manager,
            FromStatus = "InReview",
            ToStatus = "InReview",
            Notes = "[Persetujuan Kepala Divisi (Manager)] Disetujui, memang dibutuhkan untuk ruang kerja tim baru.",
            Timestamp = now.AddDays(-1).AddHours(-5)
        });
        req3.HistoryLogs.Add(new WorkflowHistoryLog
        {
            WorkflowRequestId = req3.Id,
            Action = "FULLY_APPROVED",
            ActorUsername = "financedirector",
            ActorFullName = "Surya Darmawan (Finance Director)",
            ActorRole = RoleNames.FinanceDirector,
            FromStatus = "InReview",
            ToStatus = "Approved",
            Notes = "[Persetujuan Anggaran Finance Director] Anggaran Q4 tersedia. Silakan proses PO ke vendor resmi.",
            Timestamp = now.AddDays(-1)
        });

        await dbContext.WorkflowRequests.AddRangeAsync([req1, req2, req3], cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        logger.LogInformation("Workflow database seeded with 3 dynamic form templates and 3 sample requests.");
    }
}
