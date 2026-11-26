using BuildingBlocks.Core.Common;
using BuildingBlocks.Core.Interfaces;
using BuildingBlocks.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Tracking.Api.Domain.Entities;
using Tracking.Api.Domain.Interfaces;

namespace Tracking.Api.Infrastructure.Persistence;

public class TrackingDbContext(DbContextOptions<TrackingDbContext> options) : DbContext(options)
{
    public DbSet<TrackingAssignment> Assignments => Set<TrackingAssignment>();
    public DbSet<TrackingBreadcrumb> Breadcrumbs => Set<TrackingBreadcrumb>();
    public DbSet<TrackingStatusLog> StatusLogs => Set<TrackingStatusLog>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<TrackingAssignment>(entity =>
        {
            entity.ToTable("TrackingAssignments");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.AssignmentCode).IsUnique();
            entity.HasIndex(e => e.AssigneeUsername);
            entity.HasIndex(e => e.Status);
            entity.Property(e => e.AssignmentCode).HasMaxLength(40).IsRequired();
            entity.Property(e => e.Title).HasMaxLength(200).IsRequired();
            entity.Property(e => e.ReferenceCode).HasMaxLength(60);
            entity.Property(e => e.DispatcherUsername).HasMaxLength(80).IsRequired();
            entity.Property(e => e.DispatcherFullName).HasMaxLength(160).IsRequired();
            entity.Property(e => e.AssigneeUsername).HasMaxLength(80).IsRequired();
            entity.Property(e => e.AssigneeFullName).HasMaxLength(160).IsRequired();
            entity.Property(e => e.OriginLabel).HasMaxLength(160).IsRequired();
            entity.Property(e => e.DestinationLabel).HasMaxLength(160).IsRequired();
            entity.Property(e => e.DestinationAddress).HasMaxLength(350).IsRequired();
            entity.Property(e => e.PodPhotoUrl).HasMaxLength(350);
            entity.Property(e => e.PodRecipientName).HasMaxLength(160);
            entity.HasQueryFilter(e => !e.IsDeleted);
        });

        modelBuilder.Entity<TrackingBreadcrumb>(entity =>
        {
            entity.ToTable("TrackingBreadcrumbs");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.TrackingAssignmentId, e.RecordedAt });
            entity.Property(e => e.EventTag).HasMaxLength(32).IsRequired();
            entity.HasOne(e => e.Assignment)
                  .WithMany(a => a.Breadcrumbs)
                  .HasForeignKey(e => e.TrackingAssignmentId)
                  .OnDelete(DeleteBehavior.Cascade);
            entity.HasQueryFilter(e => !e.IsDeleted);
        });

        modelBuilder.Entity<TrackingStatusLog>(entity =>
        {
            entity.ToTable("TrackingStatusLogs");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.TrackingAssignmentId, e.Timestamp });
            entity.Property(e => e.FromStatus).HasMaxLength(40).IsRequired();
            entity.Property(e => e.ToStatus).HasMaxLength(40).IsRequired();
            entity.Property(e => e.ActorUsername).HasMaxLength(80).IsRequired();
            entity.Property(e => e.ActorFullName).HasMaxLength(160).IsRequired();
            entity.HasOne(e => e.Assignment)
                  .WithMany(a => a.StatusLogs)
                  .HasForeignKey(e => e.TrackingAssignmentId)
                  .OnDelete(DeleteBehavior.Cascade);
            entity.HasQueryFilter(e => !e.IsDeleted);
        });
    }
}

public class TrackingAssignmentRepository(TrackingDbContext dbContext)
    : GenericRepository<TrackingAssignment, TrackingDbContext>(dbContext), ITrackingAssignmentRepository
{
    public Task<List<TrackingAssignment>> GetAllWithSummaryAsync(CancellationToken cancellationToken = default) =>
        DbSet
            .AsNoTracking()
            .AsSplitQuery()
            .Include(a => a.Breadcrumbs)
            .OrderByDescending(a => a.CreatedAt)
            .ToListAsync(cancellationToken);

    public Task<TrackingAssignment?> GetByIdWithDetailsAsync(Guid id, CancellationToken cancellationToken = default) =>
        DbSet
            .AsSplitQuery()
            .Include(a => a.Breadcrumbs)
            .Include(a => a.StatusLogs)
            .FirstOrDefaultAsync(a => a.Id == id, cancellationToken);
}

