# Peta Lengkap Project & Subfolder: Tujuan, Isi File, & Kasus Penggunaannya

Dokumen ini dibuat sebagai **peta navigasi harian** untuk developer. Setiap project di repository ini punya subfolder-subfolder spesifik (seperti `Middleware/`, `Caching/`, `Messaging/`, `Clients/`, `Contracts/`, `Persistence/`, dll).

Di sini kita bedah **satu per satu semua project dan subfoldernya**:
- **Apa tujuan foldernya?**
- **Apa saja isi file yang sudah ada di dalamnya?**
- **Kapan & dalam kasus apa kamu harus menambah/mengubah file di folder tersebut?**
- **Apa yang TIDAK boleh ditaruh di folder tersebut** (biar arsitektur tetap bersih dan tidak jadi *spaghetti code*).

---

## 🧭 Cheat Sheet Cepat: "Kalau Saya Mau Bikin X, Taruh di Mana?"

| Kebutuhan / Kasus Nyata | Folder / File Tujuan |
| :--- | :--- |
| Tambah **permission** atau **role** baru yang dipakai lintas microservice | `src/BuildingBlocks/BuildingBlocks.Core/Constants/` (`Permissions.cs`, `RoleNames.cs`) |
| Tambah **event** atau **DTO komunikasi antar-microservice** | `src/BuildingBlocks/BuildingBlocks.Core/Contracts/IntegrationContracts.cs` |
| Tambah **middleware HTTP global** (misal *request timing*, *tenant header*, *custom security headers*) | `src/BuildingBlocks/BuildingBlocks.Infrastructure/Middleware/` |
| Ubah mekanisme **caching** (misal pindah InMemory &rarr; Redis atau tambah *sliding expiration*) | `src/BuildingBlocks/BuildingBlocks.Infrastructure/Caching/` |
| Ganti **transport event** dari HTTP ke **RabbitMQ / Kafka / Azure Service Bus** | `src/BuildingBlocks/BuildingBlocks.Infrastructure/Messaging/` |
| Ubah cara **validasi JWT** atau logika `[HasPermission]` lintas semua service | `src/BuildingBlocks/BuildingBlocks.Security/` |
| Tambah **tabel database / entity baru** di suatu microservice | `src/Services/<Service>/<Service>.Api/Domain/Entities/` + `Infrastructure/Persistence/` |
| Tambah **logika bisnis, validasi, perhitungan, atau state machine** | `src/Services/<Service>/<Service>.Api/Application/Services/` |
| Panggil **API microservice lain atau 3rd-party API** (Midtrans, WhatsApp, Email SMTP, SAP) | `src/Services/<Service>/<Service>.Api/Infrastructure/Clients/` |
| Tambah **endpoint HTTP baru** (`GET`/`POST`/`PUT`/`DELETE`) | `src/Services/<Service>/<Service>.Api/Controllers/` |
| Daftarkan **URL route baru** agar bisa diakses Frontend lewat port `5080` | `src/ApiGateway/Gateway.Api/appsettings.json` (`ReverseProxy`) |
| Tambah **halaman UI baru** di React | `frontend/src/pages/` + daftarkan route di `frontend/src/App.tsx` |
| Tambah **komponen UI reusable** (modal, badge, icon, layout, route guard) | `frontend/src/components/` |
| Tambah **unit test** untuk logika bisnis / security guard baru | `tests/NetStarterPack.Microservices.UnitTests/` |

---

## 1. `src/BuildingBlocks/` — Shared Kernel (Dipakai Bersama Semua Microservice)

Folder `BuildingBlocks` adalah fondasi bersama. Aturannya: **kode yang dibutuhkan oleh lebih dari 1 microservice ditaruh di sini**, supaya tidak copy-paste berulang kali setiap kali bikin microservice baru.

### 1.1. `BuildingBlocks.Core` *(ZERO External NuGet Package)*
Project terdalam yang 100% murni C# standar. Tidak boleh ada EF Core, ASP.NET Core HTTP, atau Redis di sini.

