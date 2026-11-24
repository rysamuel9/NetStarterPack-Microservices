# Tech Stack & Alasan Pemilihan Teknologi

Dokumen ini merangkum seluruh bahasa, framework, library (NuGet & npm), database, dan infrastruktur yang dipakai di **NetStarterPack Microservices**, beserta versi aktual dari codebase dan alasan singkat kenapa masing-masing dipilih.

---

## 1. Ringkasan Cepat

| Layer | Teknologi Utama | Versi di Repo | Peran |
| :--- | :--- | :--- | :--- |
| **Runtime & Bahasa Backend** | .NET / C# (`ASP.NET Core`) | `.NET 10.0 LTS` | Runtime utama API Gateway & 5 Microservice |
| **API Gateway** | YARP (`Yarp.ReverseProxy`) | `2.3.0` | Reverse proxy tunggal (`:5080`), Rate Limiter, Unified OpenAPI |
| **ORM & Database** | Entity Framework Core + SQL Server | `EF Core 10.0.*` / `SQL Server 2022` | Akses data *Database-per-Service* (support juga `SQLite` & `InMemory`) |
| **Caching** | Hybrid L1 `IMemoryCache` + L2 Redis | `StackExchangeRedis 10.0.*` / `Redis 7` | Cache-Aside (`GetOrCreateAsync`) + `RemoveByPrefixAsync` |
| **Realtime** | ASP.NET Core SignalR + `@microsoft/signalr` | Built-in `.NET 10` / `^11.0.0` | Push realtime notifikasi, like, & komentar di `Announcement.Api` |
| **Auth & Security** | Zero-Trust JWT Bearer + PBKDF2-SHA256 | `JwtBearer 10.0.*` | Validasi token mandiri di tiap service + `[HasPermission]` RBAC |
| **API Docs** | Native OpenAPI + Scalar UI + Swagger UI | `OpenApi 10.0.*` / `Scalar 2.*` | Dokumentasi gabungan lintas service di `/scalar/v1` & `/swagger` |
| **Frontend SPA** | React + TypeScript + Vite + Tailwind CSS | `React 19` / `TS 5.7` / `Vite 8.3` / `TW v4.3` | Web SPA modern dengan route-level `React.lazy()` code splitting |
| **Mobile App** | React Native + Expo + Expo Router + TS | `Expo SDK 58` / `RN 0.88` / `React 19.3` / `TS 6.0` | Aplikasi Mobile Android/iOS (*Expo Go-ready*) + Biometric, SecureStore, Offline Cache, & SignalR |
| **Unit Testing** | xUnit + EF Core InMemory + Coverlet | `xUnit 2.9.3` / `Test.Sdk 17.14.1` | 43 unit test paralel di RAM tanpa butuh SQL Server/Redis |
| **Deployment** | Windows Server IIS / Docker / EAS Build | `IIS 10+` / `Docker` / `EAS CLI` | Deploy selektif via `publish-iis.ps1`, `docker-compose.yml`, & build mobile independen via `mobile/eas.json` |

---

## 2. Backend Stack & NuGet Packages (`.NET 10.0 LTS`)

### A. Shared Kernel (`src/BuildingBlocks/`)
| Project | Package NuGet | Versi | Fungsi |
| :--- | :--- | :--- | :--- |
| **`BuildingBlocks.Core`** | *(ZERO external NuGet)* | — | Inti bersama yang murni POCO/interface: `BaseEntity`, `Result<T>`, `PagedResult<T>`, `Permissions`, `RoleNames`, `CacheKeys`, kontrak `AuditLogIntegrationEvent`, `ICacheService`, `IEventBus`, `IRepository<T>`. |
| **`BuildingBlocks.Security`** | `Microsoft.AspNetCore.Authentication.JwtBearer` | `10.0.*` | Validasi JWT Bearer (termasuk token query `?access_token=` untuk WebSocket/SignalR), atribut `[HasPermission]`, `PermissionAuthorizationHandler`, `CurrentUserService`. |
| **`BuildingBlocks.Infrastructure`** | `Microsoft.AspNetCore.OpenApi` | `10.0.*` | Generator dokumen OpenAPI bawaan ASP.NET Core 10. |
| | `Microsoft.EntityFrameworkCore` | `10.0.*` | Fondasi `GenericRepository<T, TContext>` dengan soft-delete. |
| | `Microsoft.Extensions.Caching.StackExchangeRedis` | `10.0.*` | L2 Distributed Cache Redis di dalam `DistributedCacheService` (dengan safe fallback ke L1). |
| | `Scalar.AspNetCore` | `2.*` | UI dokumentasi API interaktif modern (`/scalar/v1`). |

