# Referensi Lengkap Endpoint API, Tabel Routing YARP Gateway, & Kontrak JSON

Semua endpoint API di project ini diakses oleh Frontend React melalui **1 pintu utama: YARP API Gateway (`http://localhost:5080/api/*`)**, dan selalu mengembalikan format JSON pembungkus standar **`Result` / `Result<T>`** ([`BuildingBlocks.Core/Common/Result.cs`](../src/BuildingBlocks/BuildingBlocks.Core/Common/Result.cs)).

---

## 1. Portal Dokumentasi & Pengetesan API (Unified vs Standalone)

Ketika aplikasi berjalan, kamu bisa mengetes API lewat **Unified Gateway** (semua microservice digabung di satu halaman) maupun langsung ke port masing-masing microservice:

| Portal Dokumentasi | URL Swagger UI (Klasik) | URL Scalar UI (Modern) | URL OpenAPI JSON |
| :--- | :--- | :--- | :--- |
| **1. Unified API Gateway *(Direkomendasikan)*** | **`http://localhost:5080/swagger`** | **`http://localhost:5080/scalar/v1`** | `http://localhost:5080/openapi/v1.json` |
| **2. Identity Microservice (Standalone)** | `http://localhost:5081/swagger` | `http://localhost:5081/scalar/v1` | `http://localhost:5081/openapi/v1.json` |
| **3. Catalog Microservice (Standalone)** | `http://localhost:5082/swagger` | `http://localhost:5082/scalar/v1` | `http://localhost:5082/openapi/v1.json` |
| **4. Order Microservice (Standalone)** | `http://localhost:5083/swagger` | `http://localhost:5083/scalar/v1` | `http://localhost:5083/openapi/v1.json` |
| **5. Workflow Microservice (Standalone)** | `http://localhost:5084/swagger` | `http://localhost:5084/scalar/v1` | `http://localhost:5084/openapi/v1.json` |
| **6. Announcement Microservice (Standalone)** | `http://localhost:5085/swagger` | `http://localhost:5085/scalar/v1` | `http://localhost:5085/openapi/v1.json` |
| **7. MasterData Microservice (Standalone)** | `http://localhost:5086/swagger` | `http://localhost:5086/scalar/v1` | `http://localhost:5086/openapi/v1.json` |

---

## 2. Tabel Pemetaan Routing YARP API Gateway (`Port 5080`)

Konfigurasi di [`src/ApiGateway/Gateway.Api/appsettings.json`](../src/ApiGateway/Gateway.Api/appsettings.json):

| Path yang Masuk ke Gateway (`:5080`) | Diteruskan oleh YARP ke Cluster | Alamat Microservice Tujuan | Database yang Diakses |
| :--- | :--- | :--- | :--- |
| `/api/auth/{**catch-all}` | `identity-cluster` | `http://localhost:5081` (`Identity.Api`) | `NetStarterPack_IdentityDb` |
| `/api/users` & `/api/users/{**catch-all}` | `identity-cluster` | `http://localhost:5081` (`Identity.Api`) | `NetStarterPack_IdentityDb` |
| `/api/roles` & `/api/roles/{**catch-all}` | `identity-cluster` | `http://localhost:5081` (`Identity.Api`) | `NetStarterPack_IdentityDb` |
| `/api/menus` & `/api/menus/{**catch-all}` | `identity-cluster` | `http://localhost:5081` (`Identity.Api`) | `NetStarterPack_IdentityDb` |
| `/api/organizations` & `/api/organizations/{**catch-all}` | `identity-cluster` | `http://localhost:5081` (`Identity.Api`) | `NetStarterPack_IdentityDb` |
| `/api/dashboard/{**catch-all}` | `identity-cluster` | `http://localhost:5081` (`Identity.Api`) | `NetStarterPack_IdentityDb` (+ HTTP Stats ke `Catalog.Api`) |
| `/api/products` & `/api/products/{**catch-all}` | `catalog-cluster` | `http://localhost:5082` (`Catalog.Api`) | `NetStarterPack_CatalogDb` |
| `/api/orders` & `/api/orders/{**catch-all}` | `order-cluster` | `http://localhost:5083` (`Order.Api`) | `NetStarterPack_OrderDb` |
| `/api/workflows` & `/api/workflows/{**catch-all}` | `workflow-cluster` | `http://localhost:5084` (`Workflow.Api`) | `NetStarterPack_WorkflowDb` |
| `/api/announcements` & `/api/announcements/{**catch-all}` | `announcement-cluster` | `http://localhost:5085` (`Announcement.Api`) | `NetStarterPack_AnnouncementDb` |
| `/hubs/announcements` & `/hubs/announcements/{**catch-all}` *(WebSocket/SignalR)* | `announcement-cluster` | `http://localhost:5085` (`Announcement.Api`) | Realtime SignalR Hub (`?access_token=<JWT>`) |
| `/api/lookups` & `/api/lookups/{**catch-all}` | `masterdata-cluster` | `http://localhost:5086` (`MasterData.Api`) | `NetStarterPack_MasterDataDb` |
| `/api/health` | *(Ditangani langsung oleh Gateway)* | Aggregated Health Probe ke `:5081`, `:5082`, `:5083`, `:5084`, `:5085`, & `:5086` | — |