| Subfolder | File Saat Ini | Tujuan & Fungsi | Kapan & Kasus Apa Dipakai? |
| :--- | :--- | :--- | :--- |
| **`Common/`** | `BaseEntity.cs`, `Result.cs` | Standar pondasi seluruh entity (`Id`, `CreatedAt`, `CreatedBy`, `UpdatedAt`, `IsDeleted`) dan standar pembungkus response API (`Result`, `Result<T>`, `PagedResult<T>`). | **Kasus**: Kalau semua tabel di seluruh perusahaan butuh kolom standar baru (misal `TenantId` untuk *multi-tenancy*), atau format response JSON global mau ditambah field baru (misal `TraceId`). |
| **`Constants/`** | `RoleNames.cs`, `Permissions.cs`, `CacheKeys.cs` | Pusat konstanta bersama agar tidak ada *typo* string antar microservice. | **Kasus**: Setiap kali kamu bikin modul/microservice baru! Daftarkan role baru di `RoleNames.cs`, kode permission di `Permissions.cs` (supaya muncul di UI `/roles` milik `Identity.Api` sekaligus dipakai di `[HasPermission]` milik service baru), dan prefix cache di `CacheKeys.cs`. |
| **`Contracts/`** | `IntegrationContracts.cs` | Menyimpan DTO/Event kontrak komunikasi **antar-microservice** (`AuditLogIntegrationEvent`, `CatalogStatsDto`, `OrderStatsDto`, `WorkflowStatsDto`, `ServiceHealthNode`). | **Kasus**: Saat Microservice A perlu mengirim event atau data ringkasan ke Microservice B (misal `Order.Api` kirim `OrderCreatedEvent` ke `Inventory.Api` untuk potong stok). |
| **`Interfaces/`** | `ICoreInterfaces.cs` | Mendefinisikan kontrak/abstraksi lintas service (`IRepository<T>`, `IUnitOfWork`, `ICacheService`, `ICurrentUserService`, `IEventBus`) tanpa tahu detail implementasi teknisnya. | **Kasus**: Saat kamu mau menambah kapabilitas shared baru yang bisa di-mock saat Unit Testing (misal bikin interface `IEmailSender`, `IFileStorageService`, atau `IDateTimeProvider`). |

> **Yang TIDAK boleh masuk `BuildingBlocks.Core`**: Class spesifik 1 domain (misal `Product` atau `WorkflowRequest`) atau package NuGet eksternal.

---

### 1.2. `BuildingBlocks.Security` *(Zero-Trust Authentication & Authorization)*
Project kecil khusus keamanan yang cukup dipasang 1 baris (`builder.Services.AddSharedJwtSecurity(...)`) di `Program.cs` tiap microservice.

| File | Tujuan & Fungsi | Kapan & Kasus Apa Dipakai? |
| :--- | :--- | :--- |
| **`JwtSettings.cs`** | Model konfigurasi section `"JwtSettings"` (`Issuer`, `Audience`, `SecretKey`, `InternalApiKey`) + extension method `AddSharedJwtSecurity()`. | **Kasus**: Saat mau mengubah aturan validasi JWT (misal migrasi dari symmetric key ke **RS256 Public Key / Azure AD / Keycloak / OIDC**) — cukup ubah di 1 file ini, otomatis semua microservice ikut berubah! |
| **`PermissionAuthorization.cs`** | Menyediakan atribut `[HasPermission("...")]`, `PermissionPolicyProvider`, dan `PermissionAuthorizationHandler` (termasuk bypass otomatis untuk `SuperAdmin`). | **Kasus**: Saat mau menambah jenis policy keamanan baru (misal `[HasDepartment("Finance")]` atau `[RequireVerifiedEmail]`). |
| **`CurrentUserService.cs`** | Implementasi `ICurrentUserService` yang membaca `UserId`, `Username`, `FullName`, `Roles`, `Permissions`, `IpAddress`, dan `CorrelationId` langsung dari `HttpContext.User` (klaim JWT). | **Kasus**: Saat `Identity.Api` menambah klaim baru di JWT (misal `"department"` atau `"branchId"`) dan microservice lain butuh membacanya tanpa query balik ke `IdentityDb`. |

---

### 1.3. `BuildingBlocks.Infrastructure` *(Implementasi Teknis Bersama)*
Project ini berisi seluruh *plumbing* teknis yang dipakai ulang oleh `Identity.Api`, `Catalog.Api`, `Order.Api`, `Workflow.Api`, dan `Gateway.Api`.

