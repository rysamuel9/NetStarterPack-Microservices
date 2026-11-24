# Panduan Unit Testing Lintas Microservice (xUnit + EF Core In-Memory + InMemoryEventBus)

Dokumen ini menjelaskan struktur dan cara kerja project **`tests/NetStarterPack.Microservices.UnitTests`**. Dengan setup ini, seluruh logika bisnis di 5 microservice (`Identity`, `Catalog`, `Order`, `Workflow`, `Announcement`), `BuildingBlocks`, hingga alur event lintas service bisa diuji langsung di RAM tanpa menyalakan SQL Server, Redis, atau HTTP server.

---

## 1. Struktur Folder Test Project

Project test tetap dipertahankan dalam **1 project compact** (selaras dengan pola *Compact Onion* di solution ini), tetapi dipecah rapi per tanggung jawab supaya xUnit bisa menjalankan test secara paralel antar-class dan tidak menumpuk di satu file besar:

```text
tests/NetStarterPack.Microservices.UnitTests/
├── Common/
│   ├── TestDoubles/
│   │   ├── FakeCurrentUserService.cs            # Simulasi klaim JWT (UserId, Roles, Permissions) + helper SwitchTo()
│   │   ├── FakePasswordHasher.cs                # Hasher ringan untuk seeding cepat (63 user Identity dalam hitungan ms)
│   │   ├── InMemoryEventBus.cs                  # Pengganti HttpEventBus (merekam AuditLogIntegrationEvent ke list)
│   │   ├── FakeCatalogStatsClient.cs            # Stub HTTP client statistik Catalog untuk DashboardService
│   │   ├── FakeAnnouncementRealtimeNotifier.cs  # Recorder event SignalR Announcement
│   │   └── FakeHostEnvironment.cs               # Folder temp unik per test + auto-cleanup via IDisposable
│   └── Factories/
│       ├── TestCacheFactory.cs                  # DistributedCacheService mode InMemory
│       └── TestDbFactory.cs                     # Factory EF Core InMemory per service + seeder + IDisposable
├── BuildingBlocks/
│   ├── ResultTests.cs
│   ├── DistributedCacheServiceTests.cs
│   └── PermissionAuthorizationHandlerTests.cs
├── Services/
│   ├── Identity/
│   │   ├── AuthServiceTests.cs
│   │   ├── PasswordHasherTests.cs               # Pengujian PBKDF2-SHA256 asli (salting, verify, malformed hash)
│   │   ├── UserServiceTests.cs
│   │   ├── RoleServiceTests.cs
│   │   ├── MenuServiceTests.cs
│   │   └── OrganizationServiceTests.cs
│   ├── Catalog/
│   │   └── ProductServiceTests.cs
│   ├── Order/
│   │   └── OrderServiceTests.cs
│   ├── Workflow/
│   │   └── WorkflowServiceTests.cs
│   └── Announcement/
│       └── AnnouncementServiceTests.cs
└── CrossService/
    └── DashboardAuditIntegrationTests.cs        # Alur Catalog -> InMemoryEventBus -> Identity Dashboard
```

---

## 2. Bedah Test Harness di `Common/`

### A. `TestDbFactory` (`Common/Factories/TestDbFactory.cs`)
Menyiapkan `DbContext` + `UnitOfWork` EF Core In-Memory yang terisolasi per test (`Guid.NewGuid()`) lengkap dengan data hasil seeder masing-masing microservice:
- `TestDbFactory.CreateIdentityAsync()` -> `IdentityDbContext` (63 user korporat, 4 direktorat, 8 divisi, 14 departemen, 10 posisi, role, permission, dan menu). Secara default memakai `FakePasswordHasher` agar seeding 63 user berjalan sangat cepat; kirim `useRealPasswordHasher: true` jika ingin memakai PBKDF2 asli.
- `TestDbFactory.CreateCatalogAsync()` -> `CatalogDbContext` (6 produk katalog).
- `TestDbFactory.CreateOrderAsync()` -> `OrderDbContext` (4 pesanan contoh).
- `TestDbFactory.CreateWorkflowAsync()` -> `WorkflowDbContext` (template form dinamis & rule approval).
- `TestDbFactory.CreateAnnouncementAsync()` -> `AnnouncementDbContext` (12 pengumuman HR + `FakeHostEnvironment` dengan folder temp unik).

Semua context wrapper mengimplementasikan `IDisposable`, jadi biasakan memakai `using var ctx = await TestDbFactory.Create...Async();` agar `DbContext` dan folder temp langsung dibersihkan begitu test selesai.

### B. `FakeCurrentUserService` (`Common/TestDoubles/FakeCurrentUserService.cs`)
Menyimulasikan user aktif tanpa perlu HTTP request. Untuk skenario multi-aktor (misalnya approval berjenjang `Staff -> Manager -> ITLead -> FinanceDirector`), cukup pakai helper `AsUser(...)` dan `SwitchTo(...)`:
```csharp
var currentUser = FakeCurrentUserService.AsUser("staff", "Dewi Lestari (Staff)", [RoleNames.Staff]);
// ... submit request ...
currentUser.SwitchTo(managerId, "manager", "Andi Pratama (Manager)", [RoleNames.Manager]);
```

