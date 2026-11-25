# Glosarium Arsitektur Microservices Project Ini (`13_GLOSSARY.md`)

Dokumen ini adalah kamus istilah yang **100% merujuk pada komponen, pola arsitektur, dan class yang benar-benar dipakai di dalam kode NetStarterPack Microservices saat ini** (bukan teori umum dari luar yang tidak ada di project ini).

Setiap istilah dijelaskan artinya secara santai, lalu langsung ditunjukkan **"Di project ini dipakai di mana & bagaimana cara kerjanya"**.

---

## 1. Arsitektur Microservices, API Gateway, & Komunikasi Antar-Service

### Microservices (Level Makro) vs Compact Onion Architecture (Level Mikro)
Perpaduan dua skala arsitektur di project ini:
- **Microservices (Skala Makro / Antar-Aplikasi)**: Memecah backend menjadi beberapa aplikasi mandiri yang memiliki proses, port, dan database sendiri-sendiri (`Gateway.Api` di `:5080`, `Identity.Api` di `:5081`, dan `Catalog.Api` di `:5082`).
- **Compact Onion Architecture (Skala Mikro / Internal Tiap Service)**: Di dalam masing-masing microservice (`Identity.Api` dan `Catalog.Api`), struktur kodenya tetap dibagi menjadi 4 folder layer Onion (`Domain/`, `Application/`, `Infrastructure/`, `Controllers/`) dengan arah ketergantungan ke dalam.

### Shared Kernel (`src/BuildingBlocks/`)
Kumpulan class library bersama yang dipakai oleh seluruh microservice agar kita tidak pernah menulis ulang (copy-paste) kodingan JWT, `[HasPermission]`, Redis Cache, Repository, atau Exception Handler saat menambah microservice baru.
- **Di project ini dibagi menjadi 3 project**:
  1. **`BuildingBlocks.Core`**: *Zero NuGet Dependency* — berisi `BaseEntity`, `Result<T>`, `Permissions`, `RoleNames`, `CacheKeys`, kontrak `AuditLogIntegrationEvent`, `CatalogStatsDto`, serta interface `IRepository<T>`, `ICacheService`, `ICurrentUserService`, dan `IEventBus`.
  2. **`BuildingBlocks.Security`**: Berisi `JwtSettings`, `CurrentUserService`, `[HasPermission]`, `PermissionAuthorizationHandler`, dan extension `AddSharedJwtSecurity()`.
  3. **`BuildingBlocks.Infrastructure`**: Berisi `DistributedCacheService` (L1/L2 Cache), `HttpEventBus`, `GenericRepository<T, TContext>`, `BaseApiController`, `CorrelationIdMiddleware`, `GlobalExceptionHandler`, dan extension `AddSharedInfrastructure()`.

### YARP (Yet Another Reverse Proxy) API Gateway
Library reverse proxy resmi buatan tim Microsoft .NET yang dipakai di `Gateway.Api (:5080)` sebagai pintu gerbang tunggal untuk Frontend React (`:5173`).
- **Di project ini digunakan pada**: `src/ApiGateway/Gateway.Api/Program.cs` dan `appsettings.json` (section `"ReverseProxy"`).
  - Request `/api/auth/*`, `/api/users/*`, `/api/roles/*`, `/api/menus/*`, `/api/dashboard/*` diteruskan ke `identity-cluster` (`http://localhost:5081`).
  - Request `/api/products/*` diteruskan ke `catalog-cluster` (`http://localhost:5082`).

### Integration Event & `IEventBus` (`HttpEventBus`)
Cara satu microservice memberi tahu microservice lain bahwa baru saja terjadi suatu peristiwa bisnis, tanpa melakukan koneksi langsung ke database service tujuan.
- **Di project ini digunakan pada**:
  - Kontrak: `AuditLogIntegrationEvent` & `IEventBus` di `src/BuildingBlocks/BuildingBlocks.Core/`.
  - Pengirim: `ProductService.cs` di `Catalog.Api` memanggil `await eventBus.PublishAuditAsync(...)` setiap kali ada produk yang ditambah, diubah, atau dihapus.
  - Mesin Pengirim: `HttpEventBus.cs` di `BuildingBlocks.Infrastructure/Messaging/` yang mengirim HTTP POST asinkron ke `Identity.Api` (`/api/internal/events/audit-log`).
  - Penerima: `InternalEventsController.cs` di `Identity.Api` yang menyimpan log tersebut ke tabel `AuditLogs` di `NetStarterPack_IdentityDb` dan me-reset cache Dashboard.