### B. API Gateway (`src/ApiGateway/Gateway.Api/`)
| Package NuGet | Versi | Fungsi |
| :--- | :--- | :--- |
| `Yarp.ReverseProxy` | `2.3.0` | Reverse proxy resmi Microsoft berbasis konfigurasi `ReverseProxy` di `appsettings.json` (mendukung HTTP, WebSocket/SignalR, dan hot-reload config). |
| `Scalar.AspNetCore` | `2.*` | Menyajikan Unified API Docs gabungan dari seluruh microservice di port `5080`. |
| *(Built-in ASP.NET Core 10)* | `10.0` | `RateLimiter` (`300 req/menit`), CORS terpusat, `X-Correlation-Id`, Aggregated `/api/health`, & F5 Development Auto-Orchestrator. |

### C. Business Microservices (`Identity`, `Catalog`, `Order`, `Workflow`, `Announcement`)
Setiap microservice menerapkan pola **Compact Onion** (`Domain/`, `Application/`, `Infrastructure/`, `Controllers/`) dengan package standar:

| Package NuGet | Versi | Fungsi |
| :--- | :--- | :--- |
| `Microsoft.EntityFrameworkCore.SqlServer` | `10.0.*` | Provider database utama (production & dev SQL Server, lengkap dengan `EnableRetryOnFailure`). |
| `Microsoft.EntityFrameworkCore.Sqlite` | `10.0.*` | Provider alternatif ringan berbasis file `.db` jika tidak ingin menyalakan SQL Server. |
| `Microsoft.EntityFrameworkCore.InMemory` | `10.0.*` | Provider memori RAM untuk unit test terisolasi per service. |
| *(Built-in ASP.NET Core SignalR)* | `10.0` | Khusus `Announcement.Api`: `AnnouncementHub` (`/hubs/announcements`) untuk push realtime pengumuman, like, komentar, & toggle komentar. |

---

## 3. Frontend Stack & npm Packages (`frontend/package.json`)

### Runtime Dependencies
| Package | Versi | Fungsi |
| :--- | :--- | :--- |
| `react` & `react-dom` | `^19.0.0` | Library UI utama + `React.lazy()` & `<Suspense>` untuk route-level code splitting. |
| `react-router-dom` | `^7.5.0` | Routing SPA client-side + `<ProtectedRoute>` berbasis permission. |
| `axios` | `^1.8.4` | HTTP client dengan interceptor JWT otomatis & antrean `failedQueue` untuk *Refresh Token Rotation* saat `401`. |
| `@microsoft/signalr` | `^11.0.0` | Client realtime WebSocket/SSE untuk feed & diskusi `Announcement.Api` (`services/announcementHub.ts`). |
| `lucide-react` | `^0.468.0` | Set ikon SVG ringan + pemetaan dinamis dari database menu lewat `components/DynamicIcon.tsx`. |

### Build & Styling Tooling (`devDependencies`)
| Package | Versi | Fungsi |
| :--- | :--- | :--- |
| `vite` & `@vitejs/plugin-react` | `^8.3.8` / `^6.3.0` | Dev server super cepat + bundler produksi (Rolldown/Vite 8) dengan chunk splitting per halaman. |
| `typescript` | `~5.7.2` | Type safety penuh dari kontrak DTO backend (`types/index.ts`) sampai komponen React. |
| `tailwindcss` & `@tailwindcss/vite` | `^4.3.5` | Styling utility-first Tailwind CSS v4 (zero config `tailwind.config.js`, langsung `@import "tailwindcss";`). |

---

## 4. Mobile Stack & npm Packages (`mobile/package.json`)

Aplikasi mobile di folder `mobile/` memakai **Expo SDK 58 (New Architecture)** yang 100% kompatibel dengan **Expo Go** (bisa langsung dites di HP fisik tanpa Android Studio) sekaligus siap di-build ke `.apk` / `.aab` / `.ipa` lewat **EAS Build**.