| Subfolder | File Saat Ini | Tujuan & Fungsi | Kapan & Kasus Apa Dipakai? |
| :--- | :--- | :--- | :--- |
| **`Caching/`** | `DistributedCacheService.cs` | Implementasi `ICacheService` dengan arsitektur **Hybrid L1 (`IMemoryCache`) + L2 (`IDistributedCache` / Redis)**, fitur `RemoveByPrefixAsync`, dan *safe fallback* jika Redis mati. | **Kasus**: Saat mau menyetel perilaku Redis, menambah kompresi payload cache besar, atau menambahkan metrics cache hit/miss. *(Baca detail di [`docs/05_CACHING_AND_REDIS.md`](05_CACHING_AND_REDIS.md)).* |
| **`Controllers/`** | `BaseApiController.cs` | Parent class semua Controller di seluruh microservice yang menyediakan helper `ToActionResult(Result)` agar status HTTP (`200`, `201`, `400`, `403`, `404`, `409`) selalu seragam. | **Kasus**: Saat mau menambahkan helper controller global (misal helper `ToFileResult(...)` untuk download Excel/PDF standar atau format pagination header `X-Total-Count`). |
| **`Messaging/`** | `HttpEventBus.cs` | Implementasi `IEventBus` yang mengirim `AuditLogIntegrationEvent` antar-service via HTTP internal dengan header `X-Internal-Api-Key`, `X-Correlation-Id`, timeout 2 detik, dan *graceful degradation*. | **Kasus**: Saat skala sistem membesar dan kamu ingin mengganti transport dari HTTP ke **MassTransit + RabbitMQ**, **Kafka**, atau **Azure Service Bus** — cukup buat implementasi baru `RabbitMqEventBus : IEventBus` di folder ini! |
| **`Middleware/`** | `SharedMiddleware.cs` | Berisi **2 komponen pipeline HTTP global**:<br>1. `CorrelationIdMiddleware`: membuat/meneruskan header `X-Correlation-Id` untuk distributed tracing lintas service.<br>2. `GlobalExceptionHandler`: menangkap error tak terduga dan mengembalikan JSON `Result.Failure(..., 500)` yang rapi (tidak bocor stacktrace ke user). | **Kasus**: Saat butuh logika yang harus jalan di **setiap request masuk** pada semua microservice, misalnya: *Request/Response Execution Timer* (deteksi slow API > 1 detik), *Maintenance Mode Middleware*, *Idempotency-Key Middleware*, atau *Security Response Headers* (`X-Content-Type-Options`, `CSP`). |
| **`Persistence/`** | `GenericRepository.cs` | Implementasi `GenericRepository<T, TContext>` untuk operasi CRUD standar (`GetByIdAsync`, `GetListAsync`, `AddAsync`, `Update`, `Remove` soft-delete, `AnyAsync`, `CountAsync`) yang bisa dipakai oleh `DbContext` milik microservice mana pun. | **Kasus**: Saat mau menambah method repository umum baru untuk semua tabel (misal `AddRangeAsync`, `GetPagedAsync` dengan sorting dinamis, atau *bulk soft-delete*), atau interceptor EF Core global (misal otomatis mengisi `UpdatedAt` dan `UpdatedBy` di `SaveChangesAsync`). |
| *(Root)* | `InfrastructureExtensions.cs` | Menyediakan `AddSharedInfrastructure()` dan `UseSharedMicroservicePipeline()` (mendaftarkan Cache, EventBus, Swagger/Scalar, `/api/health`, ExceptionHandler, serta **Parent-PID Watchdog** agar proses shadow-copy ikut mati saat Visual Studio Stop). | **Kasus**: Saat menambah komponen baru di salah satu subfolder di atas dan ingin otomatis aktif di seluruh microservice hanya lewat 1 baris registrasi. |

---

## 2. `src/ApiGateway/Gateway.Api/` — Pintu Masuk Tunggal (Port `5080`)

`Gateway.Api` sengaja **stateless** (tidak punya database, tidak punya folder `Domain/` atau `Application/`), karena tugasnya murni sebagai *reverse proxy* & orkestrator.

| File / Folder | Tujuan & Fungsi | Kapan & Kasus Apa Dipakai? |
| :--- | :--- | :--- |
| **`appsettings.json`** | Menyimpan konfigurasi **YARP Reverse Proxy** (`Routes` & `Clusters`), `Cors:AllowedOrigins`, `ServiceEndpoints`, dan port `MicroservicesOrchestrator`. | **Kasus**: Setiap kali kamu menambah microservice baru (misal `Inventory.Api :5085`), atau saat deploy ke production dan domain frontend berubah (tambahkan URL domain production ke `Cors:AllowedOrigins`). |
| **`Program.cs`** | Mengatur Rate Limiter (`300 req/menit`), CORS, F5 Auto-Orchestrator (Shadow-Copy), Unified OpenAPI Merger (`/openapi/v1.json`), Unified Swagger/Scalar, dan Aggregated Health Probe (`/api/health`). | **Kasus**: Saat ingin mengubah batas Rate Limit (misal endpoint login dibatasi lebih ketat 10 req/menit), menambah microservice baru ke Unified Swagger & Health Probe, atau menambah transformasi header YARP. |
| **`Properties/launchSettings.json`** | Profil startup Visual Studio (port `5080`, otomatis membuka `/swagger`). | **Kasus**: Saat ingin mengubah browser default atau environment variable khusus development lokal. |
| **`Dockerfile`** | Resep build multi-stage Docker image untuk `Gateway.Api`. | **Kasus**: Saat menambah microservice baru (tambahkan `COPY` project reference bila `Gateway.Api.csproj` merujuknya untuk build order). |