### Graceful Degradation / Resilient Fallback (Anti-*Cascading Failure*)
Prinsip ketahanan sistem (*reliability*) di mana jika satu microservice sedang sibuk, lambat, atau mati, microservice lainnya **tetap harus berjalan normal dan tidak boleh ikut crash**.
- **Di project ini digunakan pada 2 tempat**:
  1. **`HttpEventBus.cs`**: Pengiriman `AuditLogIntegrationEvent` dari `Catalog.Api` ke `Identity.Api` dibatasi timeout 2 detik dan dibungkus `try-catch`. Kalau `Identity.Api` sedang mati, penyimpanan produk di `Catalog.Api` tetap berhasil (`201 Created`).
  2. **`CatalogStatsHttpClient.cs` (`Identity.Api/Infrastructure/Clients/`)**: Saat `DashboardService` di `Identity.Api` meminta statistik produk ke `Catalog.Api`, jika `Catalog.Api` sedang offline, client otomatis mengembalikan nilai fallback `CatalogStatsDto(0, 0m, 0, 0)` sehingga halaman Dashboard tetap terbuka normal tanpa error `500`.

### Distributed Tracing (`X-Correlation-Id` & `CorrelationIdMiddleware`)
Mekanisme pelacakan log lintas microservice menggunakan satu ID unik yang menempel pada request dari awal masuk API Gateway hingga ke seluruh microservice di belakangnya.
- **Di project ini digunakan pada**: `CorrelationIdMiddleware` di `src/BuildingBlocks/BuildingBlocks.Infrastructure/Middleware/SharedMiddleware.cs`.
  - Saat request masuk ke `Gateway.Api`, middleware membuat header `X-Correlation-Id` (jika belum ada).
  - YARP meneruskan header itu ke `Identity.Api` atau `Catalog.Api`.
  - `CurrentUserService.CorrelationId` membaca ID tersebut dan `HttpEventBus` ikut meneruskannya saat mengirim event ke service lain.

### Unified OpenAPI Spec Merger (`/openapi/v1.json` di Gateway)
Fitur di `Gateway.Api` yang menggabungkan dokumentasi Swagger/OpenAPI dari seluruh microservice menjadi satu halaman dokumentasi terpadu.
- **Di project ini digunakan pada**: `src/ApiGateway/Gateway.Api/Program.cs` (langkah ke-5). `Gateway.Api` mengambil `/openapi/v1.json` dari `Identity.Api (:5081)` dan `Catalog.Api (:5082)`, menggabungkan semua endpoint publiknya (sembari menyembunyikan `/api/internal/*`), lalu menampilkannya di **`http://localhost:5080/swagger`** dan **`http://localhost:5080/scalar/v1`**.

### Gateway Rate Limiting (`FixedWindowLimiter`)
Pembatas jumlah request di pintu API Gateway untuk mencegah spam, brute-force, atau DDoS sebelum menyentuh microservice di belakangnya.
- **Di project ini digunakan pada**: `src/ApiGateway/Gateway.Api/Program.cs` (langkah ke-2). Membatasi maksimal `300 request / menit` per alamat IP dan mengembalikan JSON `Result.Failure(..., 429)` jika terlampaui.

### F5 Development Auto-Orchestrator
Fitur produktivitas developer di `Gateway.Api` yang otomatis menyalakan seluruh ekosistem microservice dan Frontend React cukup dengan sekali menekan tombol Start (`F5`).
- **Di project ini digunakan pada**: `src/ApiGateway/Gateway.Api/Program.cs` (langkah ke-4). Saat `Gateway.Api` dijalankan di mode `Development`, ia mengecek port `5081`, `5082`, dan `5173` lewat `TcpClient`. Jika belum aktif, `Gateway.Api` otomatis menyalakan `Identity.Api`, `Catalog.Api`, dan `npm run dev` (React), lalu mematikan semua child process tersebut saat debugging dihentikan.

---

## 2. Arsitektur Internal Tiap Service (Compact Onion & Application Layer)