| Package | Versi | Fungsi |
| :--- | :--- | :--- |
| `expo` & `react-native` & `react` | `~58.0.26` / `0.88.1` / `19.3.0` | Runtime React Native New Architecture (Fabric + TurboModules) dengan TypeScript `~6.0.3`. |
| `expo-router` & `expo-linking` | `~58.0.32` / `~58.0.17` | File-based routing (`mobile/app/`) + dukungan *deep linking* (`netstarterpack://`). |
| `@tanstack/react-query` + persister | `^5.108.4` | *Server state*, caching *stale-while-revalidate* (cache offline 24 jam via `AsyncStorage`), & *pull-to-refresh*. |
| `zustand` | `^5.1.0` | *Client state* ringan untuk Auth session, RBAC (`hasPermission`), Dynamic Menus, & Light/Dark Theme. |
| `axios` & `@microsoft/signalr` | `^1.21.1` / `^11.0.0` | HTTP client dengan *Single-Flight Refresh Token Queue* + koneksi realtime WebSocket ke `/hubs/announcements`. |
| `expo-secure-store` | `~58.0.3` | Penyimpanan token JWT, Refresh Token, & kredensial biometrik terenkripsi di **Android Keystore / iOS Keychain**. |
| `expo-local-authentication` | `~58.0.3` | Sensor **Sidik Jari / Face ID** untuk *Biometric App Lock* dan *Biometric Quick Login*. |
| `expo-image`, `expo-image-picker`, `expo-document-picker` | `~58.0.*` | Rendering & caching gambar cepat (`UserAvatar` & banner), serta upload foto profil/pengumuman dari Kamera & Galeri. |
| `react-hook-form`, `zod`, `@hookform/resolvers` | `^7.92.0` / `^4.6.7` / `^7.0.9` | Validasi form yang type-safe untuk layar Login & form input mobile. |
| `lucide-react-native` & `react-native-svg` | `^1.79.0` / `15.16.0` | Set ikon SVG yang namanya sinkron 1:1 dengan `lucide-react` & tabel `MenuItems` di `Identity.Api`. |
| `@react-native-community/netinfo` | `12.0.1` | Deteksi status koneksi jaringan real-time untuk menampilkan `OfflineBanner` global. |

*(Styling mobile memakai **Typed Design Tokens (`src/core/theme/tokens.ts` + `useTheme()`)** di atas `StyleSheet` bawaan React Native — nol overhead Babel/Metro plugin di Expo SDK 58 dan langsung mendukung mode Sistem / Terang / Gelap.)*

---

## 5. Testing Stack (`tests/NetStarterPack.Microservices.UnitTests/`)

| Package NuGet | Versi | Fungsi |
| :--- | :--- | :--- |
| `xunit` | `2.9.3` | Framework unit test dengan eksekusi paralel otomatis antar test class. |
| `xunit.runner.visualstudio` | `3.1.4` | Integrasi Test Explorer di Visual Studio & `dotnet test`. |
| `Microsoft.NET.Test.Sdk` | `17.14.1` | Host eksekusi test `.NET 10`. |
| `coverlet.collector` | `6.0.4` | Kolektor *code coverage* (`dotnet test --collect:"XPlat Code Coverage"`). |

*(Seluruh test double seperti `FakeCurrentUserService`, `FakePasswordHasher`, `InMemoryEventBus`, `TestDbFactory`, dan `TestCacheFactory` ditulis mandiri tanpa library mocking tambahan agar ringan dan mudah dibaca.)*

---

## 6. Infrastruktur, Storage, & Deployment

| Komponen | Teknologi | Keterangan |
| :--- | :--- | :--- |
| **Database Utama** | SQL Server 2022 (`SQLEXPRESS` / Docker `mssql/server:2022-latest`) | Mendukung 2 mode: *Database-per-Service* (default, 5 DB terpisah) atau *Single Shared DB* (template di `appsettings.json`). |
| **Distributed Cache (Opsional)** | Redis 7 (`redis:7-alpine`) | Aktif jika `CacheSettings:Provider = "Redis"`. Jika mati/tidak dipakai, otomatis pakai L1 `IMemoryCache` (*graceful degradation*). |
| **Containerization** | Docker + Docker Compose (`docker-compose.yml`) | Multi-stage Dockerfile (`dotnet/sdk:10.0` -> `dotnet/aspnet:10.0`, `node:22-alpine` -> `nginx:alpine`) dalam bridge network `nsp-mesh`. |
| **Windows Hosting (IIS)** | IIS 10+ + `.NET 10 Hosting Bundle` | 7 Site + 7 AppPool terpisah (`No Managed Code`), `URL Rewrite 2.1`, `ARR 3.0` (proxy `/api` & `/hubs`), dan `WebSocket Protocol`. |

