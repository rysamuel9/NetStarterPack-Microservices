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

        var existingCodes = (await dbContext.Assignments
            .Select(a => a.AssignmentCode)
            .ToListAsync(cancellationToken))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var now = DateTime.UtcNow;
        var toAdd = new List<TrackingAssignment>();

        void QueueIfMissing(TrackingAssignment assignment)
        {
            if (!existingCodes.Contains(assignment.AssignmentCode))
            {
                toAdd.Add(assignment);
                existingCodes.Add(assignment.AssignmentCode);
            }
        }

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
        QueueIfMissing(activeTrip);

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
        QueueIfMissing(assignedTrip);

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
            DispatcherFullName = "Siti Rahmawati (Admin)",
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
        QueueIfMissing(pendingVerify);

        // 4. Tugas Completed (Route History Playback)
        var completedTrip = new TrackingAssignment
        {
            AssignmentCode = "TRK-2026-004",
            Title = "Pengiriman Dokumen Legal & Kontrak Vendor",
            TaskType = TrackingTaskType.Delivery,
            ReferenceCode = "ORD-2026-002",
            Notes = "Serahkan amplop segel ke tim Legal di Lantai 28.",
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
            PodNotes = "Dokumen diterima lengkap, segel utuh, dan berita acara sudah ditandatangani.",
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
        QueueIfMissing(completedTrip);

        // 5. Tugas Assigned (Staff) — siap untuk tes Start + Simulasi Normal / Luar Geofence / Fake GPS
        var assignedBca = new TrackingAssignment
        {
            AssignmentCode = "TRK-2026-005",
            Title = "Pengiriman Router Firewall & Switch Core ke Cabang Thamrin",
            TaskType = TrackingTaskType.Delivery,
            ReferenceCode = "ORD-2026-019",
            Notes = "Cocokkan serial number unit dengan surat jalan sebelum serah terima ke tim Network.",
            DispatcherUserId = Guid.Empty,
            DispatcherUsername = "manager",
            DispatcherFullName = "Andi Pratama (Manager)",
            AssigneeUserId = Guid.Empty,
            AssigneeUsername = "staff",
            AssigneeFullName = "Dewi Lestari (Staff)",
            OriginLabel = "HQ Jakarta (Monas)",
            OriginLatitude = -6.175392,
            OriginLongitude = 106.827153,
            DestinationLabel = "Menara BCA Thamrin",
            DestinationAddress = "Jl. M.H. Thamrin No. 1, Menteng, Jakarta Pusat",
            DestinationLatitude = -6.195940,
            DestinationLongitude = 106.822970,
            GeofenceRadiusMeters = 150,
            Status = TrackingStatus.Assigned,
            LastDistanceToDestinationMeters = GeoDistanceCalculator.CalculateHaversineMeters(-6.175392, 106.827153, -6.195940, 106.822970),
            CreatedAt = now.AddMinutes(-25),
            CreatedBy = "manager"
        };
        assignedBca.StatusLogs.Add(new TrackingStatusLog
        {
            TrackingAssignmentId = assignedBca.Id,
            FromStatus = "None",
            ToStatus = "Assigned",
            ActorUsername = "manager",
            ActorFullName = "Andi Pratama (Manager)",
            Notes = "Ditugaskan ke Dewi Lestari. Cocok untuk latihan simulasi rute penuh (Normal / Luar Geofence / Anti Fake-GPS).",
            Latitude = assignedBca.OriginLatitude,
            Longitude = assignedBca.OriginLongitude,
            Timestamp = now.AddMinutes(-25),
            CreatedBy = "manager"
        });
        QueueIfMissing(assignedBca);

        // 6. Tugas Arrived (Staff) — sudah tiba di dalam geofence, siap langsung tes Upload POD & Selesai!
        var arrivedSenayan = new TrackingAssignment
        {
            AssignmentCode = "TRK-2026-006",
            Title = "Instalasi Access Point Wi-Fi 6E & Uji Sinyal Lantai 14",
            TaskType = TrackingTaskType.Maintenance,
            ReferenceCode = "MTN-2026-021",
            Notes = "Foto posisi pemasangan AP dan catat nama PIC GA Gedung di form POD.",
            DispatcherUserId = Guid.Empty,
            DispatcherUsername = "admin",
            DispatcherFullName = "Siti Rahmawati (Admin)",
            AssigneeUserId = Guid.Empty,
            AssigneeUsername = "staff",
            AssigneeFullName = "Dewi Lestari (Staff)",
            OriginLabel = "HQ Jakarta (Monas)",
            OriginLatitude = -6.175392,
            OriginLongitude = 106.827153,
            DestinationLabel = "Senayan City Office Tower",
            DestinationAddress = "Jl. Asia Afrika Lot. 19, Gelora, Jakarta Pusat",
            DestinationLatitude = -6.227190,
            DestinationLongitude = 106.797390,
            GeofenceRadiusMeters = 180,
            Status = TrackingStatus.Arrived,
            StartedAt = now.AddMinutes(-55),
            ArrivedAt = now.AddMinutes(-12),
            LastLatitude = -6.227110,
            LastLongitude = 106.797450,
            LastAccuracyMeters = 8,
            LastSpeedKmh = 0,
            LastDistanceToDestinationMeters = GeoDistanceCalculator.CalculateHaversineMeters(-6.227110, 106.797450, -6.227190, 106.797390),
            LastPingAt = now.AddMinutes(-12),
            TotalDistanceMeters = 6840,
            CreatedAt = now.AddHours(-2),
            CreatedBy = "admin"
        };
        arrivedSenayan.Breadcrumbs.Add(new TrackingBreadcrumb
        {
            TrackingAssignmentId = arrivedSenayan.Id,
            Latitude = -6.175392,
            Longitude = 106.827153,
            AccuracyMeters = 12,
            SpeedKmh = 0,
            DistanceToDestinationMeters = 6630,
            EventTag = "START",
            RecordedAt = now.AddMinutes(-55),
            CreatedBy = "staff"
        });
        arrivedSenayan.Breadcrumbs.Add(new TrackingBreadcrumb
        {
            TrackingAssignmentId = arrivedSenayan.Id,
            Latitude = -6.205400,
            Longitude = 106.812200,
            AccuracyMeters = 11,
            SpeedKmh = 31,
            DistanceToDestinationMeters = 2920,
            EventTag = "PING",
            RecordedAt = now.AddMinutes(-34),
            CreatedBy = "staff"
        });
        arrivedSenayan.Breadcrumbs.Add(new TrackingBreadcrumb
        {
            TrackingAssignmentId = arrivedSenayan.Id,
            Latitude = -6.227110,
            Longitude = 106.797450,
            AccuracyMeters = 8,
            SpeedKmh = 0,
            DistanceToDestinationMeters = 11,
            EventTag = "ARRIVED",
            RecordedAt = now.AddMinutes(-12),
            CreatedBy = "staff"
        });
        arrivedSenayan.StatusLogs.Add(new TrackingStatusLog
        {
            TrackingAssignmentId = arrivedSenayan.Id,
            FromStatus = "Assigned",
            ToStatus = "InTransit",
            ActorUsername = "staff",
            ActorFullName = "Dewi Lestari (Staff)",
            Notes = "Berangkat menuju Senayan City Office Tower.",
            Latitude = -6.175392,
            Longitude = 106.827153,
            Timestamp = now.AddMinutes(-55),
            CreatedBy = "staff"
        });
        arrivedSenayan.StatusLogs.Add(new TrackingStatusLog
        {
            TrackingAssignmentId = arrivedSenayan.Id,
            FromStatus = "InTransit",
            ToStatus = "Arrived",
            ActorUsername = "staff",
            ActorFullName = "Dewi Lestari (Staff)",
            Notes = "Petugas tiba di dalam radius geofence (11m <= 180m). Siap unggah POD.",
            Latitude = -6.227110,
            Longitude = 106.797450,
            Timestamp = now.AddMinutes(-12),
            CreatedBy = "staff"
        });
        QueueIfMissing(arrivedSenayan);

        // 7. Tugas IssueReported (Staff) — contoh kendala lapangan, siap tes "Lanjutkan Perjalanan"
        var issueTrip = new TrackingAssignment
        {
            AssignmentCode = "TRK-2026-007",
            Title = "Survey Lokasi & Cek Jaringan Fiber Cabang Pondok Indah",
            TaskType = TrackingTaskType.FieldVisit,
            ReferenceCode = "VST-2026-022",
            Notes = "Koordinasi dengan pengelola gedung untuk akses ruang shaft telekomunikasi.",
            DispatcherUserId = Guid.Empty,
            DispatcherUsername = "manager",
            DispatcherFullName = "Andi Pratama (Manager)",
            AssigneeUserId = Guid.Empty,
            AssigneeUsername = "staff",
            AssigneeFullName = "Dewi Lestari (Staff)",
            OriginLabel = "HQ Jakarta (Monas)",
            OriginLatitude = -6.175392,
            OriginLongitude = 106.827153,
            DestinationLabel = "Pondok Indah Office Tower 3",
            DestinationAddress = "Jl. Sultan Iskandar Muda Kav. V-TA, Pondok Indah, Jakarta Selatan",
            DestinationLatitude = -6.265410,
            DestinationLongitude = 106.783490,
            GeofenceRadiusMeters = 200,
            Status = TrackingStatus.IssueReported,
            IssueNote = "Rekayasa lalu lintas & antrean panjang di arteri Pondok Indah, estimasi mundur 20 menit.",
            StartedAt = now.AddMinutes(-48),
            LastLatitude = -6.241200,
            LastLongitude = 106.791800,
            LastAccuracyMeters = 14,
            LastSpeedKmh = 4.2,
            LastDistanceToDestinationMeters = GeoDistanceCalculator.CalculateHaversineMeters(-6.241200, 106.791800, -6.265410, 106.783490),
            LastPingAt = now.AddMinutes(-8),
            TotalDistanceMeters = 8350,
            CreatedAt = now.AddHours(-2),
            CreatedBy = "manager"
        };
        issueTrip.Breadcrumbs.Add(new TrackingBreadcrumb
        {
            TrackingAssignmentId = issueTrip.Id,
            Latitude = -6.175392,
            Longitude = 106.827153,
            AccuracyMeters = 12,
            SpeedKmh = 0,
            DistanceToDestinationMeters = 11100,
            EventTag = "START",
            RecordedAt = now.AddMinutes(-48),
            CreatedBy = "staff"
        });
        issueTrip.Breadcrumbs.Add(new TrackingBreadcrumb
        {
            TrackingAssignmentId = issueTrip.Id,
            Latitude = -6.241200,
            Longitude = 106.791800,
            AccuracyMeters = 14,
            SpeedKmh = 4.2,
            DistanceToDestinationMeters = 2840,
            EventTag = "PING",
            RecordedAt = now.AddMinutes(-8),
            CreatedBy = "staff"
        });
        issueTrip.StatusLogs.Add(new TrackingStatusLog
        {
            TrackingAssignmentId = issueTrip.Id,
            FromStatus = "InTransit",
            ToStatus = "IssueReported",
            ActorUsername = "staff",
            ActorFullName = "Dewi Lestari (Staff)",
            Notes = "Kendala dilaporkan: Rekayasa lalu lintas & antrean panjang di arteri Pondok Indah, estimasi mundur 20 menit.",
            Latitude = -6.241200,
            Longitude = 106.791800,
            Timestamp = now.AddMinutes(-8),
            CreatedBy = "staff"
        });
        QueueIfMissing(issueTrip);

        // 8. Multi-petugas di peta Command Center (yoga.proc) — InTransit di area Menteng / Cikini
        var yogaTrip = new TrackingAssignment
        {
            AssignmentCode = "TRK-2026-008",
            Title = "Pengiriman Monitor 27\" & Docking Station (6 Unit)",
            TaskType = TrackingTaskType.Delivery,
            ReferenceCode = "ORD-2026-024",
            Notes = "Pengiriman ke gudang distribusi Cikini, hubungi kepala gudang 15 menit sebelum tiba.",
            DispatcherUserId = Guid.Empty,
            DispatcherUsername = "manager",
            DispatcherFullName = "Andi Pratama (Manager)",
            AssigneeUserId = Guid.Empty,
            AssigneeUsername = "yoga.proc",
            AssigneeFullName = "Yoga Saputra (Procurement Staff)",
            OriginLabel = "HQ Jakarta (Monas)",
            OriginLatitude = -6.175392,
            OriginLongitude = 106.827153,
            DestinationLabel = "Hub Logistik Cikini Menteng",
            DestinationAddress = "Jl. Cikini Raya No. 73, Menteng, Jakarta Pusat",
            DestinationLatitude = -6.191250,
            DestinationLongitude = 106.840420,
            GeofenceRadiusMeters = 150,
            Status = TrackingStatus.InTransit,
            StartedAt = now.AddMinutes(-14),
            LastLatitude = -6.183920,
            LastLongitude = 106.835110,
            LastAccuracyMeters = 10,
            LastSpeedKmh = 27.8,
            LastDistanceToDestinationMeters = GeoDistanceCalculator.CalculateHaversineMeters(-6.183920, 106.835110, -6.191250, 106.840420),
            LastPingAt = now.AddMinutes(-2),
            TotalDistanceMeters = 1420,
            CreatedAt = now.AddMinutes(-50),
            CreatedBy = "manager"
        };
        yogaTrip.Breadcrumbs.Add(new TrackingBreadcrumb
        {
            TrackingAssignmentId = yogaTrip.Id,
            Latitude = -6.175392,
            Longitude = 106.827153,
            AccuracyMeters = 10,
            SpeedKmh = 0,
            DistanceToDestinationMeters = 2290,
            EventTag = "START",
            RecordedAt = now.AddMinutes(-14),
            CreatedBy = "yoga.proc"
        });
        yogaTrip.Breadcrumbs.Add(new TrackingBreadcrumb
        {
            TrackingAssignmentId = yogaTrip.Id,
            Latitude = -6.183920,
            Longitude = 106.835110,
            AccuracyMeters = 10,
            SpeedKmh = 27.8,
            DistanceToDestinationMeters = 1004,
            EventTag = "PING",
            RecordedAt = now.AddMinutes(-2),
            CreatedBy = "yoga.proc"
        });
        yogaTrip.StatusLogs.Add(new TrackingStatusLog
        {
            TrackingAssignmentId = yogaTrip.Id,
            FromStatus = "Assigned",
            ToStatus = "InTransit",
            ActorUsername = "yoga.proc",
            ActorFullName = "Yoga Saputra (Procurement Staff)",
            Notes = "Unit sudah dimuat di kendaraan operasional, menuju Cikini.",
            Latitude = -6.175392,
            Longitude = 106.827153,
            Timestamp = now.AddMinutes(-14),
            CreatedBy = "yoga.proc"
        });
        QueueIfMissing(yogaTrip);

        // 9. Contoh Flag Anomali GPS (putri.ops) — PendingVerification karena Mock GPS untuk latihan audit/verifikasi Manager
        var suspiciousTrip = new TrackingAssignment
        {
            AssignmentCode = "TRK-2026-009",
            Title = "Pengiriman Sparepart RAID Controller Data Center Mega Kuningan",
            TaskType = TrackingTaskType.Delivery,
            ReferenceCode = "ORD-2026-028",
            Notes = "Wajib serah terima di ruang staging DC dengan tanda tangan petugas shift.",
            DispatcherUserId = Guid.Empty,
            DispatcherUsername = "admin",
            DispatcherFullName = "Siti Rahmawati (Admin)",
            AssigneeUserId = Guid.Empty,
            AssigneeUsername = "putri.ops",
            AssigneeFullName = "Putri Wulandari (Warehouse Staff)",
            OriginLabel = "HQ Jakarta (Monas)",
            OriginLatitude = -6.175392,
            OriginLongitude = 106.827153,
            DestinationLabel = "Menara Dea Mega Kuningan",
            DestinationAddress = "Jl. Mega Kuningan Barat Kav. E4.3, Jakarta Selatan",
            DestinationLatitude = -6.228620,
            DestinationLongitude = 106.826650,
            GeofenceRadiusMeters = 150,
            Status = TrackingStatus.PendingVerification,
            IsSuspicious = true,
            SuspiciousReason = "Mock GPS / Fake GPS terdeteksi pada perangkat saat submit POD.",
            StartedAt = now.AddHours(-2),
            ArrivedAt = now.AddHours(-1).AddMinutes(-10),
            LastLatitude = -6.228590,
            LastLongitude = 106.826680,
            LastAccuracyMeters = 5,
            LastSpeedKmh = 0,
            LastDistanceToDestinationMeters = 5,
            LastPingAt = now.AddHours(-1).AddMinutes(-5),
            TotalDistanceMeters = 6120,
            PodRecipientName = "Mas Arif (DC Shift Engineer)",
            PodNotes = "Sparepart sudah diserahkan di lobi staging, aplikasi sempat memakai GPS emulator kantor untuk tes.",
            CreatedAt = now.AddHours(-3),
            CreatedBy = "admin"
        };
        suspiciousTrip.Breadcrumbs.Add(new TrackingBreadcrumb
        {
            TrackingAssignmentId = suspiciousTrip.Id,
            Latitude = -6.175392,
            Longitude = 106.827153,
            AccuracyMeters = 14,
            SpeedKmh = 0,
            DistanceToDestinationMeters = 5920,
            EventTag = "START",
            RecordedAt = now.AddHours(-2),
            CreatedBy = "putri.ops"
        });
        suspiciousTrip.Breadcrumbs.Add(new TrackingBreadcrumb
        {
            TrackingAssignmentId = suspiciousTrip.Id,
            Latitude = -6.228590,
            Longitude = 106.826680,
            AccuracyMeters = 5,
            SpeedKmh = 0,
            DistanceToDestinationMeters = 5,
            IsMocked = true,
            IsSuspicious = true,
            EventTag = "SUSPICIOUS",
            RecordedAt = now.AddHours(-1).AddMinutes(-5),
            CreatedBy = "putri.ops"
        });
        suspiciousTrip.StatusLogs.Add(new TrackingStatusLog
        {
            TrackingAssignmentId = suspiciousTrip.Id,
            FromStatus = "Arrived",
            ToStatus = "PendingVerification",
            ActorUsername = "putri.ops",
            ActorFullName = "Putri Wulandari (Warehouse Staff)",
            Notes = "POD disubmit namun terdapat flag anomali GPS (Mock GPS terdeteksi). Menunggu verifikasi Manager/Dispatcher.",
            Latitude = -6.228590,
            Longitude = 106.826680,
            Timestamp = now.AddHours(-1).AddMinutes(-5),
            CreatedBy = "putri.ops"
        });
        QueueIfMissing(suspiciousTrip);

        // 10. Contoh Completed + Diverifikasi Manual oleh Manager (bambang.ga)
        var verifiedTrip = new TrackingAssignment
        {
            AssignmentCode = "TRK-2026-010",
            Title = "Inspeksi Panel Listrik & AC Ruang Server Cabang Slipi",
            TaskType = TrackingTaskType.Maintenance,
            ReferenceCode = "MTN-2026-018",
            Notes = "Periksa suhu ruangan, ampere MCB utama, dan kebersihan filter AC presisi.",
            DispatcherUserId = Guid.Empty,
            DispatcherUsername = "manager",
            DispatcherFullName = "Andi Pratama (Manager)",
            AssigneeUserId = Guid.Empty,
            AssigneeUsername = "bambang.ga",
            AssigneeFullName = "Bambang Susanto (GA Operations)",
            OriginLabel = "HQ Jakarta (Monas)",
            OriginLatitude = -6.175392,
            OriginLongitude = 106.827153,
            DestinationLabel = "Wisma 77 Tower 2 Slipi",
            DestinationAddress = "Jl. Letjen S. Parman Kav. 77, Slipi, Jakarta Barat",
            DestinationLatitude = -6.189750,
            DestinationLongitude = 106.798520,
            GeofenceRadiusMeters = 150,
            Status = TrackingStatus.Completed,
            StartedAt = now.AddDays(-1).AddHours(-5),
            ArrivedAt = now.AddDays(-1).AddHours(-4).AddMinutes(-20),
            CompletedAt = now.AddDays(-1).AddHours(-3).AddMinutes(-45),
            LastLatitude = -6.191400,
            LastLongitude = 106.798100,
            LastAccuracyMeters = 16,
            LastSpeedKmh = 0,
            LastDistanceToDestinationMeters = 189,
            LastPingAt = now.AddDays(-1).AddHours(-4),
            TotalDistanceMeters = 4150,
            PodRecipientName = "Pak Joko (Building Engineering)",
            PodNotes = "Suhu ruang server stabil 20.5°C, filter AC dibersihkan. Submit POD dari area parkir basement (sinyal GPS sedikit bergeser 189m).",
            VerifiedByUsername = "manager",
            VerifiedAt = now.AddDays(-1).AddHours(-3).AddMinutes(-45),
            VerificationNotes = "Disetujui setelah konfirmasi telepon dengan Building Engineering Wisma 77.",
            CreatedAt = now.AddDays(-1).AddHours(-6),
            CreatedBy = "manager"
        };
        verifiedTrip.Breadcrumbs.Add(new TrackingBreadcrumb
        {
            TrackingAssignmentId = verifiedTrip.Id,
            Latitude = -6.175392,
            Longitude = 106.827153,
            AccuracyMeters = 11,
            SpeedKmh = 0,
            DistanceToDestinationMeters = 3540,
            EventTag = "START",
            RecordedAt = now.AddDays(-1).AddHours(-5),
            CreatedBy = "bambang.ga"
        });
        verifiedTrip.Breadcrumbs.Add(new TrackingBreadcrumb
        {
            TrackingAssignmentId = verifiedTrip.Id,
            Latitude = -6.191400,
            Longitude = 106.798100,
            AccuracyMeters = 16,
            SpeedKmh = 0,
            DistanceToDestinationMeters = 189,
            EventTag = "COMPLETED",
            RecordedAt = now.AddDays(-1).AddHours(-4),
            CreatedBy = "bambang.ga"
        });
        verifiedTrip.StatusLogs.Add(new TrackingStatusLog
        {
            TrackingAssignmentId = verifiedTrip.Id,
            FromStatus = "Arrived",
            ToStatus = "PendingVerification",
            ActorUsername = "bambang.ga",
            ActorFullName = "Bambang Susanto (GA Operations)",
            Notes = "POD disubmit di luar radius geofence (189m > 150m). Menunggu verifikasi Manager.",
            Latitude = -6.191400,
            Longitude = 106.798100,
            Timestamp = now.AddDays(-1).AddHours(-4),
            CreatedBy = "bambang.ga"
        });
        verifiedTrip.StatusLogs.Add(new TrackingStatusLog
        {
            TrackingAssignmentId = verifiedTrip.Id,
            FromStatus = "PendingVerification",
            ToStatus = "Completed",
            ActorUsername = "manager",
            ActorFullName = "Andi Pratama (Manager)",
            Notes = "Verifikasi DISETUJUI: Disetujui setelah konfirmasi telepon dengan Building Engineering Wisma 77.",
            Latitude = -6.191400,
            Longitude = 106.798100,
            Timestamp = now.AddDays(-1).AddHours(-3).AddMinutes(-45),
            CreatedBy = "manager"
        });
        QueueIfMissing(verifiedTrip);

        if (toAdd.Count > 0)
        {
            logger.LogInformation("Seeding {Count} Field Dispatch & Live Tracking assignments into NetStarterPack_TrackingDb...", toAdd.Count);
            await dbContext.Assignments.AddRangeAsync(toAdd, cancellationToken);
            await dbContext.SaveChangesAsync(cancellationToken);
        }
    }
}
