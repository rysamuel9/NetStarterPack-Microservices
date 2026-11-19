# Panduan Lengkap A sampai Z: Cara Membuat Modul CRUD Baru & Microservice Baru dari Nol

Dokumen ini adalah panduan komprehensif (*step-by-step*) dari **A sampai Z** untuk mengembangkan fitur di **NetStarterPack Microservices**.

Karena arsitektur project ini mendukung **Maintainability secara Vertikal maupun Horizontal**, panduan ini dibagi menjadi **2 Skenario Utama**:
- **BAGIAN A (Vertical Scaling)**: Menambah modul/tabel CRUD baru di dalam microservice yang sudah ada (Studi Kasus: Modul **Pelanggan / `Customer`**).
- **BAGIAN B (Horizontal Scaling)**: Membuat **Microservice Mandiri Baru** dari nol dengan port dan database terpisah (Studi Kasus: Microservice **`Order.Api` di Port `5083`** dengan database **`NetStarterPack_OrderDb`**), lalu menyambungkannya ke **YARP API Gateway (`:5080`)**, **Unified Swagger/Scalar**, dan **F5 Auto-Orchestrator**.

---

## Gambaran Alur Pengerjaan (Dari Shared Kernel $\rightarrow$ Microservice $\rightarrow$ Gateway $\rightarrow$ Frontend)

```mermaid
flowchart LR
    subgraph BB ["1. Shared BuildingBlocks"]
        B1["BuildingBlocks.Core<br/>• Permissions.cs<br/>• CacheKeys.cs"]
    end

    subgraph MS ["2. Microservice (Compact Onion)"]
        direction LR
        D["Domain/<br/>• Entity (BaseEntity)<br/>• IUnitOfWork"] --> A["Application/<br/>• DTOs (record)<br/>• Service (+Cache & IEventBus)"]
        A --> I["Infrastructure/<br/>• DbContext & Seeder<br/>• UnitOfWork"]
        I --> C["Controllers/<br/>• BaseApiController<br/>• [HasPermission]"]
    end

    subgraph GW ["3. YARP API Gateway (:5080)"]
        Y["Gateway.Api<br/>• Route & Cluster di appsettings.json<br/>• Test di Unified Swagger/Scalar"]
    end

    subgraph UT ["4. Unit Testing"]
        T["xUnit + InMemory DB<br/>+ InMemoryEventBus"]
    end

    subgraph FE ["5. React Frontend (:5173)"]
        F["types/index.ts -> Page.tsx<br/>-> App.tsx -> Menu Sidebar"]
    end

    BB --> MS --> GW --> UT --> FE
```

---

# BAGIAN A: Menambah Modul CRUD Baru di Microservice yang Sudah Ada (Studi Kasus: `Customer`)

Misalkan kita ingin menambahkan tabel dan fitur **Data Pelanggan (`Customer`)** ke dalam microservice bisnis `Catalog.Api` (atau microservice mana pun yang sudah ada).

## Checklist Cepat File yang Disentuh (Bagian A)

| Urutan | Project / Folder | Lokasi File | Aksi | Fungsi |
| :---: | :--- | :--- | :---: | :--- |
| **1.1** | `BuildingBlocks.Core` | [`src/BuildingBlocks/BuildingBlocks.Core/Constants/Permissions.cs`](../src/BuildingBlocks/BuildingBlocks.Core/Constants/Permissions.cs) | Edit | Daftar konstanta permission `Customers.*` |
| **1.2** | `BuildingBlocks.Core` | [`src/BuildingBlocks/BuildingBlocks.Core/Constants/CacheKeys.cs`](../src/BuildingBlocks/BuildingBlocks.Core/Constants/CacheKeys.cs) | Edit | Daftar prefix & helper key cache `customers:` |
| **2.1** | `Catalog.Api/Domain` | `src/Services/Catalog/Catalog.Api/Domain/Entities/Customer.cs` | Buat Baru | Class entity `Customer : BaseEntity` |
| **2.2** | `Catalog.Api/Domain` | [`src/Services/Catalog/Catalog.Api/Domain/Interfaces/ICatalogUnitOfWork.cs`](../src/Services/Catalog/Catalog.Api/Domain/Interfaces/ICatalogUnitOfWork.cs) | Edit | Tambah `IRepository<Customer> Customers { get; }` |
| **3.1** | `Catalog.Api/Application` | `src/Services/Catalog/Catalog.Api/Application/DTOs/CustomerDtos.cs` | Buat Baru | DTO Request & Response (`record`) |
| **3.2** | `Catalog.Api/Application` | `src/Services/Catalog/Catalog.Api/Application/Interfaces/ICustomerService.cs` | Buat Baru | Kontrak interface `ICustomerService` |
| **3.3** | `Catalog.Api/Application` | `src/Services/Catalog/Catalog.Api/Application/Services/CustomerService.cs` | Buat Baru | Logika bisnis CRUD + Cache + `IEventBus.PublishAuditAsync` |
| **4.1** | `Catalog.Api/Infrastructure` | [`src/Services/Catalog/Catalog.Api/Infrastructure/Persistence/CatalogPersistence.cs`](../src/Services/Catalog/Catalog.Api/Infrastructure/Persistence/CatalogPersistence.cs) | Edit | Tambah `DbSet<Customer>`, Fluent API, & `CatalogUnitOfWork` |
| **4.2** | `Catalog.Api` | [`src/Services/Catalog/Catalog.Api/Program.cs`](../src/Services/Catalog/Catalog.Api/Program.cs) | Edit | Registrasi DI `AddScoped<ICustomerService, CustomerService>()` |
| **5.1** | `Catalog.Api/Controllers` | `src/Services/Catalog/Catalog.Api/Controllers/CustomersController.cs` | Buat Baru | Endpoint HTTP `/api/customers` + `[HasPermission]` |
| **5.2** | `Gateway.Api` | [`src/ApiGateway/Gateway.Api/appsettings.json`](../src/ApiGateway/Gateway.Api/appsettings.json) | Edit | Tambah route YARP `/api/customers` ke `catalog-cluster` |
| **6.1** | `UnitTests` | [`tests/NetStarterPack.Microservices.UnitTests/MicroservicesArchitectureTests.cs`](../tests/NetStarterPack.Microservices.UnitTests/MicroservicesArchitectureTests.cs) | Edit | Unit test CRUD, Cache, Soft-Delete, & `InMemoryEventBus` |
| **7.1** | `Frontend React` | `frontend/src/types/index.ts`, `pages/CustomersPage.tsx`, `App.tsx` | Buat/Edit | Tampilan tabel, modal CRUD, & proteksi `hasPermission` |