---

## 3. Standar Format Response, Header Tracing, & HTTP Status Code

### A. API Versioning (`/api/v1/...`), Distributed Tracing, & Idempotency
Semua endpoint publik di 6 microservice mendukung **API Versioning (`Asp.Versioning.Mvc`)** dengan 3 cara pemanggilan sekaligus:
1. **URL Segment (Kanonis & default Web/Mobile)**: `/api/v1/products`, `/api/v1/orders`, `/api/v1/workflows`, `/api/v1/lookups`, dst.
2. **Header**: `X-Api-Version: 1.0`
3. **Query String**: `?api-version=1.0`

Alias lama tanpa versi (`/api/products`, `/api/health`, dst.) tetap aktif (*backward-compatible* ke versi default `1.0`) agar aplikasi mobile versi lama atau integrasi eksisting tidak langsung putus. Setiap response otomatis menyertakan header:
```http
api-supported-versions: 1.0
X-Correlation-Id: 9a4f2c1b8e7d4a5b9c0d1e2f3a4b5c6d
```

Untuk endpoint mutasi yang memiliki atribut `[Idempotent]` (Create/Update/Approve/Reject/Resubmit/Comment di `Workflow`, `Order`, `Catalog`, `Announcement`, dan `Identity`), client bisa mengirim header `Idempotency-Key` (UUID per aksi submit):
```http
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
```
Jika request yang sama terkirim ulang dalam masa TTL cache (default 30 menit), response lama langsung dikembalikan dari Hybrid Cache L1/L2 tanpa mengeksekusi database dua kali, disertai header penanda:
```http
X-Idempotent-Replayed: true
```