---

## 7. Kenapa Memilih Stack Ini? (Catatan Keputusan Teknis)

Bagian ini menjawab pertanyaan *"kenapa pakai X dan bukan Y?"* di project ini:

1. **YARP (bukan Ocelot)**
   YARP dikembangkan langsung oleh tim Microsoft ASP.NET Core, native mendukung .NET 10, HTTP/2, WebSocket/SignalR out-of-the-box, dan otomatis hot-reload saat `appsettings.json` diedit tanpa restart AppPool.
2. **Compact Onion (bukan 4 `.csproj` per service)**
   Di monorepo dengan 5+ microservice, memecah tiap service menjadi `*.Domain`, `*.Application`, `*.Infrastructure`, `*.Api` akan bikin Solution meledak jadi 25+ project. Pemisahan layer lewat folder di dalam 1 `.csproj` per service menjaga batas arsitektur tetap rapi tapi Solution tetap ringan.
3. **Tanpa MediatR / AutoMapper / Redux**
   - Di backend, service langsung memakai constructor injection standar + mapping eksplisit (`MapToDto`) supaya alur kode gampang ditelusuri (*Go to Definition* langsung ketemu) dan nol magic/reflection overhead.
   - Di frontend, state global yang benar-benar lintas halaman cuma sesi auth & menu (`AuthContext`), sisanya cukup local React state — belum butuh Redux/Zustand.
4. **Hybrid L1 + L2 Cache & HTTP EventBus dengan Safe Fallback**
   Bisa langsung jalan di laptop developer **tanpa** wajib install Redis atau RabbitMQ dulu, tapi kontrak `ICacheService` & `IEventBus` sudah siap di-upgrade ke Redis / RabbitMQ / MassTransit kapan saja tanpa mengubah kode business service.
5. **Route-Level `React.lazy()` + Vite 8 + Tailwind CSS v4**
   Build produksi cuma ~1 detik dan bundle awal frontend tetap ramping (~353 KB / ~106 KB gzip) karena tiap domain halaman di-load hanya saat dibuka.
6. **Expo (React Native + TypeScript) untuk Mobile — bukan React Native CLI polos / Flutter / .NET MAUI**
   - Satu bahasa (TypeScript) & mindset Hooks dengan web `frontend/`, plus `lucide-react-native` langsung sinkron 1:1 dengan nama ikon `MenuItems` di database.
   - Kompatibel **Expo Go** sehingga developer yang baru clone cukup scan QR di HP tanpa wajib install Android Studio atau Mac/Xcode dulu.
   - Di mobile kita memakai **TanStack Query + Zustand** (berbeda dari web yang cukup Context) karena perangkat mobile sangat butuh *offline cache persistence*, *stale-while-revalidate*, dan *pull-to-refresh* saat sinyal naik-turun.

---

## 8. Matriks Prasyarat Environment

| Kebutuhan | Laptop Developer (Lokal) | Docker Compose | Windows Server (IIS) |
| :--- | :--- | :--- | :--- |
| **.NET** | `.NET 10.0 SDK` | *(Di dalam container)* | `.NET 10.0 Windows Server Hosting Bundle` |
| **Node.js** | `Node.js 20+ / 22 / 24` | *(Di dalam container)* | **Tidak perlu** (pakai hasil build statis `frontend-web/`) |
| **Database** | SQL Server / SQLEXPRESS *(atau SQLite)* | Otomatis (`sqlserver` container) | SQL Server (Windows Auth `IIS APPPOOL\*` atau SQL Auth) |
| **Web Server / Proxy** | Kestrel + Vite Dev Proxy | Kestrel + Nginx (`frontend/nginx.conf`) | IIS + `URL Rewrite 2.1` + `ARR 3.0` + `WebSocket Protocol` |
| **Redis** | Opsional (default `InMemory`) | Otomatis (`redis` container) | Opsional (`InMemory` atau Redis server terpisah) |
| **Mobile Testing** | HP Android/iOS + aplikasi **Expo Go** *(satu Wi-Fi / `-Tunnel`)* | — | Build APK/AAB/IPA terpisah via **EAS Build** (`mobile/eas.json`) |