---

## Tahap 1: Update `BuildingBlocks.Core` (Agar Permission & Cache Key Dikenali Semua Service)

### 1.1. Daftarkan Konstanta Permission di [`Permissions.cs`](../src/BuildingBlocks/BuildingBlocks.Core/Constants/Permissions.cs)
Buka `src/BuildingBlocks/BuildingBlocks.Core/Constants/Permissions.cs`, tambahkan class `Customers` dan daftarkan ke dalam `Permissions.GetAll()`:

```csharp
public static class Customers
{
    public const string View = "Customers.View";
    public const string Create = "Customers.Create";
    public const string Edit = "Customers.Edit";
    public const string Delete = "Customers.Delete";
}

// Di dalam method GetAll():
new(Customers.View, "Lihat Pelanggan", "Customers", "Melihat daftar dan detail pelanggan"),
new(Customers.Create, "Tambah Pelanggan", "Customers", "Menambahkan pelanggan baru"),
new(Customers.Edit, "Ubah Pelanggan", "Customers", "Mengubah data pelanggan"),
new(Customers.Delete, "Hapus Pelanggan", "Customers", "Menghapus data pelanggan"),
```
> **Kenapa ditaruh di `BuildingBlocks.Core`?**
> Supaya **`Identity.Api`** bisa menampilkan pilihan centangan permission `Customers.*` di halaman **Role & Hak Akses (`/roles`)**, sementara **`Catalog.Api`** bisa memakainya pada atribut `[HasPermission(Permissions.Customers.Create)]`!

### 1.2. Tambahkan Kunci Cache di [`CacheKeys.cs`](../src/BuildingBlocks/BuildingBlocks.Core/Constants/CacheKeys.cs)
Buka `src/BuildingBlocks/BuildingBlocks.Core/Constants/CacheKeys.cs`:

```csharp
public const string CustomersPrefix = "customers:";

public static string CustomerList(string? search = null, string? status = null) =>
    $"{CustomersPrefix}list:s={search?.Trim().ToLowerInvariant() ?? "all"}:st={status?.Trim().ToLowerInvariant() ?? "all"}";

public static string CustomerById(Guid id) =>
    $"{CustomersPrefix}id:{id}";
```

---

## Tahap 2: Folder `Domain/` di Dalam Microservice

### 2.1. Buat Entity `Customer.cs`
Buat file `src/Services/Catalog/Catalog.Api/Domain/Entities/Customer.cs` yang mewarisi **`BaseEntity`** dari `BuildingBlocks.Core.Common`:

```csharp
using BuildingBlocks.Core.Common;

namespace Catalog.Api.Domain.Entities;

public enum CustomerStatus
{
    Active = 1,
    Inactive = 2,
    Blacklisted = 3
}

public class Customer : BaseEntity
{
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Phone { get; set; } = string.Empty;
    public string CompanyName { get; set; } = string.Empty;
    public decimal CreditLimit { get; set; }
    public CustomerStatus Status { get; set; } = CustomerStatus.Active;
}
```