### Direct Application Service Pattern (Tanpa MediatR)
Pola menaruh logika bisnis langsung di dalam class `*Service` yang dipanggil oleh Controller lewat interface-nya.
- **Di project ini digunakan pada**:
  - `Identity.Api/Application/Services/`: `AuthService`, `UserService`, `RoleService`, `MenuService`, `DashboardService`.
  - `Catalog.Api/Application/Services/`: `ProductService`.
- **Kenapa dipakai**: Supaya saat kamu menekan `F12` (*Go to Implementation*) dari Controller di Visual Studio, kamu langsung melompat ke kode bisnisnya tanpa terhalang puluhan file Command/Handler.

### Result Pattern (`Result`, `Result<T>`, & `ToActionResult`)
Pola membungkus semua hasil kembalian dari Application Service ke dalam objek standar berisi `Succeeded`, `Message`, `Data`, `Errors`, dan `StatusCode` (tanpa melempar `Exception` untuk validasi bisnis).
- **Di project ini digunakan pada**:
  - Definisi class: `src/BuildingBlocks/BuildingBlocks.Core/Common/Result.cs`.
  - Helper Controller: `BaseApiController` di `src/BuildingBlocks/BuildingBlocks.Infrastructure/Controllers/BaseApiController.cs` yang mengubah `Result<T>` menjadi HTTP JSON response yang seragam di seluruh microservice.

### DTO (Data Transfer Object) berbasis C# `record`
Objek ringkas yang khusus dipakai untuk format payload Request & Response API agar struktur tabel asli (`Entity`) di database microservice tidak terekspos langsung ke luar.
- **Di project ini digunakan pada**: `Identity.Api/Application/DTOs/IdentityDtos.cs` dan `Catalog.Api/Application/DTOs/ProductDtos.cs`.

---

## 3. Database, Polyglot Persistence, Repository, & Transaksi (`Infrastructure`)

### Database-per-Service (Isolasi Database Penuh)
Aturan utama Microservices di mana setiap microservice wajib memiliki databasenya sendiri dan tidak boleh mengakses tabel database milik microservice lain secara langsung lewat query SQL `JOIN`.
- **Di project ini digunakan pada**:
  - **`Identity.Api (:5081)`** menggunakan `IdentityDbContext` $\rightarrow$ database **`NetStarterPack_IdentityDb`** (mengisolasi beban tabel autentikasi, user, role, menu, dan audit log).
  - **`Catalog.Api (:5082)`** menggunakan `CatalogDbContext` $\rightarrow$ database **`NetStarterPack_CatalogDb`** (hanya berisi tabel `Products`, sama sekali tidak punya tabel `Users` atau `Roles`).

### Polyglot Persistence (Beda Jenis Mesin Database Antar-Microservice)
Kemampuan di arsitektur Microservices di mana tiap microservice **bukan cuma beda nama database, tapi bahkan bisa memakai jenis mesin database yang berbeda-beda** pada saat yang bersamaan sesuai kebutuhan datanya.
- **Di project ini digunakan pada**: Konfigurasi `"DatabaseProvider"` (`"SqlServer"`, `"Sqlite"`, atau `"InMemory"`) yang berdiri sendiri-sendiri di `Identity.Api/appsettings.json` dan `Catalog.Api/appsettings.json`.
- **Cara kerjanya**:
  - Karena tidak ada *cross-database SQL JOIN*, kamu bisa membiarkan `Identity.Api` berjalan di atas **Microsoft SQL Server** (`"DatabaseProvider": "SqlServer"`), sementara `Catalog.Api` kamu jalankan di atas **SQLite** (`"DatabaseProvider": "Sqlite"`, file `NetStarterPack_Catalog.db`) atau database lain (seperti PostgreSQL / NoSQL).
  - Keduanya tetap berkomunikasi dengan mulus lewat HTTP JSON dan `IEventBus` tanpa peduli service sebelah memakai mesin database apa.

### `BaseEntity` (Standar Kolom Auditing & ID)
Class induk di `BuildingBlocks.Core/Common/BaseEntity.cs` yang diwarisi oleh seluruh tabel di semua microservice (`Id`, `CreatedAt`, `CreatedBy`, `UpdatedAt`, `UpdatedBy`, `IsDeleted`).