---

## 3. `src/Services/<NamaService>/<NamaService>.Api/` — Anatomi Compact Onion per Microservice

Setiap microservice (`Identity.Api`, `Catalog.Api`, `Order.Api`, `Workflow.Api`) memakai struktur **4 Layer Compact Onion** yang identik supaya developer yang pindah dari satu service ke service lain langsung familiar dalam 1 menit!

### A. Layer `Domain/` — Aturan Inti & Model Data Service
| Subfolder | Tujuan & Fungsi | Kapan & Kasus Apa Dipakai? |
| :--- | :--- | :--- |
| **`Domain/Entities/`** | Menyimpan class entity tabel database (mewarisi `BaseEntity`) dan `enum` status bisnis (contoh: `Product`, `Order`, `OrderStatus`, `FormTemplate`, `WorkflowRequest`, `WorkflowApprovalStep`, `WorkflowHistoryLog`). | **Kasus**: Setiap kali ada tabel baru, kolom baru, relasi baru, atau status bisnis baru di database microservice tersebut. |
| **`Domain/Interfaces/`** | Menyimpan kontrak `I<Service>UnitOfWork` (misal `IOrderUnitOfWork`, `IWorkflowUnitOfWork`) dan **Custom Repository Interface** (misal `IUserRepository`, `IWorkflowRequestRepository`). | **Kasus**: Untuk CRUD standar cukup pakai `IRepository<T>` di dalam UnitOfWork. Buat **Custom Repository Interface** di sini hanya jika butuh query spesifik dengan `.Include(...)` bertingkat atau agregasi kompleks (seperti `GetByIdWithDetailsAsync` dan `GetWorkingListForRolesAsync` di `Workflow.Api`). |

### B. Layer `Application/` — Otak Bisnis (*Use-Cases*)
| Subfolder | Tujuan & Fungsi | Kapan & Kasus Apa Dipakai? |
| :--- | :--- | :--- |
| **`Application/DTOs/`** | Menyimpan `record` Request (input dari client) dan Response (output JSON ke client). **Entity database tidak pernah dikembalikan mentah-mentah ke API** agar kolom sensitif (`PasswordHash`, `IsDeleted`, dll) tidak bocor. | **Kasus**: Saat menambah endpoint baru atau mengubah field input/output JSON dari suatu fitur. |
| **`Application/Interfaces/`** | Kontrak interface service bisnis (`IAuthService`, `IProductService`, `IOrderService`, `IWorkflowService`) dan interface abstraksi helper khusus service (misal `ICatalogStatsClient`, `IJwtTokenService`, `IPasswordHasher` di `Identity.Api`). | **Kasus**: Setiap kali membuat service bisnis baru atau butuh memisahkan ketergantungan eksternal agar gampang di-mock di Unit Test. |
| **`Application/Services/`** | Tempat seluruh **logika bisnis sesungguhnya**: validasi input & skema dinamis, kalkulasi (`Quantity * UnitPrice`), state machine approval, security guards (*Anti-Self-Approval*, *Ownership Guard*), manajemen cache (`GetOrCreateAsync` / `RemoveByPrefixAsync`), dan pemanggilan `eventBus.PublishAuditAsync(...)`. | **Kasus**: 80% pekerjaan fitur sehari-hari (aturan bisnis, validasi, approval, kalkulasi, laporan) dikerjakan di folder ini! |