public class TrackingUnitOfWork(TrackingDbContext dbContext) : ITrackingUnitOfWork
{
    private ITrackingAssignmentRepository? _assignments;
    private IRepository<TrackingBreadcrumb>? _breadcrumbs;
    private IRepository<TrackingStatusLog>? _statusLogs;

    public ITrackingAssignmentRepository Assignments => _assignments ??= new TrackingAssignmentRepository(dbContext);
    public IRepository<TrackingBreadcrumb> Breadcrumbs => _breadcrumbs ??= new GenericRepository<TrackingBreadcrumb, TrackingDbContext>(dbContext);
    public IRepository<TrackingStatusLog> StatusLogs => _statusLogs ??= new GenericRepository<TrackingStatusLog, TrackingDbContext>(dbContext);

    public Task<int> SaveChangesAsync(CancellationToken cancellationToken = default) =>
        dbContext.SaveChangesAsync(cancellationToken);
}

public class TrackingDatabaseSeeder(
    TrackingDbContext dbContext,
    ILogger<TrackingDatabaseSeeder> logger)
{
    public async Task SeedAsync(CancellationToken cancellationToken = default)
    {
        if (dbContext.Database.IsRelational())
        {
            if (dbContext.Database.GetMigrations().Any())
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

        if (await dbContext.Assignments.AnyAsync(cancellationToken))
        {
            return;
        }

        logger.LogInformation("Seeding initial Field Dispatch & Live Tracking assignments into NetStarterPack_TrackingDb...");

        var now = DateTime.UtcNow;

        // 1. Tugas InTransit (aktif di peta Command Center) — Staff sedang kirim laptop dari Monas ke Menara Sudirman
        var activeTrip = new TrackingAssignment
        {
            AssignmentCode = "TRK-2026-001",
            Title = "Pengiriman Unit Laptop ThinkPad P14s (Batch Q4)",
            TaskType = TrackingTaskType.Delivery,
            ReferenceCode = "ORD-2026-001",
            Notes = "Pastikan serah terima langsung dengan PIC IT Gedung dan foto berita acara.",
            DispatcherUserId = Guid.Empty,
            DispatcherUsername = "manager",
            DispatcherFullName = "Andi Pratama (Manager)",
            AssigneeUserId = Guid.Empty,
            AssigneeUsername = "staff",
            AssigneeFullName = "Dewi Lestari (Staff)",
            OriginLabel = "HQ Jakarta (Monas)",
            OriginLatitude = -6.175392,
            OriginLongitude = 106.827153,
            DestinationLabel = "Menara Sudirman (Klien Enterprise)",
            DestinationAddress = "Jl. Jend. Sudirman Kav. 60, Senayan, Jakarta Selatan",
            DestinationLatitude = -6.224495,
            DestinationLongitude = 106.807755,
            GeofenceRadiusMeters = 200,
            Status = TrackingStatus.InTransit,
            StartedAt = now.AddMinutes(-18),
            LastLatitude = -6.201945,
            LastLongitude = 106.822680,
            LastAccuracyMeters = 12,
            LastSpeedKmh = 34.5,
            LastDistanceToDestinationMeters = GeoDistanceCalculator.CalculateHaversineMeters(-6.201945, 106.822680, -6.224495, 106.807755),
            LastPingAt = now.AddMinutes(-1),
            TotalDistanceMeters = 3180,
            CreatedAt = now.AddHours(-1),
            CreatedBy = "manager"
        };

        var activePoints = new (double Lat, double Lng, int MinsAgo, string Tag)[]
        {
            (-6.175392, 106.827153, 18, "START"),
            (-6.184610, 106.823940, 13, "PING"),
            (-6.193280, 106.823110, 7, "PING"),
            (-6.201945, 106.822680, 1, "PING")
        };
        foreach (var pt in activePoints)
        {
            activeTrip.Breadcrumbs.Add(new TrackingBreadcrumb
            {
                TrackingAssignmentId = activeTrip.Id,
                Latitude = pt.Lat,
                Longitude = pt.Lng,
                AccuracyMeters = 12,
                SpeedKmh = pt.Tag == "START" ? 0 : 32,
                DistanceToDestinationMeters = GeoDistanceCalculator.CalculateHaversineMeters(pt.Lat, pt.Lng, activeTrip.DestinationLatitude, activeTrip.DestinationLongitude),
                EventTag = pt.Tag,
                RecordedAt = now.AddMinutes(-pt.MinsAgo),
                CreatedBy = "staff"
            });
        }
        activeTrip.StatusLogs.Add(new TrackingStatusLog
        {
            TrackingAssignmentId = activeTrip.Id,
            FromStatus = "None",
            ToStatus = "Assigned",
            ActorUsername = "manager",
            ActorFullName = "Andi Pratama (Manager)",
            Notes = "Tugas dibuat dan dikirim ke petugas lapangan.",
            Latitude = activeTrip.OriginLatitude,
            Longitude = activeTrip.OriginLongitude,
            Timestamp = now.AddHours(-1),
            CreatedBy = "manager"
        });
        activeTrip.StatusLogs.Add(new TrackingStatusLog
        {
            TrackingAssignmentId = activeTrip.Id,
            FromStatus = "Assigned",
            ToStatus = "InTransit",
            ActorUsername = "staff",
            ActorFullName = "Dewi Lestari (Staff)",
            Notes = "Berangkat dari HQ Jakarta menuju Menara Sudirman.",
            Latitude = activeTrip.OriginLatitude,
            Longitude = activeTrip.OriginLongitude,
            Timestamp = now.AddMinutes(-18),
            CreatedBy = "staff"
        });

        // 2. Tugas Assigned (siap diklik Start Trip oleh staff di Mobile / Simulasi)
        var assignedTrip = new TrackingAssignment
        {
            AssignmentCode = "TRK-2026-002",
            Title = "Kunjungan Audit & Maintenance Server Cabang SCBD",
            TaskType = TrackingTaskType.Maintenance,
            ReferenceCode = "MTN-2026-014",
            Notes = "Cek suhu rak server, baterai UPS, dan dokumentasikan log checklist.",
            DispatcherUserId = Guid.Empty,
            DispatcherUsername = "manager",
            DispatcherFullName = "Andi Pratama (Manager)",
            AssigneeUserId = Guid.Empty,
            AssigneeUsername = "staff",
            AssigneeFullName = "Dewi Lestari (Staff)",
            OriginLabel = "HQ Jakarta (Monas)",
            OriginLatitude = -6.175392,
            OriginLongitude = 106.827153,
            DestinationLabel = "Pacific Place / Data Center SCBD",
            DestinationAddress = "Jl. Jend. Sudirman Kav. 52-53, SCBD, Jakarta Selatan",
            DestinationLatitude = -6.224110,
            DestinationLongitude = 106.809740,
            GeofenceRadiusMeters = 150,
            Status = TrackingStatus.Assigned,
            LastDistanceToDestinationMeters = GeoDistanceCalculator.CalculateHaversineMeters(-6.175392, 106.827153, -6.224110, 106.809740),
            CreatedAt = now.AddMinutes(-40),
            CreatedBy = "manager"
        };
        assignedTrip.StatusLogs.Add(new TrackingStatusLog
        {
            TrackingAssignmentId = assignedTrip.Id,
            FromStatus = "None",
            ToStatus = "Assigned",
            ActorUsername = "manager",
            ActorFullName = "Andi Pratama (Manager)",
            Notes = "Siap dijalankan dari aplikasi Mobile (atau tombol Simulasi Rute).",
            Latitude = assignedTrip.OriginLatitude,
            Longitude = assignedTrip.OriginLongitude,
            Timestamp = now.AddMinutes(-40),
            CreatedBy = "manager"
        });

        // 3. Tugas PendingVerification (contoh workflow approval Manager karena submit di luar radius geofence)
        var pendingVerify = new TrackingAssignment
        {
            AssignmentCode = "TRK-2026-003",
            Title = "Kunjungan Klien Corporate — PT Nusantara Logistik",
            TaskType = TrackingTaskType.FieldVisit,
            ReferenceCode = "VST-2026-009",
            Notes = "Presentasi kontrak tahunan & penandatanganan SLA.",
            DispatcherUserId = Guid.Empty,
            DispatcherUsername = "admin",
            DispatcherFullName = "Administrator",
            AssigneeUserId = Guid.Empty,
            AssigneeUsername = "staff",
            AssigneeFullName = "Dewi Lestari (Staff)",
            OriginLabel = "HQ Jakarta (Monas)",
            OriginLatitude = -6.175392,
            OriginLongitude = 106.827153,
            DestinationLabel = "Menara Kuningan",
            DestinationAddress = "Jl. HR Rasuna Said Blok X-7, Kuningan, Jakarta Selatan",
            DestinationLatitude = -6.218650,
            DestinationLongitude = 106.830490,
            GeofenceRadiusMeters = 150,
            Status = TrackingStatus.PendingVerification,
            StartedAt = now.AddHours(-3),
            ArrivedAt = now.AddHours(-2).AddMinutes(-15),
            LastLatitude = -6.221500,
            LastLongitude = 106.831800,
            LastAccuracyMeters = 18,
            LastSpeedKmh = 0,
            LastDistanceToDestinationMeters = GeoDistanceCalculator.CalculateHaversineMeters(-6.221500, 106.831800, -6.218650, 106.830490),
            LastPingAt = now.AddHours(-2).AddMinutes(-10),
            TotalDistanceMeters = 5420,
            PodRecipientName = "Pak Hendra (VP Procurement)",
            PodNotes = "Meeting dipindahkan mendadak ke kafe seberang Menara Kuningan (~340m dari titik pin).",
            CreatedAt = now.AddHours(-4),
            CreatedBy = "admin"
        };
        pendingVerify.Breadcrumbs.Add(new TrackingBreadcrumb
        {
            TrackingAssignmentId = pendingVerify.Id,
            Latitude = pendingVerify.OriginLatitude,
            Longitude = pendingVerify.OriginLongitude,
            AccuracyMeters = 15,
            SpeedKmh = 0,
            DistanceToDestinationMeters = 4820,
            EventTag = "START",
            RecordedAt = now.AddHours(-3),
            CreatedBy = "staff"
        });
        pendingVerify.Breadcrumbs.Add(new TrackingBreadcrumb
        {
            TrackingAssignmentId = pendingVerify.Id,
            Latitude = -6.221500,
            Longitude = 106.831800,
            AccuracyMeters = 18,
            SpeedKmh = 0,
            DistanceToDestinationMeters = 348,
            EventTag = "COMPLETED",
            RecordedAt = now.AddHours(-2).AddMinutes(-10),
            CreatedBy = "staff"
        });
        pendingVerify.StatusLogs.Add(new TrackingStatusLog
        {
            TrackingAssignmentId = pendingVerify.Id,
            FromStatus = "Arrived",
            ToStatus = "PendingVerification",
            ActorUsername = "staff",
            ActorFullName = "Dewi Lestari (Staff)",
            Notes = "POD disubmit di luar radius geofence (348m > 150m). Menunggu verifikasi Manager/Dispatcher.",
            Latitude = -6.221500,
            Longitude = 106.831800,
            Timestamp = now.AddHours(-2).AddMinutes(-10),
            CreatedBy = "staff"
        });

        // 4. Tugas Completed (Route History Playback)
        var completedTrip = new TrackingAssignment
        {
            AssignmentCode = "TRK-2026-004",
            Title = "Pengiriman Dokumen Legal & Kontrak Vendor",
            TaskType = TrackingTaskType.Delivery,
            ReferenceCode = "ORD-2026-002",
            DispatcherUserId = Guid.Empty,
            DispatcherUsername = "manager",
            DispatcherFullName = "Andi Pratama (Manager)",
            AssigneeUserId = Guid.Empty,
            AssigneeUsername = "staff",
            AssigneeFullName = "Dewi Lestari (Staff)",
            OriginLabel = "HQ Jakarta (Monas)",
            OriginLatitude = -6.175392,
            OriginLongitude = 106.827153,
            DestinationLabel = "Grand Indonesia Office Tower",
            DestinationAddress = "Jl. M.H. Thamrin No. 1, Jakarta Pusat",
            DestinationLatitude = -6.195180,
            DestinationLongitude = 106.821440,
            GeofenceRadiusMeters = 150,
            Status = TrackingStatus.Completed,
            StartedAt = now.AddDays(-1).AddHours(-2),
            ArrivedAt = now.AddDays(-1).AddHours(-1).AddMinutes(-40),
            CompletedAt = now.AddDays(-1).AddHours(-1).AddMinutes(-35),
            LastLatitude = -6.195050,
            LastLongitude = 106.821510,
            LastAccuracyMeters = 9,
            LastSpeedKmh = 0,
            LastDistanceToDestinationMeters = 16,
            LastPingAt = now.AddDays(-1).AddHours(-1).AddMinutes(-35),
            TotalDistanceMeters = 2480,
            PodRecipientName = "Ibu Rina (Legal Admin)",
            PodNotes = "Dokumen diterima lengkap dan ditandatangani.",
            CreatedAt = now.AddDays(-1).AddHours(-3),
            CreatedBy = "manager"
        };
        completedTrip.Breadcrumbs.Add(new TrackingBreadcrumb
        {
            TrackingAssignmentId = completedTrip.Id,
            Latitude = -6.175392,
            Longitude = 106.827153,
            AccuracyMeters = 10,
            SpeedKmh = 0,
            DistanceToDestinationMeters = 2290,
            EventTag = "START",
            RecordedAt = now.AddDays(-1).AddHours(-2),
            CreatedBy = "staff"
        });
        completedTrip.Breadcrumbs.Add(new TrackingBreadcrumb
        {
            TrackingAssignmentId = completedTrip.Id,
            Latitude = -6.185900,
            Longitude = 106.823500,
            AccuracyMeters = 11,
            SpeedKmh = 28,
            DistanceToDestinationMeters = 1060,
            EventTag = "PING",
            RecordedAt = now.AddDays(-1).AddHours(-1).AddMinutes(-50),
            CreatedBy = "staff"
        });
        completedTrip.Breadcrumbs.Add(new TrackingBreadcrumb
        {
            TrackingAssignmentId = completedTrip.Id,
            Latitude = -6.195050,
            Longitude = 106.821510,
            AccuracyMeters = 9,
            SpeedKmh = 0,
            DistanceToDestinationMeters = 16,
            EventTag = "COMPLETED",
            RecordedAt = now.AddDays(-1).AddHours(-1).AddMinutes(-35),
            CreatedBy = "staff"
        });
        completedTrip.StatusLogs.Add(new TrackingStatusLog
        {
            TrackingAssignmentId = completedTrip.Id,
            FromStatus = "Arrived",
            ToStatus = "Completed",
            ActorUsername = "staff",
            ActorFullName = "Dewi Lestari (Staff)",
            Notes = "Tugas selesai & terverifikasi otomatis di dalam radius geofence (16m).",
            Latitude = -6.195050,
            Longitude = 106.821510,
            Timestamp = now.AddDays(-1).AddHours(-1).AddMinutes(-35),
            CreatedBy = "staff"
        });

        await dbContext.Assignments.AddRangeAsync([activeTrip, assignedTrip, pendingVerify, completedTrip], cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
    }
}
