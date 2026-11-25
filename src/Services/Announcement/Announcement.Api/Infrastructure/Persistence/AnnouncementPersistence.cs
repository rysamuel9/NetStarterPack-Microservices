using Announcement.Api.Domain.Entities;
using Announcement.Api.Domain.Interfaces;
using BuildingBlocks.Core.Common;
using BuildingBlocks.Core.Constants;
using BuildingBlocks.Core.Interfaces;
using BuildingBlocks.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Announcement.Api.Infrastructure.Persistence;

/// <summary>
/// DbContext terisolasi khusus untuk Announcement Microservice (Database-per-Service: NetStarterPack_AnnouncementDb).
/// Mengelola 5 tabel: Announcements, AnnouncementAttachments, AnnouncementLikes, AnnouncementComments, dan AnnouncementReads.
/// </summary>
public class AnnouncementDbContext(DbContextOptions<AnnouncementDbContext> options) : DbContext(options)
{
    public DbSet<Domain.Entities.Announcement> Announcements => Set<Domain.Entities.Announcement>();
    public DbSet<AnnouncementAttachment> AnnouncementAttachments => Set<AnnouncementAttachment>();
    public DbSet<AnnouncementLike> AnnouncementLikes => Set<AnnouncementLike>();
    public DbSet<AnnouncementComment> AnnouncementComments => Set<AnnouncementComment>();
    public DbSet<AnnouncementRead> AnnouncementReads => Set<AnnouncementRead>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // =====================================================================================
        // [TEMPLATE OPSI 1 DATABASE BERSAMA (SINGLE SHARED DB)]
        // Jika seluruh microservice memakai 1 database (NetStarterPack_SharedDb),
        // uncomment baris di bawah agar tabel otomatis masuk schema "announcement":
        // =====================================================================================
        // modelBuilder.HasDefaultSchema("announcement");

        modelBuilder.Entity<Domain.Entities.Announcement>(entity =>
        {
            entity.ToTable("Announcements");
            entity.Property(x => x.Title).HasMaxLength(220).IsRequired();
            entity.Property(x => x.Summary).HasMaxLength(500);
            entity.Property(x => x.Type).HasConversion<string>().HasMaxLength(40);
            entity.Property(x => x.BannerUrl).HasMaxLength(500);
            entity.Property(x => x.AuthorUsername).HasMaxLength(80).IsRequired();
            entity.Property(x => x.AuthorFullName).HasMaxLength(160).IsRequired();
            entity.Property(x => x.AuthorRole).HasMaxLength(60).IsRequired();
            entity.HasIndex(x => x.PublishedAt);
            entity.HasIndex(x => x.Type);
            entity.HasQueryFilter(x => !x.IsDeleted);
        });