### 2.2. Tambahkan Repository ke [`ICatalogUnitOfWork.cs`](../src/Services/Catalog/Catalog.Api/Domain/Interfaces/ICatalogUnitOfWork.cs)
```csharp
public interface ICatalogUnitOfWork
{
    IRepository<Product> Products { get; }
    IRepository<Customer> Customers { get; } // <-- Tambahkan baris ini
    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
```

---

## Tahap 3: Folder `Application/` di Dalam Microservice (Logika Bisnis + Cache + `IEventBus`)

### 3.1. Buat DTO (`CustomerDtos.cs`) & Interface (`ICustomerService.cs`)
Buat `src/Services/Catalog/Catalog.Api/Application/DTOs/CustomerDtos.cs`:
```csharp
namespace Catalog.Api.Application.DTOs;

public record CustomerDto(
    Guid Id,
    string Code,
    string Name,
    string Email,
    string Phone,
    string CompanyName,
    decimal CreditLimit,
    string Status,
    DateTime CreatedAt,
    string? CreatedBy);

public record CreateOrUpdateCustomerRequest(
    string Code,
    string Name,
    string Email,
    string Phone,
    string CompanyName,
    decimal CreditLimit,
    string Status = "Active");
```

Buat `src/Services/Catalog/Catalog.Api/Application/Interfaces/ICustomerService.cs`:
```csharp
using BuildingBlocks.Core.Common;
using Catalog.Api.Application.DTOs;

namespace Catalog.Api.Application.Interfaces;

public interface ICustomerService
{
    Task<Result<IReadOnlyList<CustomerDto>>> GetAllCustomersAsync(string? search = null, string? status = null, CancellationToken cancellationToken = default);
    Task<Result<CustomerDto>> GetCustomerByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<Result<CustomerDto>> CreateCustomerAsync(CreateOrUpdateCustomerRequest request, CancellationToken cancellationToken = default);
    Task<Result<CustomerDto>> UpdateCustomerAsync(Guid id, CreateOrUpdateCustomerRequest request, CancellationToken cancellationToken = default);
    Task<Result> DeleteCustomerAsync(Guid id, CancellationToken cancellationToken = default);
}
```

### 3.2. Buat Implementasi `CustomerService.cs` (Perhatikan Bedanya dengan Monolith pada Bagian `IEventBus`!)
Di arsitektur Microservices, tabel `AuditLogs` berada di database `NetStarterPack_IdentityDb` milik `Identity.Api`. Oleh karena itu, microservice bisnis **tidak melakukan insert ke tabel AuditLog lokal**, melainkan memanggil **`await eventBus.PublishAuditAsync(...)`**!

Buat file `src/Services/Catalog/Catalog.Api/Application/Services/CustomerService.cs`:

```csharp
using BuildingBlocks.Core.Common;
using BuildingBlocks.Core.Constants;
using BuildingBlocks.Core.Contracts;
using BuildingBlocks.Core.Interfaces;
using Catalog.Api.Application.DTOs;
using Catalog.Api.Application.Interfaces;
using Catalog.Api.Domain.Entities;
using Catalog.Api.Domain.Interfaces;

namespace Catalog.Api.Application.Services;

public class CustomerService(
    ICatalogUnitOfWork unitOfWork,
    ICurrentUserService currentUserService,
    ICacheService cacheService,
    IEventBus eventBus) : ICustomerService
{
    public async Task<Result<IReadOnlyList<CustomerDto>>> GetAllCustomersAsync(
        string? search = null,
        string? status = null,
        CancellationToken cancellationToken = default)
    {
        var baseKey = CacheKeys.CustomerList(null, null);

        var allDtos = await cacheService.GetOrCreateAsync(
            baseKey,
            async ct =>
            {
                var customers = await unitOfWork.Customers.GetListAsync(cancellationToken: ct);
                return customers
                    .OrderByDescending(c => c.CreatedAt)
                    .Select(MapToDto)
                    .ToList();
            },
            TimeSpan.FromMinutes(10),
            cancellationToken);

        IEnumerable<CustomerDto> query = allDtos;

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(c =>
                c.Name.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                c.Code.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                c.CompanyName.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                c.Email.Contains(term, StringComparison.OrdinalIgnoreCase));
        }

        if (!string.IsNullOrWhiteSpace(status))
        {
            var statusTerm = status.Trim();
            query = query.Where(c => c.Status.Equals(statusTerm, StringComparison.OrdinalIgnoreCase));
        }

        return Result<IReadOnlyList<CustomerDto>>.Success(query.ToList());
    }

    public async Task<Result<CustomerDto>> GetCustomerByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var dto = await cacheService.GetOrCreateAsync<CustomerDto?>(
            CacheKeys.CustomerById(id),
            async ct =>
            {
                var customer = await unitOfWork.Customers.GetByIdAsync(id, ct);
                return customer is null ? null : MapToDto(customer);
            },
            TimeSpan.FromMinutes(10),
            cancellationToken);

        return dto is null
            ? Result<CustomerDto>.Failure("Data pelanggan tidak ditemukan.", 404)
            : Result<CustomerDto>.Success(dto);
    }

    public async Task<Result<CustomerDto>> CreateCustomerAsync(
        CreateOrUpdateCustomerRequest request,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.Code) || string.IsNullOrWhiteSpace(request.Name))
        {
            return Result<CustomerDto>.Failure("Kode dan Nama pelanggan wajib diisi.", 400);
        }

        var code = request.Code.Trim().ToUpperInvariant();
        if (await unitOfWork.Customers.AnyAsync(c => c.Code == code, cancellationToken))
        {
            return Result<CustomerDto>.Failure($"Pelanggan dengan kode '{code}' sudah terdaftar.", 409);
        }

        if (!Enum.TryParse<CustomerStatus>(request.Status, true, out var status))
        {
            status = CustomerStatus.Active;
        }

        var customer = new Customer
        {
            Code = code,
            Name = request.Name.Trim(),
            Email = request.Email.Trim(),
            Phone = request.Phone.Trim(),
            CompanyName = request.CompanyName.Trim(),
            CreditLimit = request.CreditLimit,
            Status = status,
            CreatedBy = currentUserService.Username ?? "System"
        };

        // 1. Simpan ke Database lokal Microservice
        await unitOfWork.Customers.AddAsync(customer, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        // 2. Invalidate Cache modul Customers
        await cacheService.RemoveByPrefixAsync(CacheKeys.CustomersPrefix, cancellationToken);

        // 3. Publish AuditLogIntegrationEvent ke Identity.Api lewat IEventBus (Resilient & Decoupled!)
        await eventBus.PublishAuditAsync(new AuditLogIntegrationEvent(
            UserId: currentUserService.UserId,
            UserName: currentUserService.Username ?? "System",
            Action: "CREATE_CUSTOMER",
            Module: "Customers",
            EntityId: customer.Id.ToString(),
            Details: $"[Catalog.Api] Menambahkan pelanggan '{customer.Name}' (Kode: {customer.Code}).",
            IpAddress: currentUserService.IpAddress,
            SourceService: "Catalog.Api"), cancellationToken);

        return Result<CustomerDto>.Success(MapToDto(customer), "Data pelanggan berhasil ditambahkan.", 201);
    }

    public async Task<Result<CustomerDto>> UpdateCustomerAsync(
        Guid id,
        CreateOrUpdateCustomerRequest request,
        CancellationToken cancellationToken = default)
    {
        var customer = await unitOfWork.Customers.GetByIdAsync(id, cancellationToken);
        if (customer is null)
        {
            return Result<CustomerDto>.Failure("Data pelanggan tidak ditemukan.", 404);
        }

        var code = request.Code.Trim().ToUpperInvariant();
        if (await unitOfWork.Customers.AnyAsync(c => c.Id != id && c.Code == code, cancellationToken))
        {
            return Result<CustomerDto>.Failure($"Pelanggan lain dengan kode '{code}' sudah ada.", 409);
        }

        if (Enum.TryParse<CustomerStatus>(request.Status, true, out var status))
        {
            customer.Status = status;
        }

        customer.Code = code;
        customer.Name = request.Name.Trim();
        customer.Email = request.Email.Trim();
        customer.Phone = request.Phone.Trim();
        customer.CompanyName = request.CompanyName.Trim();
        customer.CreditLimit = request.CreditLimit;
        customer.UpdatedAt = DateTime.UtcNow;
        customer.UpdatedBy = currentUserService.Username ?? "System";

        unitOfWork.Customers.Update(customer);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        await cacheService.RemoveByPrefixAsync(CacheKeys.CustomersPrefix, cancellationToken);

        await eventBus.PublishAuditAsync(new AuditLogIntegrationEvent(
            UserId: currentUserService.UserId,
            UserName: currentUserService.Username ?? "System",
            Action: "UPDATE_CUSTOMER",
            Module: "Customers",
            EntityId: customer.Id.ToString(),
            Details: $"[Catalog.Api] Memperbarui pelanggan '{customer.Name}' (Kode: {customer.Code}).",
            IpAddress: currentUserService.IpAddress,
            SourceService: "Catalog.Api"), cancellationToken);

        return Result<CustomerDto>.Success(MapToDto(customer), "Data pelanggan berhasil diperbarui.");
    }

    public async Task<Result> DeleteCustomerAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var customer = await unitOfWork.Customers.GetByIdAsync(id, cancellationToken);
        if (customer is null)
        {
            return Result.Failure("Data pelanggan tidak ditemukan.", 404);
        }

        unitOfWork.Customers.Remove(customer);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        await cacheService.RemoveByPrefixAsync(CacheKeys.CustomersPrefix, cancellationToken);

        await eventBus.PublishAuditAsync(new AuditLogIntegrationEvent(
            UserId: currentUserService.UserId,
            UserName: currentUserService.Username ?? "System",
            Action: "DELETE_CUSTOMER",
            Module: "Customers",
            EntityId: customer.Id.ToString(),
            Details: $"[Catalog.Api] Menghapus pelanggan '{customer.Name}' (Kode: {customer.Code}).",
            IpAddress: currentUserService.IpAddress,
            SourceService: "Catalog.Api"), cancellationToken);

        return Result.Success("Data pelanggan berhasil dihapus.");
    }

    private static CustomerDto MapToDto(Customer c) =>
        new(
            c.Id,
            c.Code,
            c.Name,
            c.Email,
            c.Phone,
            c.CompanyName,
            c.CreditLimit,
            c.Status.ToString(),
            c.CreatedAt,
            c.CreatedBy);
}
```