### B. Daftar Kode Status HTTP
| Status Code | Arti | Kapan Dikembalikan? |
| :---: | :--- | :--- |
| **`200 OK`** | Berhasil | Saat mengambil data (`GET`), mengubah data (`PUT`), atau menghapus data (`DELETE`) |
| **`201 Created`** | Berhasil Dibuat | Saat berhasil menambah data baru (`POST`) |
| **`400 Bad Request`** | Input Tidak Valid | Saat field wajib kosong, password lama salah, `Idempotency-Key` terlalu panjang/kosong (pada `RequireKey = true`), atau mencoba menghapus role/akun sistem (`superadmin`) |
| **`401 Unauthorized`** | Belum Login / Token Invalid | Saat header `Authorization: Bearer <token>` kosong/expired, atau `X-Internal-Api-Key` salah pada endpoint internal |
| **`403 Forbidden`** | Hak Akses Ditolak | Saat klaim JWT user tidak memiliki kode `permission` yang diminta oleh `[HasPermission("...")]` |
| **`404 Not Found`** | Data Tidak Ditemukan | Saat `Guid id` tidak ditemukan atau sudah di-*soft-delete* |
| **`409 Conflict`** | Konflik / Request Sedang Diproses | Saat data unik sudah terdaftar (`Username`, `Email`, `SKU`, dll.) **atau** request duplikat dengan `Idempotency-Key` yang sama masih sedang diproses |
| **`422 Unprocessable Entity`** | Payload Tidak Cocok | Saat `Idempotency-Key` yang sama dipakai ulang untuk payload request yang berbeda |
| **`429 Too Many Requests`** | Rate Limit Gateway | Saat 1 IP mengirim lebih dari 300 request dalam 1 menit ke `Gateway.Api` |
| **`500 Internal Server Error`** | Kesalahan Teknis Server | Ditangkap otomatis oleh `GlobalExceptionHandler` beserta `X-Correlation-Id` |

---

## 4. Endpoint Gateway Health & Topologi (`/api/health`)

- **`GET http://localhost:5080/api/health`** (`[AllowAnonymous]`):
  Mengecek kesehatan `Gateway.Api`, melakukan ping real-time ke `Identity.Api (:5081)` dan `Catalog.Api (:5082)`, serta mengembalikan waktu latensi (ms) masing-masing microservice:
  ```json
  {
    "gateway": "Gateway.Api (YARP Reverse Proxy)",
    "status": "Healthy",
    "framework": ".NET 10.0 LTS",
    "architecture": "Microservices + Compact Onion + YARP Gateway",
    "services": [
      {
        "item1": "Identity.Api",
        "item2": "http://localhost:5081/api/health",
        "item3": "Healthy",
        "item4": "NetStarterPack_IdentityDb",
        "item5": 3
      },
      {
        "item1": "Catalog.Api",
        "item2": "http://localhost:5082/api/health",
        "item3": "Healthy",
        "item4": "NetStarterPack_CatalogDb",
        "item5": 2
      }
    ]
  }
  ```

---

## 5. Endpoint `Identity.Api` (`Port 5081` — Lewat Gateway `Port 5080`)

### A. Autentikasi & Profil (`/api/auth`)
| Method | Endpoint | Akses | Fungsi |
| :---: | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Publik | Login & terima JWT `accessToken` (berisi klaim `permission`) + `refreshToken` |
| `POST` | `/api/auth/refresh` | Publik | *Refresh Token Rotation* |
| `POST` | `/api/auth/logout` | `[Authorize]` | Cabut refresh token perangkat saat ini |
| `POST` | `/api/auth/logout-all` | `[Authorize]` | Cabut seluruh refresh token aktif di semua perangkat |
| `GET` | `/api/auth/me` | `[Authorize]` | Ambil profil, roles, & permissions user yang sedang login |
| `PUT` | `/api/auth/profile` | `[Authorize]` | Update profil pribadi |
| `POST` | `/api/auth/avatar` | `[Authorize]` | Upload foto profil (`multipart/form-data`, field `file`, format JPG/PNG, maks 5 MB) |
| `DELETE` | `/api/auth/avatar` | `[Authorize]` | Hapus foto profil akun sendiri |
| `GET` | `/api/auth/avatar/{userId}` | Publik | Ambil file foto profil user (bisa langsung dipasang di `<img src>`) |
| `POST` | `/api/auth/change-password` | `[Authorize]` | Ganti password akun sendiri |