### C. Layer `Infrastructure/` — Urusan Database, HTTP Client, & Kriptografi
| Subfolder | Tujuan & Fungsi | Kapan & Kasus Apa Dipakai? |
| :--- | :--- | :--- |
| **`Infrastructure/Persistence/`** | Menyimpan `DbContext` (konfigurasi Fluent API, index unik, `decimal(18,2)`, global soft-delete filter `!x.IsDeleted`, template komentar 1-DB), implementasi `UnitOfWork` & Custom Repository, serta `DatabaseSeeder`. | **Kasus**: Saat menambah `DbSet<T>`, mengatur panjang kolom / index / relasi foreign key, menambah query EF Core kompleks, atau menambah data awal (*seed*) / skrip *auto-upgrade* database. |
| **`Infrastructure/Clients/`** *(Opsional — ada di `Identity.Api`)* | Menyimpan Typed `HttpClient` untuk memanggil **API di luar microservice ini** (baik microservice internal lain seperti `CatalogStatsHttpClient.cs`, maupun layanan 3rd-party eksternal). | **Kasus**: Buat folder ini di microservice mana pun saat kamu butuh integrasi keluar—misalnya `MidtransPaymentClient.cs`, `WhatsAppNotificationClient.cs`, `SmtpEmailClient.cs`, atau `SapErpClient.cs` (lengkapi dengan timeout & *fallback*!). |
| **`Infrastructure/Security/`** *(Opsional — ada di `Identity.Api`)* | Menyimpan implementasi kriptografi / penerbit token spesifik service (`TokenAndPasswordServices.cs`: generator JWT HS256 & `PBKDF2-SHA256` password hasher). | **Kasus**: Buat folder ini hanya jika microservice punya kebutuhan enkripsi/signing khusus (misal *Digital Signature PDF*, *Webhook HMAC Verification*, atau enkripsi data PII sensitif). |

### D. Layer `Controllers/` & File Root Service
| Subfolder / File | Tujuan & Fungsi | Kapan & Kasus Apa Dipakai? |
| :--- | :--- | :--- |
| **`Controllers/`** | Pintu HTTP REST API yang tipis (*Thin Controller*): menerima route, query/body parameter, memasang atribut `[Authorize]` / `[HasPermission(...)]`, memanggil `Application/Services`, lalu mengembalikan `ToActionResult(...)`. | **Kasus**: Saat menambah atau mengubah endpoint URL, HTTP verb (`GET`/`POST`/`PUT`/`DELETE`), atau hak akses `[HasPermission]` suatu aksi. **Jangan taruh logika bisnis panjang atau query `DbContext` langsung di Controller!** |
| **`Program.cs`** | Composition Root: merakit DI container (`AddSharedJwtSecurity`, `AddSharedInfrastructure`, `AddDbContext`, `AddScoped`), menjalankan `Seeder` + *cache pre-warm*, dan menyalakan pipeline HTTP. | **Kasus**: Setiap kali membuat service bisnis baru (`AddScoped<IXService, XService>()`) atau menambah HTTP client baru. |
| **`appsettings.json`** | Konfigurasi lokal service (Port `Urls`, `DatabaseProvider`, `ConnectionStrings`, `JwtSettings`, `CacheSettings`, `ServiceEndpoints`). | **Kasus**: Saat mengubah connection string SQL Server, beralih dari Multi-DB ke 1-DB Bersama, atau menyalakan Redis (`"Provider": "Redis"`). |
| **`Properties/launchSettings.json`** & **`Dockerfile`** | Profil debug standalone (Swagger di port masing-masing) & resep container Docker. | **Kasus**: Saat ingin debug 1 microservice secara terpisah atau menyesuaikan image Docker saat deploy. |

### Perbandingan Subfolder Antar 4 Microservice Saat Ini
| Microservice | Port & DB | Subfolder di `Infrastructure/` | Kenapa Strukturnya Seperti Itu? |
| :--- | :--- | :--- | :--- |
| **`Identity.Api`** | `:5081` (`IdentityDb`) | `Persistence/`, `Clients/`, `Security/` | Paling lengkap karena ia penerbit JWT (`Security/`) dan agregator stats dari Catalog (`Clients/`). |
| **`Catalog.Api`** | `:5082` (`CatalogDb`) | `Persistence/` | Microservice CRUD murni (Example 1), tidak butuh HTTP client khusus selain `IEventBus`. |
| **`Order.Api`** | `:5083` (`OrderDb`) | `Persistence/` | Microservice CRUD mandiri (Example 2), cukup pakai `GenericRepository` dari `BuildingBlocks`. |
| **`Workflow.Api`** | `:5084` (`WorkflowDb`) | `Persistence/` *(dengan Custom Repository)* | Microservice kompleks 4 tabel (Example 3), butuh `WorkflowRequestRepository` khusus untuk eager-loading stepper & history log. |

---

## 4. `tests/NetStarterPack.Microservices.UnitTests/` — Jaring Pengaman Otomatis

Struktur folder test dipisah berdasarkan area tanggung jawab agar rapi, mudah dicari, dan berjalan paralel di xUnit:

| Subfolder | Tujuan & Fungsi | Kapan & Kasus Apa Dipakai? |
| :--- | :--- | :--- |
| **`Common/TestDoubles/`** | Komponen pengganti (*test doubles*): `FakeCurrentUserService`, `FakePasswordHasher`, `InMemoryEventBus`, `FakeCatalogStatsClient`, `FakeAnnouncementRealtimeNotifier`, dan `FakeHostEnvironment` (auto-cleanup temp dir). | **Kasus**: Saat microservice baru punya interface eksternal (misal `INotificationClient` atau `IEmailSender`) yang perlu di-mock di unit test. |
| **`Common/Factories/`** | `TestDbFactory` (EF Core In-Memory + seeder + `IDisposable` per service) dan `TestCacheFactory` (`DistributedCacheService` mode In-Memory). | **Kasus**: Tambah satu method `Create<NamaService>Async()` di `TestDbFactory` setiap kali membuat microservice baru. |
| **`BuildingBlocks/`** | Unit test untuk komponen inti bersama (`ResultTests`, `DistributedCacheServiceTests`, `PermissionAuthorizationHandlerTests`). | **Kasus**: Saat mengubah logika di `BuildingBlocks.Core`, `BuildingBlocks.Security`, atau `BuildingBlocks.Infrastructure`. |
| **`Services/<ServiceName>/`** | Unit test terfokus per service (`Identity/`, `Catalog/`, `Order/`, `Workflow/`, `Announcement/`). | **Kasus**: Setiap kali menambah fitur, validasi `400`, security guard `403`, atau memperbaiki bug—tambahkan `[Fact]` di class test service terkait. *(Lihat [`docs/10_UNIT_TESTING_GUIDE.md`](10_UNIT_TESTING_GUIDE.md)).* |
| **`CrossService/`** | Uji alur integrasi lintas microservice di RAM (contoh: `DashboardAuditIntegrationTests` untuk `Catalog -> EventBus -> Identity Dashboard`). | **Kasus**: Saat menambah event integrasi atau agregasi data antar-microservice. |

---

## 5. `frontend/src/` — Struktur Frontend React 19 + TypeScript

Di sisi Frontend, folder dibagi berdasarkan tanggung jawab (*Separation of Concerns*) supaya kode UI tidak menumpuk di satu file:

| Subfolder / File | Isi File Saat Ini | Tujuan & Fungsi | Kapan & Kasus Apa Dipakai? |
| :--- | :--- | :--- | :--- |
| **`types/`** | `index.ts` | Definisi seluruh TypeScript `interface` yang mencerminkan kontrak JSON dari Backend (`ApiResult<T>`, `CurrentUser`, `ProductItem`, `OrderItem`, `WorkflowRequestItem`, dll). | **Kasus**: Langkah **pertama** di Frontend setiap kali backend menambah DTO baru—daftarkan interface-nya di sini supaya TypeScript langsung mendeteksi typo properti saat compile! |
| **`services/`** | `api.ts` | Instance `Axios` terpusat (`/api` &rarr; di-proxy Vite ke Gateway `:5080`), *request interceptor* (sisipkan `Bearer token`), *response interceptor* (Auto-Refresh Token Rotation saat `401` + antrean `failedQueue`), dan helper `getErrorMessage()`. | **Kasus**: Saat mau mengubah mekanisme auth header, menambah timeout global, atau memisahkan file API client per modul besar (misal `workflowApi.ts`). |
| **`context/`** | `AuthContext.tsx` | React Context global untuk menyimpan state `user`, daftar `menus` dinamis, fungsi `login()`, `logout(allDevices)`, `hasPermission(code)`, dan `hasRole(role)`. | **Kasus**: Saat butuh state global lintas halaman (misal tambah `NotificationContext.tsx` untuk toast alert global atau `ThemeContext.tsx` untuk dark/light mode). |
| **`utils/`** | `formatters.ts`, `announcementMeta.ts`, `workflowMeta.ts` | Helper murni (*pure functions*) yang dipakai lintas halaman & komponen (format Rupiah `formatCurrency`, waktu relatif `formatRelativeTime`, ukuran file `formatBytes`, style badge pengumuman, & formatter status/field Workflow). | **Kasus**: Taruh semua fungsi helper berulang di sini supaya tidak terjadi duplikasi atau *inverted dependency* (`components/` import dari `pages/`). |
| **`components/`** | `Layout.tsx`, `ProtectedRoute.tsx`, `DynamicIcon.tsx`, `EmojiPickerButton.tsx` | Komponen UI **reusable** yang dipakai di banyak halaman (sidebar dinamis + bell pengumuman + modal logout, penjaga route berbasis permission, pemetaan nama string ikon ke Lucide React, pemilih emoji). | **Kasus**: Saat mau membuat komponen yang dipakai ulang di > 1 halaman (misal `DataTable.tsx`, `StatusBadge.tsx`, `ConfirmDialog.tsx`, atau menambah nama ikon baru di `DynamicIcon.tsx`). |
| **`pages/`** | Dikelompokkan per domain/microservice: `auth/` (`LoginPage`, `ProfilePage`), `dashboard/` (`DashboardPage`, `ReportsPage`, `AuditLogsPage`), `identity/` (`UsersPage`, `RolesPage`, `MenusPage`, `OrganizationPage` + `OrganizationTreeView`, `OrganizationFormModal`), `catalog/` (`ProductsPage`), `orders/` (`OrdersPage`), `workflow/` (`WorkflowCreatePage` + `WorkflowTemplateModal`, `WorkflowWorkingListPage`, `WorkflowTrackingPage`), `announcements/` (`AnnouncementsPage` + `AnnouncementComposerModal`, `AnnouncementDetailPage` + `AnnouncementCommentsSection`), `common/` (`UnderDevelopmentPage`). | Halaman penuh (*page-level view*) yang dipetakan ke 1 URL route di React Router (dengan `React.lazy()` code splitting di `App.tsx`) beserta sub-komponen modal/bagian yang *co-located* di folder domainnya. | **Kasus**: Setiap kali menambah menu/fitur baru yang punya halaman sendiri di sidebar—taruh di subfolder domain yang sesuai. |
| *(Root `src/`)* | `App.tsx`, `main.tsx`, `index.css`, `vite-env.d.ts` | `App.tsx` mengatur peta routing `<Route>` + `React.lazy()` / `<Suspense>` + `<ProtectedRoute>`; `index.css` memuat `@import "tailwindcss";` (Tailwind v4); `vite-env.d.ts` mendeklarasikan tipe `import.meta.env`. | **Kasus**: Edit `App.tsx` setiap kali mendaftarkan path halaman baru, dan edit `vite-env.d.ts` jika menambah variabel environment `.env` baru (`VITE_*`). |

---

## 6. `mobile/` — Struktur Mobile Starterpack (React Native + Expo SDK 58)

Folder `mobile/` berdiri mandiri di dalam monorepo (siap CI/CD & rilis Play Store / App Store terpisah lewat `eas.json` dengan path filter `mobile/**`). Strukturnya memakai pola **Expo Router (file-based)** + **Feature-First** yang sejalan dengan `BuildingBlocks`:

| Subfolder / File | Isi Utama | Tujuan & Fungsi | Kapan & Kasus Apa Dipakai? |
| :--- | :--- | :--- | :--- |
| **`app/(auth)/`** | `login.tsx`, `_layout.tsx` | Halaman Login (React Hook Form + Zod), tombol **Biometric Quick Login**, quick-fill akun dummy (mode `__DEV__`), dan pintasan modal **⚙️ API Gateway URL**. | **Kasus**: Saat menambah alur Register, Forgot Password, atau SSO mobile. |
| **`app/(tabs)/`** | `_layout.tsx`, `index.tsx` (Home/Cluster Dashboard), `approvals.tsx`, `announcements.tsx`, `menus.tsx` (Dynamic Menu Grid), `profile.tsx` | 5 Bottom Tabs utama + **Live Tab Badges** (Approval pending & Info unread via SignalR). | **Kasus**: Saat mengubah menu utama di bottom tab bar atau menambah widget dashboard. |
| **`app/(modules)/`** | `products.tsx`, `orders.tsx`, `workflow-create.tsx`, `workflow-tracking.tsx`, `announcement-detail.tsx`, `audit-logs.tsx`, `reports.tsx`, `users.tsx`, `organization.tsx`, `roles.tsx`, `menus-list.tsx` | Layar penuh (*stack screens*) yang dibuka dari Dynamic Menu Grid atau shortcut Dashboard. | **Kasus**: Setiap kali menambah modul mobile baru — buat 1 file screen di sini lalu petakan path-nya di `app/(tabs)/menus.tsx`. |
| **`src/core/`** | `api/client.ts`, `auth/authStore.ts`, `auth/biometric.ts`, `config/serverConfig.ts`, `realtime/announcementHub.ts`, `storage/secureStorage.ts`, `storage/queryClient.ts`, `theme/tokens.ts`, `theme/themeStore.ts`, `types/index.ts` | Fondasi bersama mobile (analoginya `BuildingBlocks`): Axios single-flight refresh queue, SecureStore token & biometric credential, SignalR manager, TanStack Query persistence, & Light/Dark design tokens. | **Kasus**: Saat menambah kontrak DTO baru (`types/index.ts`), mengubah skema warna (`tokens.ts`), atau menambah SignalR hub baru (`realtime/`). |
| **`src/features/`** | `workflow/` (`DynamicFieldInput.tsx`, `workflowMeta.ts`), `announcements/` (`AnnouncementComposerModal.tsx`) | Komponen dan helper spesifik per domain/microservice agar file screen di `app/` tetap ringkas. | **Kasus**: Saat sebuah modul punya modal form besar, sub-komponen khusus, atau formatter domain sendiri. |
| **`src/shared/`** | `components/` (`UserAvatar.tsx`, `LucideIcon.tsx`, `OfflineBanner.tsx`, `BiometricLockScreen.tsx`, `ServerUrlModal.tsx`), `utils/formatters.ts` | Komponen UI & formatter murni yang dipakai ulang lintas screen. | **Kasus**: Saat menambah komponen reusable baru atau mendaftarkan nama ikon Lucide baru dari database menu. |
| **`app.json` & `eas.json`** | Konfigurasi Expo (deep-link `netstarterpack://`, plugin native) & profil EAS Build (`development`, `preview` APK, `production` AAB/IPA). | Konfigurasi identitas aplikasi mobile & pipeline rilis terpisah. *(Lihat [`docs/09_MOBILE_STARTERPACK_GUIDE.md`](09_MOBILE_STARTERPACK_GUIDE.md)).* | **Kasus**: Saat mengubah nama/ikon app, menambah izin native Android/iOS, atau menyiapkan rilis store. |

---

## 7. File Root Repository & Dokumentasi (`docs/`)

| File / Folder | Tujuan & Fungsi | Kapan Dipakai? |
| :--- | :--- | :--- |
| **`NetStarterPack.Microservices.sln`** | Solution Visual Studio yang menyatukan semua project (Startup default: `Gateway.Api`). | Buka file ini di Visual Studio lalu tekan `F5` untuk menjalankan seluruh ekosistem. |
| **`start-dev.ps1` & `run-app.bat`** | Script sekali klik untuk menyalakan seluruh microservice + Web Frontend tanpa perlu membuka Visual Studio. | Saat ingin demo cepat atau testing web lewat terminal. |
| **`start-mobile-dev.ps1` & `run-mobile.bat`** | Script sekali klik untuk deteksi otomatis IPv4 LAN PC, tulis `mobile/.env`, nyalakan `Gateway.Api` mode LAN (`0.0.0.0:5080`), dan tampilkan QR Code **Expo Go**. | Saat testing aplikasi mobile langsung di HP fisik Android/iOS (mendukung opsi `-Tunnel` & `-SkipBackend`). |
| **`docker-compose.yml`** | Orkestrasi seluruh stack (SQL Server + Redis + Microservices + Gateway + Frontend Nginx) dalam container Docker. | Saat ingin menjalankan environment mirip production dengan Redis aktif dan SQL Server terisolasi. |
| **`publish-iis.ps1`** | Script PowerShell untuk publish selektif (`-Target All`, `Gateway`, `Identity`, `Catalog`, `Order`, `Workflow`, `Frontend`) ke folder `publish-iis/` lengkap dengan `web.config` IIS. | Saat deploy ke Windows Server IIS. *(Lihat [`docs/11_IIS_DEPLOYMENT_GUIDE.md`](11_IIS_DEPLOYMENT_GUIDE.md)).* |
| **`.gitignore`** | Mencegah folder build (`bin/`, `obj/`, `node_modules/`, `publish-iis/`, `mobile/.expo/`, `mobile/android/`, `mobile/ios/`), keystore, `.env`, database lokal (`*.db`), dan file konteks AI lokal ikut ter-push ke Git. | Cek file ini jika suatu saat menambah folder output sementara baru. |
| **`docs/`** | Kumpulan dokumentasi teknis berurutan (`01` s/d `13`) dari arsitektur, RBAC, caching, customization A–Z, workflow advanced, mobile starterpack, unit testing, IIS deploy, hingga glosarium istilah. | Rujukan utama onboarding developer baru atau saat mau menambah modul/microservice baru. |