---

## Tahap 4: Folder `Infrastructure/` & Registrasi DI di Microservice

### 4.1. Update `CatalogDbContext` & `CatalogUnitOfWork` di [`CatalogPersistence.cs`](../src/Services/Catalog/Catalog.Api/Infrastructure/Persistence/CatalogPersistence.cs)
```csharp
// Di dalam CatalogDbContext:
public DbSet<Product> Products => Set<Product>();
public DbSet<Customer> Customers => Set<Customer>(); // <-- Tambahkan ini

// Di dalam OnModelCreating:
modelBuilder.Entity<Customer>(entity =>
{
    entity.ToTable("Customers");
    entity.HasKey(x => x.Id);
    entity.Property(x => x.Code).HasMaxLength(50).IsRequired();
    entity.Property(x => x.Name).HasMaxLength(200).IsRequired();
    entity.Property(x => x.Email).HasMaxLength(150);
    entity.Property(x => x.Phone).HasMaxLength(50);
    entity.Property(x => x.CompanyName).HasMaxLength(200);
    entity.Property(x => x.CreditLimit).HasPrecision(18, 2);
    entity.HasIndex(x => x.Code).IsUnique();
    entity.HasQueryFilter(x => !x.IsDeleted); // WAJIB untuk Soft-Delete!
});

// Di dalam CatalogUnitOfWork:
private IRepository<Customer>? _customers;
public IRepository<Customer> Customers =>
    _customers ??= new GenericRepository<Customer, CatalogDbContext>(dbContext);
```

### 4.2. Daftarkan Service di `Catalog.Api/Program.cs`
```csharp
builder.Services.AddScoped<ICustomerService, CustomerService>();
```

---

## Tahap 5: Buat Controller & Daftarkan Route di YARP API Gateway (`Gateway.Api`)

### 5.1. Buat `CustomersController.cs` di `Catalog.Api/Controllers/`
```csharp
using BuildingBlocks.Core.Constants;
using BuildingBlocks.Infrastructure.Controllers;
using BuildingBlocks.Security;
using Catalog.Api.Application.DTOs;
using Catalog.Api.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Catalog.Api.Controllers;

[Authorize]
public class CustomersController(ICustomerService customerService) : BaseApiController
{
    [HasPermission(Permissions.Customers.View)]
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? search, [FromQuery] string? status, CancellationToken ct) =>
        ToActionResult(await customerService.GetAllCustomersAsync(search, status, ct));

    [HasPermission(Permissions.Customers.View)]
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken ct) =>
        ToActionResult(await customerService.GetCustomerByIdAsync(id, ct));

    [HasPermission(Permissions.Customers.Create)]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateOrUpdateCustomerRequest request, CancellationToken ct) =>
        ToActionResult(await customerService.CreateCustomerAsync(request, ct));

    [HasPermission(Permissions.Customers.Edit)]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] CreateOrUpdateCustomerRequest request, CancellationToken ct) =>
        ToActionResult(await customerService.UpdateCustomerAsync(id, request, ct));

    [HasPermission(Permissions.Customers.Delete)]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct) =>
        ToActionResult(await customerService.DeleteCustomerAsync(id, ct));
}
```

### 5.2. Tambahkan Route `/api/customers` di YARP [`Gateway.Api/appsettings.json`](../src/ApiGateway/Gateway.Api/appsettings.json)
Supaya panggilan `api.get('/customers')` dari React (`:5173`) diteruskan oleh YARP Gateway (`:5080`) ke `Catalog.Api (:5082)`, tambahkan route ini di `src/ApiGateway/Gateway.Api/appsettings.json`:

```json
"customers-route": {
  "ClusterId": "catalog-cluster",
  "Match": {
    "Path": "/api/customers/{**catch-all}"
  }
},
"customers-root-route": {
  "ClusterId": "catalog-cluster",
  "Match": {
    "Path": "/api/customers"
  }
}
```
> **Otomatis Tampil di Unified Swagger & Scalar Gateway!**
> Karena `Gateway.Api` memiliki *Unified OpenAPI Merger*, begitu kamu menambahkan `CustomersController` di `Catalog.Api`, seluruh endpoint `/api/customers` **langsung muncul secara otomatis** di **`http://localhost:5080/swagger`** dan **`http://localhost:5080/scalar/v1`**!