### B. Manajemen Pengguna (`/api/users`), Role (`/api/roles`), Menu (`/api/menus`), & Dashboard (`/api/dashboard`)
| Method | Endpoint | Permission | Fungsi |
| :---: | :--- | :--- | :--- |
| `GET` | `/api/users?search=&role=` | `Users.View` | Daftar pengguna di `NetStarterPack_IdentityDb` |
| `POST` | `/api/users` | `Users.Create` | Buat pengguna baru + assign multi-role |
| `PUT` | `/api/users/{id}` | `Users.Edit` | Ubah data, status, password, & role pengguna |
| `DELETE` | `/api/users/{id}` | `Users.Delete` | Soft-delete pengguna |
| `GET` | `/api/roles` & `/api/roles/permissions` | `[Authorize]` | Daftar role & kamus konstanta permission dari `BuildingBlocks.Core` |
| `POST`/`PUT`/`DELETE` | `/api/roles` | `Roles.Manage` | Buat, ubah matriks permission/menu, atau hapus role |
| `GET` | `/api/menus/my-menus` | `[Authorize]` | Daftar menu sidebar dinamis sesuai role user login |
| `GET`/`POST`/`PUT`/`DELETE` | `/api/menus` | `Menus.View` / `Menus.Manage` | Kelola konfigurasi menu sidebar dinamis |
| `GET` | `/api/dashboard/summary` | `Dashboard.View` | Ringkasan metrik gabungan (`IdentityDb` + HTTP call ke `Catalog.Api`) |
| `GET` | `/api/dashboard/audit-logs?limit=100` | `AuditLogs.View` | Riwayat log aktivitas terpusat dari seluruh microservice |

### C. Master Struktur Organisasi (`/api/organizations`)
| Method | Endpoint | Permission | Fungsi |
| :---: | :--- | :--- | :--- |
| `GET` | `/api/organizations/tree` | `Organization.View` | Hirarki lengkap: Direktorat (+ Head/C-Level) -> Divisi -> Departemen -> Daftar Anggota |
| `GET`/`POST`/`PUT`/`DELETE` | `/api/organizations/directorates` | `Organization.View` / `Organization.Manage` | CRUD Master Direktorat (termasuk assign `headUserId` / C-Level) |
| `GET`/`POST`/`PUT`/`DELETE` | `/api/organizations/divisions` | `Organization.View` / `Organization.Manage` | CRUD Master Divisi (turunan Direktorat, mendukung filter `?directorateId=`) |
| `GET`/`POST`/`PUT`/`DELETE` | `/api/organizations/departments` | `Organization.View` / `Organization.Manage` | CRUD Master Departemen (turunan Divisi, mendukung filter `?divisionId=`) |
| `GET`/`POST`/`PUT`/`DELETE` | `/api/organizations/positions` | `Organization.View` / `Organization.Manage` | CRUD Master Posisi/Jabatan & Level (`1` = C-Level s/d `6` = Staff) |

### D. Endpoint Internal Service-to-Service (`Identity.Api :5081`)
| Method | Endpoint Internal | Proteksi | Fungsi |
| :---: | :--- | :--- | :--- |
| `POST` | `http://localhost:5081/api/internal/events/audit-log` | Header `X-Internal-Api-Key` | Menerima `AuditLogIntegrationEvent` dari `Catalog.Api` (atau microservice lain) melalui `HttpEventBus` |

---

## 6. Endpoint `Catalog.Api` (`Port 5082` — Lewat Gateway `Port 5080`)

| Method | Endpoint | Permission | Fungsi |
| :---: | :--- | :--- | :--- |
| `GET` | `/api/products?search=&category=` | `Products.View` | Ambil daftar produk dari `NetStarterPack_CatalogDb` (L1/L2 Cache) |
| `GET` | `/api/products/{id}` | `Products.View` | Ambil detail 1 produk berdasarkan `Guid Id` |
| `GET` | `/api/products/stats` | Publik / Aggregator | Ambil ringkasan `CatalogStatsDto` (`TotalProducts`, `TotalInventoryValue`) untuk Dashboard |
| `POST` | `/api/products` | `Products.Create` | Tambah produk ke `CatalogDb`, invalidate cache `products:`, & publish `AuditLogIntegrationEvent` ke `Identity.Api` |
| `PUT` | `/api/products/{id}` | `Products.Edit` | Ubah produk di `CatalogDb`, invalidate cache, & publish `AuditLogIntegrationEvent` |
| `DELETE` | `/api/products/{id}` | `Products.Delete` | Soft-delete produk di `CatalogDb`, invalidate cache, & publish `AuditLogIntegrationEvent` |