### Soft Delete (`IsDeleted`) & EF Core Global Query Filter
Mekanisme hapus data secara aman: saat `Remove(entity)` dipanggil di `GenericRepository<T, TContext>`, baris data tidak di-`DELETE` permanen dari database, melainkan hanya di-update `IsDeleted = true`.
Karena di `IdentityDbContext` dan `CatalogDbContext` setiap tabel dipasangi `entity.HasQueryFilter(x => !x.IsDeleted)`, maka setiap query `SELECT` otomatis mengabaikan data yang sudah dihapus.

### `GenericRepository<T, TContext>` Lintas Microservice
Implementasi repository EF Core generik di `BuildingBlocks.Infrastructure/Persistence/GenericRepository.cs` yang bisa langsung dipakai oleh `DbContext` milik microservice mana pun (`IdentityDbContext`, `CatalogDbContext`, maupun microservice baru).

### Unit of Work per Microservice (`IIdentityUnitOfWork` & `ICatalogUnitOfWork`)
Pengelola transaksi atomik di masing-masing database microservice:
- `IdentityUnitOfWork` membungkus `IdentityDbContext` (`NetStarterPack_IdentityDb`).
- `CatalogUnitOfWork` membungkus `CatalogDbContext` (`NetStarterPack_CatalogDb`).

---

## 4. Keamanan Zero-Trust, JWT, & RBAC (`BuildingBlocks.Security`)

### Zero-Trust Stateless JWT Verification (`AddSharedJwtSecurity`)
Arsitektur keamanan di mana setiap microservice memvalidasi keaslian token JWT dan mengecek izin `[HasPermission(...)]` secara mandiri di memori (0 ms) tanpa mempercayai mentah-mentah request dari jaringan dan tanpa perlu koneksi ke database `Identity.Api`.
- **Di project ini digunakan pada**: `src/BuildingBlocks/BuildingBlocks.Security/PermissionAuthorization.cs`.

### Service-to-Service Auth (`X-Internal-Api-Key`)
Pengamanan komunikasi internal antar-microservice (misalnya saat `HttpEventBus` mengirim event audit ke `InternalEventsController` di `Identity.Api`). Menggunakan header `X-Internal-Api-Key` yang dicocokkan dengan `JwtSettings:InternalApiKey`.

### RBAC (Role-Based) + Granular Permission
Pemisahan antara **Role** (`RoleNames.cs`: `SuperAdmin`, `Admin`, `Manager`, `Staff`, `Viewer`) dan **Granular Permission** (`Permissions.cs`: `Products.View`, `Products.Create`, `Users.Edit`, dll.) yang ditaruh di `BuildingBlocks.Core/Constants/` agar dikenali oleh semua microservice. Role **`SuperAdmin`** otomatis lolos semua pengecekan `PermissionAuthorizationHandler` di seluruh microservice.

### Refresh Token Rotation & Password Hashing (`PBKDF2-SHA256`)
- **`RefreshTokenAsync` (`Identity.Api`)**: Setiap kali token diperbarui, refresh token lama dicabut (`RevokedAt`) dan diganti token baru. Mendukung Logout browser saat ini (`/api/auth/logout`) maupun Logout dari semua perangkat (`/api/auth/logout-all`).
- **`PasswordHasher` (`Identity.Api`)**: Hashing password standar `PBKDF2-SHA256` (100.000 iterasi + 16-byte random salt + `FixedTimeEquals`).

---

## 5. Caching, Frontend React, & Unit Testing

### Hybrid L1 (`IMemoryCache`) + L2 (`IDistributedCache` / Shared Redis)
Arsitektur cache 2 tingkat di `BuildingBlocks.Infrastructure/Caching/DistributedCacheService.cs`:
- **L1 Cache**: Menyimpan objek C# di RAM lokal microservice (`< 0.01ms`).
- **L2 Cache**: Menyimpan JSON di server Redis terpusat ketika `"CacheSettings:Provider"` diatur ke `"Redis"`, lengkap dengan `try-catch` *safe fallback* dan pelacak key `_trackedKeys` untuk `RemoveByPrefixAsync`.

### Idempotency Middleware & `Idempotency-Key` (`BuildingBlocks.Infrastructure`)
Mekanisme anti *double-submit* di `BuildingBlocks.Infrastructure/Middleware/IdempotencyMiddleware.cs` menggunakan atribut `[Idempotent]` dan Hybrid Cache L1/L2. Saat user klik tombol Submit/Approve dua kali pada jaringan lambat, request pertama diproses dan respons `2xx`-nya disimpan sementara di cache berdasarkan `Idempotency-Key`. Request duplikat dengan key dan payload sama langsung menerima replay respons lama (`X-Idempotent-Replayed: true`), request paralel yang masih berjalan ditahan dengan `409 Conflict`, dan key sama dengan payload berbeda ditolak dengan `422 Unprocessable Entity`.