---

## Tahap 6: Membuat Unit Test (`tests/NetStarterPack.Microservices.UnitTests`)

Di [`MicroservicesArchitectureTests.cs`](../tests/NetStarterPack.Microservices.UnitTests/MicroservicesArchitectureTests.cs), kamu bisa langsung menguji `CustomerService` menggunakan `CreateSeededCatalogAsync()` dan `InMemoryEventBus`:

```csharp
[Fact]
public async Task CustomerService_CreateUpdateDelete_ShouldValidateCacheAndPublishAuditEvents()
{
    var (db, catalogUow) = await CreateSeededCatalogAsync();
    var currentUser = new FakeCurrentUserService { Username = "staff" };
    var cache = CreateTestCacheService();
    var eventBus = new InMemoryEventBus();

    var customerService = new CustomerService(catalogUow, currentUser, cache, eventBus);

    // 1. Tambah Pelanggan Baru (201 Created)
    var createReq = new CreateOrUpdateCustomerRequest(
        Code: "cust-001",
        Name: "PT Nusantara Maju",
        Email: "billing@nusantara.co.id",
        Phone: "021-5550123",
        CompanyName: "Nusantara Group",
        CreditLimit: 50_000_000m,
        Status: "Active");

    var createResult = await customerService.CreateCustomerAsync(createReq);

    Assert.True(createResult.Succeeded);
    Assert.Equal(201, createResult.StatusCode);
    Assert.Equal("CUST-001", createResult.Data!.Code);

    // 2. Pastikan event CREATE_CUSTOMER terkirim ke IEventBus
    Assert.Single(eventBus.PublishedEvents);
    Assert.Equal("CREATE_CUSTOMER", eventBus.PublishedEvents[0].Action);

    // 3. Pastikan kode duplikat ditolak (409 Conflict)
    var duplicateResult = await customerService.CreateCustomerAsync(createReq);
    Assert.False(duplicateResult.Succeeded);
    Assert.Equal(409, duplicateResult.StatusCode);

    // 4. Pastikan Soft-Delete mengubah IsDeleted = true
    var customerId = createResult.Data.Id;
    await customerService.DeleteCustomerAsync(customerId);

    var rawInDb = await db.Customers.IgnoreQueryFilters().FirstOrDefaultAsync(c => c.Id == customerId);
    Assert.NotNull(rawInDb);
    Assert.True(rawInDb!.IsDeleted);
}
```

---

## Tahap 7: Implementasi di Frontend React (`frontend/`) & Menu Sidebar

Di sisi Frontend React (`:5173`), langkahnya **100% sama mudahnya** dengan edisi Monolith karena semua request `/api/*` di-proxy otomatis ke YARP API Gateway (`:5080`):

1. **Tambahkan Interface di [`frontend/src/types/index.ts`](../frontend/src/types/index.ts)**:
   ```ts
   export interface CustomerItem {
     id: string;
     code: string;
     name: string;
     email: string;
     phone: string;
     companyName: string;
     creditLimit: number;
     status: string;
     createdAt: string;
     createdBy?: string;
   }
   ```
2. **Buat Halaman `frontend/src/pages/CustomersPage.tsx`**:
   Gunakan `const { hasPermission } = useAuth();` untuk mengecek `Customers.Create`, `Customers.Edit`, dan `Customers.Delete`, lalu panggil `api.get('/customers')`, `api.post('/customers', form)`, `api.put(...)`, dan `api.delete(...)`.
3. **Daftarkan Route di [`frontend/src/App.tsx`](../frontend/src/App.tsx)**:
   ```tsx
   <Route
     path="customers"
     element={
       <ProtectedRoute permission="Customers.View">
         <CustomersPage />
       </ProtectedRoute>
     }
   />
   ```
4. **Daftarkan ke Menu Sidebar**:
   - Bisa ditambahkan secara permanen di [`IdentityDatabaseSeeder.cs`](../src/Services/Identity/Identity.Api/Infrastructure/Persistence/IdentityDatabaseSeeder.cs) (milik `Identity.Api`), **ATAU**
   - Langsung login sebagai `superadmin` di web (`http://localhost:5173`), buka halaman **Manajemen Menu (`/menus`)** $\rightarrow$ klik **Tambah Menu** (`/customers`, permission `Customers.View`), lalu centang hak aksesnya di halaman **Role & Hak Akses (`/roles`)**!

---

# BAGIAN B (EXAMPLE 2 — SUDAH TERIMPLEMENTASI LIVE!): Membuat Microservice Mandiri Baru dari Nol (Order.Api di Port 5083)