---

## 7. Endpoint `Order.Api` (`Port 5083` — Example 2, Lewat Gateway `Port 5080`)

| Method | Endpoint | Permission | Fungsi |
| :---: | :--- | :--- | :--- |
| `GET` | `/api/orders?search=&status=` | `Orders.View` | Ambil daftar pesanan dari `NetStarterPack_OrderDb` (L1/L2 Cache) |
| `GET` | `/api/orders/{id}` | `Orders.View` | Ambil detail 1 pesanan berdasarkan `Guid Id` |
| `GET` | `/api/orders/stats` | Publik / Aggregator | Ambil ringkasan `OrderStatsDto` untuk Dashboard |
| `POST` | `/api/orders` | `Orders.Create` | Buat pesanan baru + kalkulasi total otomatis + publish `AuditLogIntegrationEvent` |
| `PUT` | `/api/orders/{id}` | `Orders.Edit` | Ubah pesanan/status di `OrderDb` + invalidate cache |
| `DELETE` | `/api/orders/{id}` | `Orders.Delete` | Soft-delete pesanan di `OrderDb` |

---

## 8. Endpoint `Workflow.Api` (`Port 5084` — Example 3 Advanced, Lewat Gateway `Port 5080`)

| Method | Endpoint | Permission | Fungsi |
| :---: | :--- | :--- | :--- |
| `GET` | `/api/workflows/templates` | `[Authorize]` | Ambil daftar template form dinamis beserta `fields` & `approvalFlow` |
| `POST` | `/api/workflows/templates` | `Workflows.ManageTemplates` | Buat template formulir dinamis baru (khusus Admin / SuperAdmin) |
| `POST` | `/api/workflows` | `Workflows.Create` | Buat pengajuan baru (*Save Draft* atau *Submit* langsung + validasi skema dinamis) |
| `PUT` | `/api/workflows/{id}/resubmit` | `Workflows.Create` | Edit & submit ulang dokumen berstatus `Draft`/`RevisionRequested` (wajib pemilik asli) |
| `GET` | `/api/workflows/working-list` | `Workflows.Approve` | Ambil inbox antrean approval khusus untuk role user yang sedang login |
| `GET` | `/api/workflows/tracking?scope=&status=&search=` | `Workflows.View` | Pantau progres semua/milik sendiri lengkap dengan posisi approver & history log |
| `GET` | `/api/workflows/{id}` | `Workflows.View` | Detail lengkap 1 pengajuan (form dinamis, approval steps, & immutable logs) |
| `POST` | `/api/workflows/{id}/approve` | `Workflows.Approve` | Setujui step aktif (*Anti-Self-Approval* & *Strict Role Step Guard*) |
| `POST` | `/api/workflows/{id}/request-revision` | `Workflows.Approve` | Kembalikan pengajuan ke pemohon untuk direvisi (catatan wajib diisi) |
| `POST` | `/api/workflows/{id}/reject` | `Workflows.Approve` | Tolak pengajuan secara final (alasan wajib diisi) |
| `GET` | `/api/workflows/stats` | Publik / Aggregator | Ambil ringkasan `WorkflowStatsDto` untuk Dashboard |

---

## 9. Endpoint `Announcement.Api` (`Port 5085` — HR Newsroom, Lewat Gateway `Port 5080`)

