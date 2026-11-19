# Panduan Lengkap Unit Testing Lintas Microservice (xUnit + EF Core In-Memory + InMemoryEventBus)

Dokumen ini menjelaskan cara kerja project **`tests/NetStarterPack.Microservices.UnitTests`**, bagaimana kita bisa menguji logika bisnis di **`Identity.Api`** dan **`Catalog.Api`** (termasuk pengiriman event lintas service via `IEventBus` dan agregasi Dashboard) hanya dalam hitungan milidetik tanpa perlu menyalakan SQL Server atau jaringan HTTP.

---

## 1. Kenapa Unit Testing di Compact Onion Microservices Sangat Cepat & Bersih?

Di project ini, baik `Identity.Api` maupun `Catalog.Api` disusun menggunakan pola **Compact Onion Architecture**:
- `ProductService` di `Catalog.Api` hanya bergantung pada kontrak `ICatalogUnitOfWork`, `ICurrentUserService`, `ICacheService`, dan `IEventBus`.
- `AuthService` dan `DashboardService` di `Identity.Api` hanya bergantung pada kontrak `IIdentityUnitOfWork`, `ICatalogStatsClient`, `ICurrentUserService`, dan `ICacheService`.

Karena semuanya bergantung pada **Interface**, di dalam [`MicroservicesArchitectureTests.cs`](../tests/NetStarterPack.Microservices.UnitTests/MicroservicesArchitectureTests.cs) kita bisa menguji masing-masing microservice secara terisolasi maupun menguji alur integrasi antar-microservice di dalam memori RAM!

---

## 2. Bedah 5 Test Harness di [`MicroservicesArchitectureTests.cs`](../tests/NetStarterPack.Microservices.UnitTests/MicroservicesArchitectureTests.cs)

### A. `FakeCurrentUserService` — Simulasi Klaim JWT User
Menyimulasikan siapa user yang sedang mengirim request beserta `Roles`, `Permissions`, dan `CorrelationId`-nya tanpa perlu membuat HTTP request:
```csharp
private sealed class FakeCurrentUserService : ICurrentUserService
{
    public Guid? UserId { get; set; } = Guid.NewGuid();
    public string? Username { get; set; } = "superadmin";
    public IReadOnlyList<string> Roles { get; set; } = [RoleNames.SuperAdmin];
    public IReadOnlyList<string> Permissions { get; set; } =
        BuildingBlocks.Core.Constants.Permissions.GetAll().Select(p => p.Code).ToList();
    public string? IpAddress => "127.0.0.1";
    public string CorrelationId => "test-correlation-id-001";
}
```

### B. `InMemoryEventBus` — Pengganti `HttpEventBus` Saat Unit Test
Di aplikasi nyata, `HttpEventBus` mengirim HTTP POST ke `Identity.Api`. Di dalam Unit Test, kita menggunakan `InMemoryEventBus` yang menampung semua event yang dikirim oleh microservice ke dalam `List<AuditLogIntegrationEvent> PublishedEvents`:
```csharp
private sealed class InMemoryEventBus : IEventBus
{
    public List<AuditLogIntegrationEvent> PublishedEvents { get; } = new();

    public Task PublishAuditAsync(AuditLogIntegrationEvent auditEvent, CancellationToken cancellationToken = default)
    {
        PublishedEvents.Add(auditEvent);
        return Task.CompletedTask;
    }
}
```
Dengan ini, kita bisa langsung melakukan `Assert.Single(eventBus.PublishedEvents)` untuk memastikan microservice benar-benar mem-publish event audit!

### C. `CreateSeededIdentityAsync()` & `CreateSeededCatalogAsync()`
Membuat dua database **EF Core In-Memory** yang terpisah (`IdentityTestDb_{Guid}` dan `CatalogTestDb_{Guid}`) lengkap dengan data hasil seeder masing-masing microservice:
- `CreateSeededIdentityAsync()` menyiapkan `IdentityDbContext` (5 role, 16 permission, 8 menu, 5 user).
- `CreateSeededCatalogAsync()` menyiapkan `CatalogDbContext` (6 item produk katalog).