> 💡 **Kabar Baik!** Seluruh studi kasus **Example 2 (Order.Api di Port 5083 + halaman React OrdersPage.tsx)** di bawah ini **SUDAH DIIMPLEMENTASIKAN SECARA NYATA** di dalam solution ini!
> Kamu bisa langsung membuka dan mempelajari file aslinya di:
> - **Backend Microservice**: [src/Services/Order/Order.Api/](../src/Services/Order/Order.Api/) (Order.cs, OrderService.cs, OrderPersistence.cs, OrdersController.cs, Program.cs)
> - **YARP Gateway Route**: [src/ApiGateway/Gateway.Api/appsettings.json](../src/ApiGateway/Gateway.Api/appsettings.json) (orders-route $\rightarrow$ http://localhost:5083)
> - **Unit Test**: [	ests/NetStarterPack.Microservices.UnitTests/MicroservicesArchitectureTests.cs](../tests/NetStarterPack.Microservices.UnitTests/MicroservicesArchitectureTests.cs) (OrderService_Example2Microservice_ShouldCalculateTotal_InvalidateCache_And_PublishAuditEvent)
> - **Frontend React UI**: [rontend/src/pages/OrdersPage.tsx](../frontend/src/pages/OrdersPage.tsx) (Menu: **Pesanan (Order.Api)** di /orders)

Kapan kamu harus membuat **Microservice Baru** (bukan sekadar menambah tabel di `Catalog.Api`)?
- Ketika domain bisnisnya benar-benar terpisah (misalnya: **`Order.Api`** untuk Transaksi Pesanan, **`Finance.Api`** untuk Pembukuan, atau **`HR.Api`** untuk Kepegawaian).
- Ketika kamu ingin modul tersebut punya **Database SQL Server sendiri** (`NetStarterPack_OrderDb`) dan bisa di-deploy atau di-*scale-out* pada port/server terpisah.

Mari kita buat microservice ke-3 bernama **`Order.Api`** di **Port `5083`** dalam **5 Langkah Cepat**!

---

## Langkah 1: Buat Project `Order.Api.csproj` & Masukkan ke Solution

Buat folder `src/Services/Order/Order.Api/` dan file `Order.Api.csproj` yang mereferensikan ketiga `BuildingBlocks`:

```xml
<Project Sdk="Microsoft.NET.Sdk.Web">

  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <GenerateDocumentationFile>true</GenerateDocumentationFile>
    <NoWarn>$(NoWarn);1591</NoWarn>
  </PropertyGroup>

  <ItemGroup>
    <ProjectReference Include="..\..\..\BuildingBlocks\BuildingBlocks.Core\BuildingBlocks.Core.csproj" />
    <ProjectReference Include="..\..\..\BuildingBlocks\BuildingBlocks.Security\BuildingBlocks.Security.csproj" />
    <ProjectReference Include="..\..\..\BuildingBlocks\BuildingBlocks.Infrastructure\BuildingBlocks.Infrastructure.csproj" />
  </ItemGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.EntityFrameworkCore" Version="10.0.*" />
    <PackageReference Include="Microsoft.EntityFrameworkCore.InMemory" Version="10.0.*" />
    <PackageReference Include="Microsoft.EntityFrameworkCore.Sqlite" Version="10.0.*" />
    <PackageReference Include="Microsoft.EntityFrameworkCore.SqlServer" Version="10.0.*" />
  </ItemGroup>

</Project>
```

Lalu daftarkan ke solution lewat terminal:
```powershell
dotnet sln NetStarterPack.Microservices.sln add src/Services/Order/Order.Api/Order.Api.csproj --solution-folder src/Services
```

---

## Langkah 2: Buat Struktur Folder Compact Onion di `Order.Api`

Di dalam `src/Services/Order/Order.Api/`, buat 4 folder standar Compact Onion:
```text
Order.Api/
├── Domain/
│   ├── Entities/Order.cs               # class Order : BaseEntity
│   └── Interfaces/IOrderUnitOfWork.cs  # interface IOrderUnitOfWork
├── Application/
│   ├── DTOs/OrderDtos.cs               # record OrderDto & CreateOrderRequest
│   ├── Interfaces/IOrderService.cs     # interface IOrderService
│   └── Services/OrderService.cs        # Pakai IOrderUnitOfWork + ICacheService + IEventBus
├── Infrastructure/
│   └── Persistence/OrderPersistence.cs # OrderDbContext (NetStarterPack_OrderDb), OrderUnitOfWork, Seeder
└── Controllers/
    └── OrdersController.cs             # class OrdersController : BaseApiController + [HasPermission]
```
*(Seluruh isi kodenya tinggal mengikuti pola `Catalog.Api` yang sudah ada!)*

---

## Langkah 3: Buat `Program.cs` & `appsettings.json` untuk `Order.Api` (`Port 5083`)

Karena kita sudah punya **`BuildingBlocks`**, file `Order.Api/Program.cs` sangat ringkas dan otomatis mendapatkan Zero-Trust JWT Auth, `[HasPermission]`, Hybrid L1/L2 Redis Cache, `HttpEventBus`, `CorrelationIdMiddleware`, `GlobalExceptionHandler`, Swagger UI, dan Scalar UI:

```csharp
using BuildingBlocks.Infrastructure;
using BuildingBlocks.Security;
using Microsoft.EntityFrameworkCore;
// using Order.Api...

var builder = WebApplication.CreateBuilder(args);

// 1. Plug & Play Zero-Trust JWT, [HasPermission], L1/L2 Cache, EventBus, & OpenAPI
builder.Services.AddSharedJwtSecurity(builder.Configuration);
builder.Services.AddSharedInfrastructure(builder.Configuration);

// 2. Setup Database Terisolasi (NetStarterPack_OrderDb)
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
builder.Services.AddDbContext<OrderDbContext>(options =>
    options.UseSqlServer(connectionString, sql => sql.EnableRetryOnFailure(3)));

// 3. Register Order Onion Services
builder.Services.AddScoped<IOrderUnitOfWork, OrderUnitOfWork>();
builder.Services.AddScoped<IOrderService, OrderService>();

var app = builder.Build();

// 4. Pasang Middleware, Auth, Controllers, /swagger, /scalar/v1, & /api/health
app.UseSharedMicroservicePipeline(
    serviceTitle: "Order Microservice API",
    serviceName: "Order.Api");

app.Run();
```

Dan di `Order.Api/appsettings.json`, arahkan port ke **`5083`** dan database ke **`NetStarterPack_OrderDb`**:
```json
{
  "Urls": "http://localhost:5083",
  "DatabaseProvider": "SqlServer",
  "ConnectionStrings": {
    "DefaultConnection": "Data Source=LAPTOP-G513H4H7\\SQLEXPRESS02;Initial Catalog=NetStarterPack_OrderDb;Integrated Security=True;TrustServerCertificate=True;"
  },
  "JwtSettings": {
    "Issuer": "NetStarterPack.Microservices",
    "Audience": "NetStarterPack.Client",
    "SecretKey": "SuperSecretStarterPackJwtSigningKey_2026_ChangeInProduction_Min32Chars!",
    "InternalApiKey": "InternalMicroserviceKey_2026_ZeroTrust"
  },
  "ServiceEndpoints": {
    "GatewayUrl": "http://localhost:5080",
    "IdentityServiceUrl": "http://localhost:5081",
    "CatalogServiceUrl": "http://localhost:5082"
  }
}
```

---

## Langkah 4: Sambungkan `Order.Api (:5083)` ke YARP API Gateway (`Gateway.Api :5080`)

1. **Tambahkan Route & Cluster di [`src/ApiGateway/Gateway.Api/appsettings.json`](../src/ApiGateway/Gateway.Api/appsettings.json)**:
   ```json
   // Di dalam "ReverseProxy" -> "Routes":
   "orders-route": {
     "ClusterId": "order-cluster",
     "Match": {
       "Path": "/api/orders/{**catch-all}"
     }
   },
   "orders-root-route": {
     "ClusterId": "order-cluster",
     "Match": {
       "Path": "/api/orders"
     }
   }

   // Di dalam "ReverseProxy" -> "Clusters":
   "order-cluster": {
     "Destinations": {
       "destination1": {
         "Address": "http://localhost:5083"
       }
     }
   }
   ```

2. **Tambahkan ke Auto-Orchestrator & OpenAPI Merger di [`src/ApiGateway/Gateway.Api/Program.cs`](../src/ApiGateway/Gateway.Api/Program.cs)**:
   - Di bagian Orchestrator (`if (app.Environment.IsDevelopment())`), tambahkan:
     ```csharp
     TryStartDotnetMicroservice(
         serviceName: "Order.Api",
         port: 5083,
         projectDir: Path.Combine(solutionRoot, "src", "Services", "Order", "Order.Api"),
         spawnedProcesses,
         app.Logger);
     ```
   - Di bagian `/openapi/v1.json`, tambahkan:
     ```csharp
     await MergeMicroserviceOpenApiAsync(client, "http://localhost:5083/openapi/v1.json", mergedPaths, mergedSchemas);
     ```
   - Di [`Gateway.Api.csproj`](../src/ApiGateway/Gateway.Api/Gateway.Api.csproj), tambahkan build-order reference agar ikut di-build otomatis saat tekan `F5`:
     ```xml
     <ProjectReference Include="..\..\Services\Order\Order.Api\Order.Api.csproj" ReferenceOutputAssembly="false" />
     ```

---

## Langkah 5: Jalankan `F5` & Nikmati Hasilnya!

Begitu kamu menekan **`F5`** di Visual Studio:
- `Gateway.Api (:5080)` otomatis menyalakan `Identity.Api (:5081)`, `Catalog.Api (:5082)`, **`Order.Api (:5083)`**, dan `React Vite (:5173)`.
- Buka **`http://localhost:5080/swagger`** atau **`http://localhost:5080/scalar/v1`** $\rightarrow$ endpoint `/api/orders` sudah tergabung rapi bersama endpoint microservice lainnya!