| Method | Endpoint | Permission / Role | Fungsi |
| :---: | :--- | :--- | :--- |
| `GET` | `/api/announcements?page=1&pageSize=10&type=&search=` | `Announcements.View` | Feed pengumuman berhalaman (default 10/halaman, pinned dulu lalu terbaru) |
| `GET` | `/api/announcements/bell` | `[Authorize]` | Feed notifikasi bel: jumlah unread + daftar belum dibaca / 3 terbaru |
| `GET` | `/api/announcements/{id}` | `Announcements.View` | Detail pengumuman + otomatis menandai sudah dibaca user login |
| `POST` | `/api/announcements` | `Announcements.Manage` *(Tim HR)* | Publish pengumuman baru (rich text sanitized, banner, lampiran, on/off komentar) |
| `PUT` | `/api/announcements/{id}` | `Announcements.Manage` *(Tim HR)* | Edit pengumuman, banner, lampiran, & pengaturan komentar |
| `DELETE` | `/api/announcements/{id}` | `Announcements.Manage` *(Tim HR)* | Hapus pengumuman (*soft-delete*) |
| `PATCH` | `/api/announcements/{id}/toggle-comments` | `Announcements.Manage` *(Tim HR)* | Aktifkan/matikan komentar kapan saja setelah dipublish |
| `POST` | `/api/announcements/{id}/like` | `Announcements.View` | Toggle like / unlike pengumuman |
| `POST` | `/api/announcements/{id}/comments` | `Announcements.View` | Tambah komentar baru atau balasan berjenjang (`parentCommentId`) beserta emoji (ditolak `400` jika komentar sedang off) |
| `DELETE` | `/api/announcements/{id}/comments/{commentId}` | `Announcements.View` | Hapus komentar (khusus pemilik komentar atau Tim HR) |
| `POST` | `/api/announcements/mark-all-read` | `[Authorize]` | Tandai seluruh pengumuman sudah dibaca |
| `POST` | `/api/announcements/upload?kind=Banner\|Image\|File` | `Announcements.Manage` *(Tim HR)* | Upload banner, lampiran gambar, atau lampiran file (maks. 10 MB) |
| `GET` | `/api/announcements/files/{storedFileName}` | Publik / Static Stream | Menampilkan gambar banner/lampiran atau download file (`?download=true`) |
| `GET` | `/api/announcements/stats` | Publik / Aggregator | Statistik ringkas `AnnouncementStatsDto` |

---

## 10. Endpoint `MasterData.Api` (`Port 5086` — Unified Lookups, Lewat Gateway `Port 5080`)

| Method | Endpoint | Permission / Akses | Fungsi |
| :---: | :--- | :--- | :--- |
| `GET` | `/api/lookups/groups` | `[Authorize]` | Daftar seluruh `GroupCode` yang tersedia beserta jumlah item aktif & sistem |
| `GET` | `/api/lookups?groupCode=&activeOnly=false&parentId=&search=` | `[Authorize]` | Ambil daftar item lookup (mendukung filter aktif, cascading `parentId`, & pencarian; di-cache Hybrid L1/L2) |
| `GET` | `/api/lookups/batch?groups=PRODUCT_CATEGORY,UNIT_OF_MEASURE&activeOnly=true` | `[Authorize]` | Ambil beberapa grup lookup sekaligus dalam 1 HTTP request |
| `GET` | `/api/lookups/{id}` | `[Authorize]` | Detail 1 item lookup |
| `GET` | `/api/lookups/stats` | Publik / Aggregator | Ringkasan statistik `MasterDataStatsDto` |
| `POST` | `/api/lookups` | `Lookups.Manage` + `[Idempotent]` | Tambah item lookup baru (ke grup lama atau grup baru) + invalidate cache + audit log |
| `PUT` | `/api/lookups/{id}` | `Lookups.Manage` + `[Idempotent]` | Ubah item lookup (untuk item `isSystem`, `groupCode` & `code` dikunci) |
| `PATCH` | `/api/lookups/{id}/status` | `Lookups.Manage` + `[Idempotent]` | Toggle status aktif/nonaktif tanpa menghapus data historis |
| `DELETE` | `/api/lookups/{id}` | `Lookups.Manage` | Soft-delete item non-sistem yang tidak memiliki child |