---

## 3. Contekan Skenario Unit Test untuk Microservice Baru / Modul Baru

### Skenario 1: Test CRUD di Microservice Bisnis + Verifikasi `IEventBus` Terpanggil
```csharp
[Fact]
public async Task CatalogService_CreateProduct_ShouldPersistToIsolatedCatalogDb_And_PublishAuditIntegrationEvent()
{
    // 1. Arrange
    var (_, catalogUow) = await CreateSeededCatalogAsync();
    var currentUser = new FakeCurrentUserService { Username = "staff" };
    var cache = CreateTestCacheService();
    var eventBus = new InMemoryEventBus();

    var productService = new ProductService(catalogUow, currentUser, cache, eventBus);

    // 2. Act
    var createResult = await productService.CreateProductAsync(new CreateOrUpdateProductRequest(
        Sku: "MS-TEST-900",
        Name: "Kubernetes Worker Node",
        Category: "Cloud & Infrastructure",
        Description: "Dedicated node untuk cluster microservice",
        Price: 3500000m,
        Stock: 10,
        Status: "Active"));

    // 3. Assert: Tersimpan di CatalogDb & Mengirim Integration Event ke EventBus
    Assert.True(createResult.Succeeded);
    Assert.Equal("MS-TEST-900", createResult.Data!.Sku);
    Assert.Single(eventBus.PublishedEvents);
    Assert.Equal("CREATE_PRODUCT", eventBus.PublishedEvents[0].Action);
    Assert.Equal("Catalog.Api", eventBus.PublishedEvents[0].SourceService);
}
```

### Skenario 2: Test Alur Lintas Microservice (Catalog $\rightarrow$ EventBus $\rightarrow$ Identity & Dashboard Aggregator)
Menguji bagaimana perubahan data di `Catalog.Api` diteruskan ke `Identity.Api` dan mengubah metrik gabungan di `DashboardService`:
```csharp
[Fact]
public async Task CrossService_AuditEvent_And_DashboardAggregation_ShouldCombineIdentityAndCatalogMetrics()
{
    var (_, identityUow, _, _) = await CreateSeededIdentityAsync();
    var (_, catalogUow) = await CreateSeededCatalogAsync();
    var currentUser = new FakeCurrentUserService();
    var cache = CreateTestCacheService();
    var eventBus = new InMemoryEventBus();

    // 1. Tambah produk di Catalog.Api (Database 1)
    var productService = new ProductService(catalogUow, currentUser, cache, eventBus);
    await productService.CreateProductAsync(new CreateOrUpdateProductRequest(
        Sku: "MS-AGG-001",
        Name: "API Gateway Appliance",
        Category: "Hardware",
        Description: "YARP Gateway Hardware",
        Price: 5000000m,
        Stock: 2,
        Status: "Active"));

    var catalogStats = (await productService.GetCatalogStatsAsync()).Data!;

    // 2. Forward event audit dari Catalog.Api ke Identity.Api (Database 2)
    var dashboardService = new DashboardService(
        identityUow,
        new FakeCatalogStatsClient(catalogStats),
        cache);

    await dashboardService.RecordIntegrationAuditLogAsync(eventBus.PublishedEvents.Single());

    // 3. Pastikan Dashboard menampilkan gabungan 5 User (IdentityDb) + 7 Produk (CatalogDb) + Log CREATE_PRODUCT
    var summary = (await dashboardService.GetSummaryAsync()).Data!;
    Assert.Equal(5, summary.TotalUsers);
    Assert.Equal(7, summary.TotalProducts);
    Assert.Contains(summary.RecentActivities, a => a.Action == "CREATE_PRODUCT");
}
```

---

## 4. Cara Menjalankan Unit Test

```powershell
# Jalankan seluruh unit test di solution
dotnet test

# Jalankan dengan output detail
dotnet test --logger "console;verbosity=detailed"
```