### Unified Lookup Table (`MasterData.Api :5086`)
Pola 1 tabel master referensi bersama (`MasterLookups` di `NetStarterPack_MasterDataDb`) untuk menampung berbagai grup dropdown lintas microservice (`PRODUCT_CATEGORY`, `UNIT_OF_MEASURE`, `PAYMENT_METHOD`, `PRIORITY_LEVEL`, `DOCUMENT_TYPE`) lengkap dengan dukungan parent-child cascading, `SortOrder`, `IsActive`, `IsSystem`, dan `MetadataJson`. Microservice lain cukup menyimpan nilai `Code`/`Name` tanpa Foreign Key lintas database.

### HTTP Resilience (`Polly v8` / `Microsoft.Extensions.Http.Resilience`)
Pipeline ketahanan komunikasi HTTP antar-microservice di `BuildingBlocks.Infrastructure/Resilience/HttpResilienceExtensions.cs` yang menggabungkan **Total Timeout → Exponential Backoff Retry (+ Jitter) → Circuit Breaker → Per-Attempt Timeout**. Dipasang otomatis pada `HttpEventBus`, `CatalogStatsHttpClient`, dan `GatewayAggregator` supaya gangguan jaringan singkat otomatis di-retry, sedangkan service yang sedang down berkepanjangan langsung *fail-fast* lewat Circuit Breaker tanpa bikin seluruh sistem ikut hang.

### API Versioning (`Asp.Versioning.Mvc`)
Mekanisme penomoran versi kontrak REST API di `BaseApiController` dan `BuildingBlocks.Infrastructure` yang mendukung path kanonis **`/api/v1/...`**, header `X-Api-Version`, dan query `?api-version=1.0`, sambil tetap mempertahankan alias `/api/...` (*backward-compatible* ke v1.0) serta melaporkan versi aktif via header `api-supported-versions`.

### Axios Interceptor & Antrean `failedQueue` (`frontend/src/services/api.ts`)
Menempelkan JWT secara otomatis ke setiap request yang menuju API Gateway (`:5080`), serta menahan request paralel di `failedQueue` saat terjadi `401` untuk melakukan *Refresh Token Rotation* otomatis ke `/api/auth/refresh`.

### `InMemoryEventBus`, `FakeCurrentUserService`, & `TestDbFactory` (`tests/NetStarterPack.Microservices.UnitTests/Common/`)
Komponen *test double* dan factory di `tests/NetStarterPack.Microservices.UnitTests/Common/` (`TestDoubles/` & `Factories/`) untuk menguji logika bisnis di masing-masing microservice maupun alur lintas service secara cepat di RAM tanpa memerlukan SQL Server, Redis, atau koneksi HTTP nyata.

---

## 6. Containerization & Deployment (`Docker` & `Docker Compose`)

### Multi-Stage `Dockerfile` per Service
Teknik membungkus masing-masing aplikasi menjadi image container yang ramping dengan memisahkan tahap *Build/Compile* (memakai image SDK `.NET 10` atau `Node 22`) dan tahap *Runtime* (hanya berisi hasil `dotnet publish` di atas `aspnet:10.0` atau file statis React di atas `nginx:alpine`).
- **Di project ini digunakan pada**:
  - `src/ApiGateway/Gateway.Api/Dockerfile` (Port `5080`)
  - `src/Services/Identity/Identity.Api/Dockerfile` (Port `5081`)
  - `src/Services/Catalog/Catalog.Api/Dockerfile` (Port `5082`)
  - `frontend/Dockerfile` & `frontend/nginx.conf` (Port `5173:80`, mem-proxy `/api/` ke `http://gateway-api:5080/api/`)