### C. `InMemoryEventBus` (`Common/TestDoubles/InMemoryEventBus.cs`)
Pengganti `HttpEventBus` saat test. Semua `AuditLogIntegrationEvent` yang dipublish microservice ditampung di `PublishedEvents`, sehingga tinggal dicek dengan `Assert.Single(eventBus.PublishedEvents)` atau `Assert.Contains(...)`.

### D. `TestCacheFactory` (`Common/Factories/TestCacheFactory.cs`)
Membuat `DistributedCacheService` dengan provider `"InMemory"` (`MemoryDistributedCache`) sehingga perilaku *Cache-Aside* (`GetOrCreateAsync`) dan invalidasi prefix (`RemoveByPrefixAsync`) bisa ikut diverifikasi tanpa butuh server Redis.

---

## 3. Contoh Pola Menulis Unit Test Baru

### Skenario 1: Test CRUD di Microservice Bisnis + Verifikasi `IEventBus`
Tambahkan file baru di `Services/<NamaService>/<NamaFitur>ServiceTests.cs`:
```csharp
[Fact]
public async Task CreateProduct_ShouldPersistToIsolatedCatalogDb_AndPublishAuditIntegrationEvent()
{
    using var ctx = await TestDbFactory.CreateCatalogAsync();
    var currentUser = new FakeCurrentUserService { Username = "staff" };
    var cache = TestCacheFactory.CreateInMemory();
    var eventBus = new InMemoryEventBus();

    var service = new ProductService(ctx.Uow, currentUser, cache, eventBus);

    var createResult = await service.CreateProductAsync(new CreateOrUpdateProductRequest(
        Sku: "ms-test-900",
        Name: "Kubernetes Worker Node",
        Category: "Cloud & Infrastructure",
        Description: "Dedicated node untuk cluster microservice",
        Price: 3500000m,
        Stock: 10,
        Status: "Active"));

    Assert.True(createResult.Succeeded);
    Assert.Equal("MS-TEST-900", createResult.Data!.Sku);
    Assert.Single(eventBus.PublishedEvents);
    Assert.Equal("CREATE_PRODUCT", eventBus.PublishedEvents[0].Action);
    Assert.Equal("Catalog.Api", eventBus.PublishedEvents[0].SourceService);
}
```

### Skenario 2: Test Alur Lintas Microservice (`CrossService/`)
Di [`CrossService/DashboardAuditIntegrationTests.cs`](../tests/NetStarterPack.Microservices.UnitTests/CrossService/DashboardAuditIntegrationTests.cs), kita bisa memverifikasi event dari `Catalog.Api` masuk ke `Identity.Api` dan terbaca di `DashboardService`:
```csharp
[Fact]
public async Task CatalogEvent_ForwardedToIdentityDashboard_ShouldCombineIdentityAndCatalogMetrics()
{
    using var identityCtx = await TestDbFactory.CreateIdentityAsync();
    using var catalogCtx = await TestDbFactory.CreateCatalogAsync();
    var cache = TestCacheFactory.CreateInMemory();
    var eventBus = new InMemoryEventBus();

    var productService = new ProductService(catalogCtx.Uow, new FakeCurrentUserService(), cache, eventBus);
    await productService.CreateProductAsync(new CreateOrUpdateProductRequest(
        Sku: "MS-AGG-001", Name: "API Gateway Appliance", Category: "Hardware",
        Description: "YARP Gateway Hardware", Price: 5000000m, Stock: 2, Status: "Active"));

    var catalogStats = (await productService.GetCatalogStatsAsync()).Data!;
    var dashboardService = new DashboardService(identityCtx.Uow, new FakeCatalogStatsClient(catalogStats), cache);

    await dashboardService.RecordIntegrationAuditLogAsync(eventBus.PublishedEvents.Single());

    var summary = (await dashboardService.GetSummaryAsync()).Data!;
    Assert.Equal(63, summary.TotalUsers);
    Assert.Equal(7, summary.TotalProducts);
    Assert.Contains(summary.RecentActivities, a => a.Action == "CREATE_PRODUCT");
}
```

---

## 4. Cara Menjalankan Unit Test

```powershell
# Jalankan seluruh unit test di solution
dotnet test

# Jalankan test untuk satu microservice tertentu saja (lebih cepat saat fokus ngoding 1 service)
dotnet test --filter "FullyQualifiedName~Services.Identity"
dotnet test --filter "FullyQualifiedName~Services.Workflow"
dotnet test --filter "FullyQualifiedName~BuildingBlocks"

# Jalankan dengan output detail per test case
dotnet test --logger "console;verbosity=detailed"
```