        modelBuilder.Entity<AnnouncementAttachment>(entity =>
        {
            entity.ToTable("AnnouncementAttachments");
            entity.Property(x => x.FileName).HasMaxLength(260).IsRequired();
            entity.Property(x => x.StoredFileName).HasMaxLength(260).IsRequired();
            entity.Property(x => x.ContentType).HasMaxLength(120).IsRequired();
            entity.Property(x => x.Kind).HasConversion<string>().HasMaxLength(30);
            entity.Property(x => x.Url).HasMaxLength(500).IsRequired();
            entity.HasOne(x => x.Announcement)
                .WithMany(a => a.Attachments)
                .HasForeignKey(x => x.AnnouncementId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasQueryFilter(x => !x.IsDeleted);
        });

        modelBuilder.Entity<AnnouncementLike>(entity =>
        {
            entity.ToTable("AnnouncementLikes");
            entity.Property(x => x.Username).HasMaxLength(80).IsRequired();
            entity.Property(x => x.FullName).HasMaxLength(160).IsRequired();
            entity.HasIndex(x => new { x.AnnouncementId, x.UserId });
            entity.HasOne(x => x.Announcement)
                .WithMany(a => a.Likes)
                .HasForeignKey(x => x.AnnouncementId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasQueryFilter(x => !x.IsDeleted);
        });

        modelBuilder.Entity<AnnouncementComment>(entity =>
        {
            entity.ToTable("AnnouncementComments");
            entity.Property(x => x.Username).HasMaxLength(80).IsRequired();
            entity.Property(x => x.FullName).HasMaxLength(160).IsRequired();
            entity.Property(x => x.UserRole).HasMaxLength(60).IsRequired();
            entity.Property(x => x.Content).HasMaxLength(2000).IsRequired();
            entity.HasIndex(x => x.ParentCommentId);
            entity.HasOne(x => x.Announcement)
                .WithMany(a => a.Comments)
                .HasForeignKey(x => x.AnnouncementId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasQueryFilter(x => !x.IsDeleted);
        });

        modelBuilder.Entity<AnnouncementRead>(entity =>
        {
            entity.ToTable("AnnouncementReads");
            entity.HasIndex(x => new { x.AnnouncementId, x.UserId });
            entity.HasOne(x => x.Announcement)
                .WithMany(a => a.Reads)
                .HasForeignKey(x => x.AnnouncementId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasQueryFilter(x => !x.IsDeleted);
        });
    }
}

public class AnnouncementRepository(AnnouncementDbContext dbContext)
    : GenericRepository<Domain.Entities.Announcement, AnnouncementDbContext>(dbContext), IAnnouncementRepository
{
    public async Task<Domain.Entities.Announcement?> GetByIdWithDetailsAsync(Guid id, CancellationToken cancellationToken = default)
    {
        return await DbSet
            .Include(a => a.Attachments)
            .Include(a => a.Likes)
            .Include(a => a.Comments)
            .Include(a => a.Reads)
            .FirstOrDefaultAsync(a => a.Id == id, cancellationToken);
    }

    public async Task<(IReadOnlyList<Domain.Entities.Announcement> Items, int TotalCount)> GetPagedAsync(
        int page,
        int pageSize,
        string? type,
        string? search,
        CancellationToken cancellationToken = default)
    {
        IQueryable<Domain.Entities.Announcement> query = DbSet
            .AsNoTracking()
            .Where(a => a.IsPublished)
            .Include(a => a.Attachments)
            .Include(a => a.Likes)
            .Include(a => a.Comments)
            .Include(a => a.Reads);

        if (!string.IsNullOrWhiteSpace(type) && Enum.TryParse<AnnouncementType>(type.Trim(), true, out var parsedType))
        {
            query = query.Where(a => a.Type == parsedType);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(a =>
                a.Title.ToLower().Contains(term) ||
                a.Summary.ToLower().Contains(term) ||
                a.AuthorFullName.ToLower().Contains(term));
        }

        var totalCount = await query.CountAsync(cancellationToken);

        var items = await query
            .OrderByDescending(a => a.IsPinned)
            .ThenByDescending(a => a.PublishedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return (items, totalCount);
    }

    public async Task<IReadOnlyList<Domain.Entities.Announcement>> GetPublishedWithInteractionsAsync(CancellationToken cancellationToken = default)
    {
        return await DbSet
            .AsNoTracking()
            .Where(a => a.IsPublished)
            .Include(a => a.Attachments)
            .Include(a => a.Likes)
            .Include(a => a.Comments)
            .Include(a => a.Reads)
            .OrderByDescending(a => a.IsPinned)
            .ThenByDescending(a => a.PublishedAt)
            .ToListAsync(cancellationToken);
    }
}

public class AnnouncementUnitOfWork(AnnouncementDbContext dbContext) : IAnnouncementUnitOfWork
{
    private readonly Dictionary<Type, object> _repositories = new();

    public IAnnouncementRepository Announcements { get; } = new AnnouncementRepository(dbContext);
    public IRepository<AnnouncementAttachment> Attachments { get; } = new GenericRepository<AnnouncementAttachment, AnnouncementDbContext>(dbContext);
    public IRepository<AnnouncementLike> Likes { get; } = new GenericRepository<AnnouncementLike, AnnouncementDbContext>(dbContext);
    public IRepository<AnnouncementComment> Comments { get; } = new GenericRepository<AnnouncementComment, AnnouncementDbContext>(dbContext);
    public IRepository<AnnouncementRead> Reads { get; } = new GenericRepository<AnnouncementRead, AnnouncementDbContext>(dbContext);

    public IRepository<T> Repository<T>() where T : BaseEntity
    {
        var type = typeof(T);
        if (!_repositories.TryGetValue(type, out var repo))
        {
            repo = new GenericRepository<T, AnnouncementDbContext>(dbContext);
            _repositories[type] = repo;
        }
        return (IRepository<T>)repo;
    }

    public Task<int> SaveChangesAsync(CancellationToken cancellationToken = default) =>
        dbContext.SaveChangesAsync(cancellationToken);
}

public static class AnnouncementStorageHelper
{
    public static string GetUploadsDirectory(IHostEnvironment env)
    {
        var dir = Path.Combine(env.ContentRootPath, "App_Data", "uploads", "announcements");
        Directory.CreateDirectory(dir);
        return dir;
    }
}

public class AnnouncementDatabaseSeeder(
    AnnouncementDbContext dbContext,
    IHostEnvironment hostEnvironment,
    ILogger<AnnouncementDatabaseSeeder> logger,
    IFileStorageService? fileStorage = null)
{
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
                // try
                // {
                //     var creator = dbContext.Database.GetService<Microsoft.EntityFrameworkCore.Storage.IRelationalDatabaseCreator>();
                //     await creator.CreateTablesAsync(cancellationToken);
                // }
                // catch { }
            }

            await EnsureParentCommentColumnExistsAsync(cancellationToken);
        }
        else
        {
            await dbContext.Database.EnsureCreatedAsync(cancellationToken);
        }

        EnsureSeededAssetFiles();

        if (await dbContext.Announcements.AnyAsync(cancellationToken))
        {
            return;
        }

        logger.LogInformation("Seeding 12 sample HR corporate announcements into NetStarterPack_AnnouncementDb...");

        var now = DateTime.UtcNow;
        var hrManagerId = Guid.Parse("90000000-0000-0000-0000-000000000001");
        var hrSupervisorId = Guid.Parse("90000000-0000-0000-0000-000000000002");
        var hrStaffId = Guid.Parse("90000000-0000-0000-0000-000000000003");
        var sampleStaffId = Guid.Parse("90000000-0000-0000-0000-000000000004");
        var sampleMgrId = Guid.Parse("90000000-0000-0000-0000-000000000005");
        var firstSeededCommentId = Guid.Parse("91000000-0000-0000-0000-000000000001");

        var seeded = new List<Domain.Entities.Announcement>
        {
            new()
            {
                Title = "Pembaruan Kebijakan Kerja Hybrid (WFO 3 Hari / WFH 2 Hari) Mulai Q4 2026",
                Summary = "Penyesuaian jadwal kerja hybrid terbaru beserta tunjangan internet bulanan dan prosedur pengajuan remote working.",
                Type = AnnouncementType.HRPolicy,
                BannerUrl = "/api/announcements/files/seed-banner-hr-policy.svg",
                AllowComments = true,
                IsPinned = true,
                PublishedAt = now.AddHours(-2),
                AuthorUserId = hrManagerId,
                AuthorUsername = "hrmanager",
                AuthorFullName = "Rina Kusuma (HR Manager)",
                AuthorRole = RoleNames.HRManager,
                CreatedBy = "SystemSeeder",
                ContentHtml = """
                    <p>Halo seluruh tim, efektif mulai <strong>1 Desember 2026</strong> perusahaan memperbarui kebijakan kerja <em>Hybrid Working</em> agar kolaborasi lintas divisi makin optimal.</p>
                    <ul>
                        <li><strong>Hari WFO Wajib:</strong> Selasa, Rabu, dan Kamis (jam inti 10.00 – 16.00 WIB).</li>
                        <li><strong>Hari WFH Fleksibel:</strong> Senin dan Jumat (koordinasi langsung dengan Manager masing-masing).</li>
                        <li><strong>Tunjangan Internet:</strong> Disesuaikan menjadi <strong>Rp 350.000/bulan</strong> otomatis masuk ke slip gaji.</li>
                    </ul>
                    <p>Silakan unduh dokumen panduan lengkap pada lampiran di bawah, atau tulis pertanyaan kamu di kolom komentar ya!</p>
                    """,
                Attachments =
                [
                    new AnnouncementAttachment
                    {
                        FileName = "Denah-Ruang-Kolaborasi-Lantai5.svg",
                        StoredFileName = "seed-image-office-layout.svg",
                        ContentType = "image/svg+xml",
                        FileSizeBytes = 2048,
                        Kind = AttachmentKind.Image,
                        Url = "/api/announcements/files/seed-image-office-layout.svg",
                        CreatedBy = "SystemSeeder"
                    },
                    new AnnouncementAttachment
                    {
                        FileName = "Panduan-Hybrid-Work-2026.txt",
                        StoredFileName = "seed-doc-hybrid-policy.txt",
                        ContentType = "text/plain",
                        FileSizeBytes = 1024,
                        Kind = AttachmentKind.File,
                        Url = "/api/announcements/files/seed-doc-hybrid-policy.txt",
                        CreatedBy = "SystemSeeder"
                    }
                ],
                Likes =
                [
                    new AnnouncementLike { UserId = sampleStaffId, Username = "staff", FullName = "Dewi Lestari (Staff)", CreatedBy = "SystemSeeder" },
                    new AnnouncementLike { UserId = sampleMgrId, Username = "manager", FullName = "Andi Pratama (Manager)", CreatedBy = "SystemSeeder" }
                ],
                Comments =
                [
                    new AnnouncementComment
                    {
                        Id = firstSeededCommentId,
                        UserId = sampleStaffId,
                        Username = "staff",
                        FullName = "Dewi Lestari (Staff)",
                        UserRole = RoleNames.Staff,
                        Content = "Mantap Bu Rina! 🎉 Untuk tim yang sedang sprint release, apakah hari Kamis bisa tukar WFO ke Senin?",
                        CreatedAt = now.AddHours(-1),
                        CreatedBy = "SystemSeeder"
                    },
                    new AnnouncementComment
                    {
                        ParentCommentId = firstSeededCommentId,
                        UserId = hrManagerId,
                        Username = "hrmanager",
                        FullName = "Rina Kusuma (HR Manager)",
                        UserRole = RoleNames.HRManager,
                        Content = "Bisa banget Dewi! 👍 Cukup info ke Manager langsung agar tercatat di kalender tim ya.",
                        CreatedAt = now.AddMinutes(-35),
                        CreatedBy = "SystemSeeder"
                    }
                ]
            },
            new()
            {
                Title = "[URGENT] Batas Akhir Pengisian Evaluasi Kinerja (KPI) & Review Semester II",
                Summary = "Seluruh karyawan wajib melengkapi self-assessment KPI paling lambat Jumat pukul 17.00 WIB. Komentar dinonaktifkan untuk pengumuman resmi ini.",
                Type = AnnouncementType.Urgent,
                BannerUrl = "/api/announcements/files/seed-banner-urgent.svg",
                AllowComments = false,
                IsPinned = true,
                PublishedAt = now.AddHours(-5),
                AuthorUserId = hrSupervisorId,
                AuthorUsername = "hrsupervisor",
                AuthorFullName = "Dimas Prakoso (HR Supervisor)",
                AuthorRole = RoleNames.HRSupervisor,
                CreatedBy = "SystemSeeder",
                ContentHtml = """
                    <p>Mohon perhatian seluruh karyawan dan <strong>Department Manager</strong>. Pengisian form <strong>KPI Self-Assessment Semester II</strong> akan ditutup pada <strong>Jumat, 27 November 2026 pukul 17.00 WIB</strong>.</p>
                    <p><em>Catatan:</em> Kolom komentar sengaja dimatikan agar informasi tetap fokus. Jika ada kendala teknis portal HR, hubungi <strong>hr-support@starterpack.local</strong>.</p>
                    """,
                Likes =
                [
                    new AnnouncementLike { UserId = sampleMgrId, Username = "manager", FullName = "Andi Pratama (Manager)", CreatedBy = "SystemSeeder" }
                ]
            },
            new()
            {
                Title = "All-Hands Townhall Q4 & Peluncuran Platform Microservices Internal",
                Summary = "Yuk gabung di Townhall akhir tahun bersama Direksi, demo fitur Workflow Approval baru, dan sesi Q&A santai plus makan siang bersama.",
                Type = AnnouncementType.Event,
                BannerUrl = "/api/announcements/files/seed-banner-townhall.svg",
                AllowComments = true,
                IsPinned = false,
                PublishedAt = now.AddHours(-12),
                AuthorUserId = hrStaffId,
                AuthorUsername = "hrstaff",
                AuthorFullName = "Nadia Putri (HR Staff)",
                AuthorRole = RoleNames.HRStaff,
                CreatedBy = "SystemSeeder",
                ContentHtml = """
                    <p>Halo semuanya! Jangan lewatkan <strong>All-Hands Townhall Q4 2026</strong> yang akan diadakan secara hybrid di Auditorium Lantai 5 dan Zoom:</p>
                    <ul>
                        <li><strong>Waktu:</strong> Kamis, 3 Desember 2026 | 13.30 – 15.30 WIB</li>
                        <li><strong>Agenda:</strong> Pencapaian Q4, Roadmap 2027, dan <em>Live Demo</em> Sistem Pengajuan Form &amp; Approval baru.</li>
                        <li><strong>Doorprize:</strong> Tersedia voucher belanja &amp; mechanical keyboard untuk penanya terbaik!</li>
                    </ul>
                    """,
                Likes =
                [
                    new AnnouncementLike { UserId = sampleStaffId, Username = "staff", FullName = "Dewi Lestari (Staff)", CreatedBy = "SystemSeeder" }
                ]
            },
            new()
            {
                Title = "Program Medical Check-Up Tahunan & Vaksinasi Flu Gratis Karyawan",
                Summary = "Pendaftaran jadwal MCU tahunan di RS Mitra & layanan mini-MCU di kantor dibuka hingga akhir minggu depan.",
                Type = AnnouncementType.Celebration,
                BannerUrl = "/api/announcements/files/seed-banner-wellness.svg",
                AllowComments = true,
                IsPinned = false,
                PublishedAt = now.AddDays(-1),
                AuthorUserId = hrStaffId,
                AuthorUsername = "hrstaff",
                AuthorFullName = "Nadia Putri (HR Staff)",
                AuthorRole = RoleNames.HRStaff,
                CreatedBy = "SystemSeeder",
                ContentHtml = "<p>Sebagai bagian dari program <strong>Employee Wellness 2026</strong>, seluruh karyawan tetap berhak mengikuti <em>Medical Check-Up</em> lengkap tanpa biaya. Daftar melalui form HR sebelum 5 Desember.</p>"
            },
            new()
            {
                Title = "Jadwal Cuti Bersama Akhir Tahun & Prosedur Pengajuan Cuti Tahunan",
                Summary = "Pastikan pengajuan cuti Desember sudah disubmit minimal H-7 melalui menu Buat Pengajuan Form (Workflow.Api).",
                Type = AnnouncementType.HRPolicy,
                BannerUrl = "/api/announcements/files/seed-banner-hr-policy.svg",
                AllowComments = true,
                IsPinned = false,
                PublishedAt = now.AddDays(-2),
                AuthorUserId = hrManagerId,
                AuthorUsername = "hrmanager",
                AuthorFullName = "Rina Kusuma (HR Manager)",
                AuthorRole = RoleNames.HRManager,
                CreatedBy = "SystemSeeder",
                ContentHtml = "<p>Untuk menjaga kelancaran operasional di penghujung tahun, seluruh pengajuan <strong>Cuti Tahunan</strong> wajib diajukan lewat menu <em>Buat Pengajuan Form &rarr; Form Pengajuan Cuti</em> minimal 7 hari sebelumnya agar bisa di-review Manager dan HR.</p>"
            },
            new()
            {
                Title = "Maintenance Terjadwal Server VPN & Email Perusahaan Hari Sabtu",
                Summary = "Tim IT Infrastructure akan melakukan upgrade sertifikat keamanan pukul 22.00 – 23.30 WIB.",
                Type = AnnouncementType.Maintenance,
                BannerUrl = "/api/announcements/files/seed-banner-urgent.svg",
                AllowComments = false,
                IsPinned = false,
                PublishedAt = now.AddDays(-3),
                AuthorUserId = hrSupervisorId,
                AuthorUsername = "hrsupervisor",
                AuthorFullName = "Dimas Prakoso (HR Supervisor)",
                AuthorRole = RoleNames.HRSupervisor,
                CreatedBy = "SystemSeeder",
                ContentHtml = "<p>Diberitahukan bahwa akses <strong>VPN Internal</strong> akan mengalami downtime singkat selama <em>90 menit</em> pada Sabtu malam pukul 22.00 WIB. Aplikasi web publik tetap berjalan normal.</p>"
            },
            new()
            {
                Title = "Selamat Bergabung! Employee Onboarding Batch November 2026",
                Summary = "Mari kita sambut 6 rekan kerja baru di divisi Engineering, Product Design, dan Finance Operations.",
                Type = AnnouncementType.Celebration,
                BannerUrl = "/api/announcements/files/seed-banner-wellness.svg",
                AllowComments = true,
                IsPinned = false,
                PublishedAt = now.AddDays(-4),
                AuthorUserId = hrStaffId,
                AuthorUsername = "hrstaff",
                AuthorFullName = "Nadia Putri (HR Staff)",
                AuthorRole = RoleNames.HRStaff,
                CreatedBy = "SystemSeeder",
                ContentHtml = "<p><strong>Welcome aboard!</strong> Bulan ini keluarga besar kita bertambah 6 talenta baru. Jangan ragu menyapa mereka di pantry lantai 3 atau lewat komentar di bawah ya!</p>"
            },
            new()
            {
                Title = "Workshop Internal: Clean Architecture & Microservices .NET 10",
                Summary = "Sharing session santai dari tim Architecture terbuka untuk Backend, Frontend, dan QA Engineer.",
                Type = AnnouncementType.Event,
                BannerUrl = "/api/announcements/files/seed-banner-townhall.svg",
                AllowComments = true,
                IsPinned = false,
                PublishedAt = now.AddDays(-5),
                AuthorUserId = hrSupervisorId,
                AuthorUsername = "hrsupervisor",
                AuthorFullName = "Dimas Prakoso (HR Supervisor)",
                AuthorRole = RoleNames.HRSupervisor,
                CreatedBy = "SystemSeeder",
                ContentHtml = "<p>Sesi <em>Tech Talk</em> minggu depan akan membahas implementasi <strong>YARP API Gateway</strong>, <em>Database-per-Service</em>, dan <em>Redis Hybrid Cache</em> di .NET 10. Snack disediakan oleh HR!</p>"
            },
            new()
            {
                Title = "Pengingat Klaim Reimbursement Kacamata & Fasilitas Belajar 2026",
                Summary = "Batas akhir submit nota reimbursement tahun buku 2026 adalah 15 Desember pukul 15.00 WIB.",
                Type = AnnouncementType.HRPolicy,
                BannerUrl = "/api/announcements/files/seed-banner-hr-policy.svg",
                AllowComments = true,
                IsPinned = false,
                PublishedAt = now.AddDays(-6),
                AuthorUserId = hrManagerId,
                AuthorUsername = "hrmanager",
                AuthorFullName = "Rina Kusuma (HR Manager)",
                AuthorRole = RoleNames.HRManager,
                CreatedBy = "SystemSeeder",
                ContentHtml = "<p>Sisa plafon <strong>Learning Budget</strong> dan <strong>Kacamata</strong> tahun 2026 tidak dapat di-carry over ke tahun depan. Pastikan kuitansi asli sudah diunggah sebelum 15 Desember.</p>"
            },
            new()
            {
                Title = "Perubahan Lokasi Parkir Sementara Gedung B Selama Renovasi Lobby",
                Summary = "Area parkir motor dipindahkan sementara ke Basement P2 selama 2 minggu ke depan.",
                Type = AnnouncementType.General,
                BannerUrl = null,
                AllowComments = true,
                IsPinned = false,
                PublishedAt = now.AddDays(-7),
                AuthorUserId = hrStaffId,
                AuthorUsername = "hrstaff",
                AuthorFullName = "Nadia Putri (HR Staff)",
                AuthorRole = RoleNames.HRStaff,
                CreatedBy = "SystemSeeder",
                ContentHtml = "<p>Sehubungan dengan peremajaan kanopi Lobby Gedung B, akses parkir motor dialihkan sementara ke <strong>Basement P2</strong> dengan menggunakan kartu akses kantor yang sama.</p>"
            },
            new()
            {
                Title = "Survei Kepuasan Karyawan (Employee Engagement Survey) Semester II",
                Summary = "Bantu kami membuat lingkungan kerja makin nyaman—pengisian bersifat anonim dan hanya butuh 5 menit.",
                Type = AnnouncementType.General,
                BannerUrl = "/api/announcements/files/seed-banner-wellness.svg",
                AllowComments = true,
                IsPinned = false,
                PublishedAt = now.AddDays(-9),
                AuthorUserId = hrSupervisorId,
                AuthorUsername = "hrsupervisor",
                AuthorFullName = "Dimas Prakoso (HR Supervisor)",
                AuthorRole = RoleNames.HRSupervisor,
                CreatedBy = "SystemSeeder",
                ContentHtml = "<p>Masukan jujur dari kamu sangat berarti bagi tim <em>People Operations</em>. Hasil agregat survei akan dibagikan secara transparan pada Townhall Q4.</p>"
            },
            new()
            {
                Title = "Update Daftar Rekanan Rumah Sakit Asuransi Kesehatan Karyawan",
                Summary = "Penambahan 14 rumah sakit rekanan baru di wilayah Jabodetabek, Bandung, dan Surabaya untuk kartu cashless.",
                Type = AnnouncementType.HRPolicy,
                BannerUrl = "/api/announcements/files/seed-banner-hr-policy.svg",
                AllowComments = true,
                IsPinned = false,
                PublishedAt = now.AddDays(-11),
                AuthorUserId = hrManagerId,
                AuthorUsername = "hrmanager",
                AuthorFullName = "Rina Kusuma (HR Manager)",
                AuthorRole = RoleNames.HRManager,
                CreatedBy = "SystemSeeder",
                ContentHtml = "<p>Daftar lengkap provider rumah sakit <strong>Cashless</strong> edisi terbaru sudah aktif di aplikasi asuransi masing-masing karyawan tanpa perlu cetak ulang kartu fisik.</p>"
            }
        };

        await dbContext.Announcements.AddRangeAsync(seeded, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        logger.LogInformation("Seeded 12 announcements successfully into NetStarterPack_AnnouncementDb!");
    }

    /// <summary>
    /// Auto-upgrade aman untuk database existing (tanpa DROP DATABASE):
    /// menambahkan kolom ParentCommentId pada AnnouncementComments jika belum ada.
    /// </summary>
    private async Task EnsureParentCommentColumnExistsAsync(CancellationToken cancellationToken)
    {
        try
        {
            if (dbContext.Database.IsSqlServer())
            {
                await dbContext.Database.ExecuteSqlRawAsync("""
                    IF OBJECT_ID(N'AnnouncementComments', N'U') IS NOT NULL
                       AND COL_LENGTH(N'AnnouncementComments', N'ParentCommentId') IS NULL
                    BEGIN
                        ALTER TABLE [AnnouncementComments] ADD [ParentCommentId] uniqueidentifier NULL;
                        CREATE INDEX [IX_AnnouncementComments_ParentCommentId] ON [AnnouncementComments]([ParentCommentId]);
                    END
                    """, cancellationToken);
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "[Announcement.Api] Gagal memeriksa auto-upgrade kolom ParentCommentId.");
        }
    }

    private void EnsureSeededAssetFiles()
    {
        EnsureSeededAssetFilesAsync(CancellationToken.None).GetAwaiter().GetResult();
    }

    private async Task EnsureSeededAssetFilesAsync(CancellationToken cancellationToken)
    {
        try
        {
            var assets = new (string FileName, string ContentType, string Content)[]
            {
                ("seed-banner-hr-policy.svg", "image/svg+xml", """
                <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="420" viewBox="0 0 1200 420">
                  <defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0f766e"/><stop offset="100%" stop-color="#0e7490"/></linearGradient></defs>
                  <rect width="1200" height="420" fill="url(#g1)"/>
                  <circle cx="1050" cy="80" r="180" fill="#ffffff" fill-opacity="0.08"/>
                  <circle cx="150" cy="360" r="140" fill="#2dd4bf" fill-opacity="0.14"/>
                  <text x="80" y="160" font-family="Segoe UI, sans-serif" font-size="24" font-weight="700" fill="#99f6e4" letter-spacing="3">PEOPLE &amp; HR POLICY UPDATE</text>
                  <text x="80" y="230" font-family="Segoe UI, sans-serif" font-size="52" font-weight="800" fill="#ffffff">Kebijakan Kerja &amp; SDM 2026</text>
                  <text x="80" y="285" font-family="Segoe UI, sans-serif" font-size="22" fill="#ccfbf1">Informasi resmi dari Human Resources &amp; People Operations</text>
                </svg>
                """),
                ("seed-banner-urgent.svg", "image/svg+xml", """
                <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="420" viewBox="0 0 1200 420">
                  <defs><linearGradient id="g2" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#9f1239"/><stop offset="100%" stop-color="#ea580c"/></linearGradient></defs>
                  <rect width="1200" height="420" fill="url(#g2)"/>
                  <circle cx="1080" cy="330" r="190" fill="#ffffff" fill-opacity="0.08"/>
                  <text x="80" y="160" font-family="Segoe UI, sans-serif" font-size="24" font-weight="700" fill="#fecdd3" letter-spacing="3">PRIORITY NOTICE • ACTION REQUIRED</text>
                  <text x="80" y="230" font-family="Segoe UI, sans-serif" font-size="52" font-weight="800" fill="#ffffff">Pengumuman Penting Internal</text>
                  <text x="80" y="285" font-family="Segoe UI, sans-serif" font-size="22" fill="#ffedd5">Mohon segera ditindaklanjuti sebelum batas waktu yang ditentukan</text>
                </svg>
                """),
                ("seed-banner-townhall.svg", "image/svg+xml", """
                <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="420" viewBox="0 0 1200 420">
                  <defs><linearGradient id="g3" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1e1b4b"/><stop offset="100%" stop-color="#4f46e5"/></linearGradient></defs>
                  <rect width="1200" height="420" fill="url(#g3)"/>
                  <circle cx="980" cy="120" r="210" fill="#38bdf8" fill-opacity="0.14"/>
                  <text x="80" y="160" font-family="Segoe UI, sans-serif" font-size="24" font-weight="700" fill="#a5b4fc" letter-spacing="3">COMPANY EVENT &amp; TECH SHARING</text>
                  <text x="80" y="230" font-family="Segoe UI, sans-serif" font-size="52" font-weight="800" fill="#ffffff">All-Hands Townhall &amp; Workshop</text>
                  <text x="80" y="285" font-family="Segoe UI, sans-serif" font-size="22" fill="#e0e7ff">Kolaborasi lintas tim, demo inovasi, dan diskusi terbuka</text>
                </svg>
                """),
                ("seed-banner-wellness.svg", "image/svg+xml", """
                <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="420" viewBox="0 0 1200 420">
                  <defs><linearGradient id="g4" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#065f46"/><stop offset="100%" stop-color="#10b981"/></linearGradient></defs>
                  <rect width="1200" height="420" fill="url(#g4)"/>
                  <circle cx="1020" cy="280" r="170" fill="#ffffff" fill-opacity="0.1"/>
                  <text x="80" y="160" font-family="Segoe UI, sans-serif" font-size="24" font-weight="700" fill="#a7f3d0" letter-spacing="3">CULTURE &amp; EMPLOYEE WELLNESS</text>
                  <text x="80" y="230" font-family="Segoe UI, sans-serif" font-size="52" font-weight="800" fill="#ffffff">Program Kesehatan &amp; Komunitas</text>
                  <text x="80" y="285" font-family="Segoe UI, sans-serif" font-size="22" fill="#d1fae5">Mendukung keseimbangan kerja dan kesehatan seluruh karyawan</text>
                </svg>
                """),
                ("seed-image-office-layout.svg", "image/svg+xml", """
                <svg xmlns="http://www.w3.org/2000/svg" width="900" height="500" viewBox="0 0 900 500">
                  <rect width="900" height="500" fill="#f8fafc"/>
                  <rect x="40" y="40" width="820" height="420" rx="20" fill="#ffffff" stroke="#cbd5e1" stroke-width="3"/>
                  <rect x="80" y="90" width="320" height="160" rx="12" fill="#ccfbf1" stroke="#0d9488" stroke-width="2"/>
                  <text x="120" y="175" font-family="Segoe UI, sans-serif" font-size="22" font-weight="700" fill="#115e59">Hot-Desk Zone (WFO)</text>
                  <rect x="440" y="90" width="380" height="160" rx="12" fill="#e0f2fe" stroke="#0284c7" stroke-width="2"/>
                  <text x="495" y="175" font-family="Segoe UI, sans-serif" font-size="22" font-weight="700" fill="#075985">Collaboration Pods &amp; Zoom</text>
                  <rect x="80" y="280" width="740" height="130" rx="12" fill="#fef3c7" stroke="#d97706" stroke-width="2"/>
                  <text x="270" y="352" font-family="Segoe UI, sans-serif" font-size="22" font-weight="700" fill="#92400e">Auditorium Townhall &amp; Pantry Lantai 5</text>
                </svg>
                """),
                ("seed-doc-hybrid-policy.txt", "text/plain; charset=utf-8", """
                PANDUAN RINGKAS KEBIJAKAN KERJA HYBRID 2026
                ============================================
                1. Jadwal WFO Wajib: Selasa, Rabu, Kamis (Jam inti 10.00 - 16.00 WIB).
                2. Jadwal WFH Fleksibel: Senin & Jumat.
                3. Tunjangan Internet: Rp 350.000/bulan.
                4. Kontak HR Operations: hr-support@starterpack.local
                """),
            };

            if (fileStorage is not null)
            {
                foreach (var (fileName, contentType, content) in assets)
                {
                    var key = FileSignatureValidator.NormalizeObjectKey("announcements", fileName);
                    if (!await fileStorage.ExistsAsync(key, cancellationToken))
                    {
                        await using var ms = new MemoryStream(System.Text.Encoding.UTF8.GetBytes(content.Trim()));
                        await fileStorage.UploadAsync("announcements", fileName, ms, contentType, cancellationToken);
                    }
                }
                return;
            }

            var dir = AnnouncementStorageHelper.GetUploadsDirectory(hostEnvironment);
            foreach (var (fileName, _, content) in assets)
            {
                WriteIfMissing(Path.Combine(dir, fileName), content);
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "[Announcement.Api] Gagal membuat file aset seed.");
        }
    }

    private static void WriteIfMissing(string path, string content)
    {
        if (!File.Exists(path))
        {
            File.WriteAllText(path, content.Trim());
        }
    }
}