### `docker-compose.yml` & Internal Bridge Network (`nsp-mesh`)
Orkestrasi container terpusat di root project untuk menyalakan seluruh infrastruktur dan microservice sekaligus dalam satu jaringan virtual terisolasi (`nsp-mesh`).
- **Di project ini digunakan pada**: `docker-compose.yml` di folder root yang menyalakan **6 container** sekaligus:
  1. `sqlserver` (`mcr.microsoft.com/mssql/server:2022-latest` di port `1433`, dengan persistent volume `sqlserver_data`)
  2. `redis` (`redis:7-alpine` di port `6379` sebagai Shared L2 Cache)
  3. `identity-api` (otomatis di-override lewat environment variable agar terhubung ke container `sqlserver` database `NetStarterPack_IdentityDb` dan container `redis`)
  4. `catalog-api` (terhubung ke container `sqlserver` database `NetStarterPack_CatalogDb` dan container `redis`)
  5. `gateway-api` (meneruskan traffic YARP ke `http://identity-api:5081` dan `http://catalog-api:5082` di dalam jaringan Docker)
  6. `frontend` (React 19 SPA di atas Nginx pada port `5173`)
- **Perintah utama**:
  - Nyalakan semua container: `docker compose up -d --build`
  - Cek log real-time: `docker compose logs -f`
  - Matikan semua container: `docker compose down`

---

## 7. Ekosistem Mobile Starterpack (`React Native` & `Expo`)

### Expo Go vs Development Build
- **Expo Go**: Aplikasi sandbox gratis dari Play Store / App Store yang langsung menjalankan kode React Native + modul bawaan Expo hanya dengan scan QR Code dari laptop — tanpa perlu install Android Studio atau compile Gradle.
- **Development Build**: Versi *custom* dari Expo Go yang di-build khusus untuk project kita (via cloud **EAS Build** atau lokal) ketika suatu saat butuh modul native eksternal di luar bawaan Expo Go (misalnya Remote Push Notification FCM).

### CNG (*Continuous Native Generation*) & EAS Build (`mobile/eas.json`)
Pendekatan modern Expo di mana folder native berat (`mobile/android/` & `mobile/ios/`) tidak perlu di-commit ke Git (masuk `.gitignore`), melainkan di-generate otomatis dari `app.json` saat proses build rilis di cloud **EAS Build** (`development`, `preview` APK, `production` AAB/IPA). Memungkinkan CI/CD mobile di monorepo berjalan terpisah total dari backend & web lewat filter path `mobile/**` dan tag `mobile-v*`.

### `expo-secure-store` (Android Keystore / iOS Keychain)
Penyimpanan terenkripsi berbasis hardware/OS di perangkat mobile. Dipakai di `mobile/src/core/storage/secureStorage.ts` untuk menyimpan Access Token, Refresh Token, dan kredensial Biometric Quick Login — menggantikan `localStorage` versi web yang tidak aman jika ditiru memakai `AsyncStorage` biasa.

### Biometric 2-in-1 (*App Lock* & *Quick Login*)
Dua mode keamanan biometrik (`expo-local-authentication`) yang berjalan bersamaan di `mobile/src/core/auth/authStore.ts`:
- **App Lock (`BiometricLockScreen`)**: Saat aplikasi ditutup lalu dibuka kembali sementara sesi masih aktif, user diminta verifikasi Sidik Jari / Face ID.
- **Quick Login**: Setelah user klik Logout biasa, tombol *"Masuk dengan Sidik Jari"* tetap muncul di layar Login dan mengambil kredensial terenkripsi dari Keystore setelah verifikasi sensor lolos (dihapus bersih saat *Logout Semua Perangkat* atau toggle dimatikan).

### Single-Flight Refresh Token Queue (`mobile/src/core/api/client.ts`)
Mekanisme antrean di interceptor Axios agar saat beberapa request paralel terkena HTTP `401` secara bersamaan (misalnya ketika aplikasi baru aktif dari *background*), pemanggilan `/api/auth/refresh` hanya terjadi **1 kali** sementara request lainnya menunggu token baru — mencegah sesi ter-revoke akibat *Refresh Token Rotation*.

### *Stale-While-Revalidate* & Offline Cache Persistence (`TanStack Query`)
Strategi di `mobile/src/core/storage/queryClient.ts` yang menyimpan hasil response API di `AsyncStorage` (hingga 24 jam) sehingga aplikasi langsung menampilkan data terakhir secara instan walau sinyal sedang offline/lemot, lalu otomatis menyegarkan data di background begitu koneksi kembali online (didampingi indikator `OfflineBanner`).

