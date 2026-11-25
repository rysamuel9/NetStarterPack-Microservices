# Catatan Lapangan & Playbook Troubleshooting IIS (NetStarterPack Microservices)

Dokumen ini adalah rangkuman kasus nyata yang sering muncul waktu deploy & menjalankan **NetStarterPack Microservices (8 Site: Gateway + 6 Service + React SPA)** di **IIS Windows**, lengkap dengan semua opsi solusinya biar nggak lupa pas deploy ulang atau pindah server.

Untuk panduan langkah deploy dari nol + update selektif harian, lihat juga [`docs/11_IIS_DEPLOYMENT_GUIDE.md`](11_IIS_DEPLOYMENT_GUIDE.md).

---

## 1. Checklist Cepat: 8 Folder, 8 AppPool, & 8 Site IIS

Hasil dari `.\publish-iis.ps1 -Target All` menghasilkan **8 folder** di `publish-iis\` yang di-copy ke `C:\inetpub\nsp-ms\` (atau folder tujuanmu di `C:\inetpub\`):

| No | Folder Publish | Site Name (Saran) | App Pool (`No Managed Code`) | Port | Catatan Khusus |
| :-: | :--- | :--- | :--- | :---: | :--- |
| 1 | `identity-api` | `nsp-identity-api` | `nsp-identity-pool` | `5081` | DB `NetStarterPack_IdentityDb` |
| 2 | `catalog-api` | `nsp-catalog-api` | `nsp-catalog-pool` | `5082` | DB `NetStarterPack_CatalogDb` |
| 3 | `order-api` | `nsp-order-api` | `nsp-order-pool` | `5083` | DB `NetStarterPack_OrderDb` |
| 4 | `workflow-api` | `nsp-workflow-api` | `nsp-workflow-pool` | `5084` | DB `NetStarterPack_WorkflowDb` |
| 5 | `announcement-api` | `nsp-announcement-api` | `nsp-announcement-pool` | `5085` | DB `NetStarterPack_AnnouncementDb` + butuh izin Write folder + WebSocket |
| 6 | `masterdata-api` | `nsp-masterdata-api` | `nsp-masterdata-pool` | `5086` | DB `NetStarterPack_MasterDataDb` (Unified Lookups + Hybrid Cache L1/L2) |
| 7 | `gateway-api` | `nsp-gateway-api` | `nsp-gateway-pool` | `5080` | Set `AutoStartBackendServices: false` & `AutoStartFrontendSpa: false` |
| 8 | `frontend-web` | `nsp-frontend` | `nsp-frontend-pool` | `5173` / `80` | Hasil build statis React (`index.html`, `assets/`, `web.config`) |

### Prasyarat IIS yang Wajib Dicek Sekali
1. **.NET 10.0 Hosting Bundle** (setelah install, jalankan `net stop was /y` lalu `net start w3svc` lewat CMD/PowerShell Admin).
2. **IIS URL Rewrite Module 2.1** (wajib buat React Router biar `F5` nggak 404).
3. **ARR 3.0 (Application Request Routing)** + centang **Enable proxy** (sangat disarankan buat reverse proxy `/api` & `/hubs`).
4. **WebSocket Protocol** di *Turn Windows features on or off -> IIS -> World Wide Web Services -> Application Development Features -> WebSocket Protocol* (wajib buat SignalR realtime di `Announcement.Api`).

> **Jangan copas folder `frontend/` mentah ke IIS!**
> IIS nggak bisa baca file `.tsx` / TypeScript / Tailwind v4 mentah. Selalu jalankan `.\publish-iis.ps1 -Target Frontend` (atau `-Target All`) dan copy **hanya isi folder `publish-iis\frontend-web\`** (~1 MB, tanpa `node_modules`, dan server IIS nggak perlu install Node.js).

---

## 2. Kasus 1 — Publish `Gateway.Api` Error `NETSDK1152` & Folder Output Kosong

### Gejala
Saat jalankan `.\publish-iis.ps1 -Target Gateway` atau `-Target All`, muncul error:
```text
error NETSDK1152: Found multiple publish output files with the same relative path:
Identity.Api\appsettings.json, Catalog.Api\appsettings.json, ..., Gateway.Api\appsettings.json.
```
Lalu folder `publish-iis\gateway-api\` ternyata kosong.

### Penyebab
`Gateway.Api.csproj` punya `<ProjectReference>` ke 5 service backend supaya waktu tekan `F5` (Debug) di Visual Studio semuanya ikut ter-build. Kalau `<ProjectReference>` itu tidak dibatasi ke `Debug` atau tidak punya `ExcludeAssets="all"`, MSBuild ikut menyalin semua `appsettings.json` dari 5 service ke folder publish Gateway dan langsung bentrok.

### Solusi (Sudah Diterapkan di Repo)
1. Di [`src/ApiGateway/Gateway.Api/Gateway.Api.csproj`](../src/ApiGateway/Gateway.Api/Gateway.Api.csproj), referensi ke 5 microservice dibungkus `Condition="'$(Configuration)' == 'Debug'"` + `ReferenceOutputAssembly="false" Private="false" ExcludeAssets="all"`.
2. Di [`publish-iis.ps1`](../publish-iis.ps1), ditambahkan cek `if ($LASTEXITCODE -ne 0) { throw ... }` supaya script langsung berhenti kalau `dotnet publish` / `npm run build` gagal (tidak lanjut print `[OK]`).

---

## 3. Kasus 2 — Login Error `POST http://localhost:5173/api/auth/login 404 (Not Found)` (Padahal `/api/health` di `:5080` Healthy)

### Gejala
- Cek `http://localhost:5080/api/health` -> semua 5 microservice `Healthy`.
- Buka `http://localhost:5173/login`, isi user/password, klik login -> console browser muncul:
  ```text
  POST http://localhost:5173/api/auth/login 404 (Not Found)
  ```

### Penyebab
Frontend menembak relative URL `/api/...` dan `/hubs/...` ke origin tempat ia dibuka (`http://localhost:5173`). Waktu dev (`npm run dev`), Vite otomatis mem-proxy `/api` dan `/hubs` ke `http://localhost:5080`. Di IIS, site `nsp-frontend` (`:5173`) belum mem-proxy request tersebut ke `Gateway.Api` (`:5080`), jadi IIS mencari folder fisik `api\auth\login` dan membalas `404`.

---

### Opsi 1 (Direkomendasikan): Reverse Proxy lewat IIS ARR 3.0 + `web.config`
Kelebihan: 1 origin (`:5173`), bebas CORS, dan **semua fitur langsung jalan** termasuk REST `/api/*`, gambar banner `/api/announcements/files/*`, dan SignalR `/hubs/announcements`.

1. Install **IIS URL Rewrite 2.1** dan **Application Request Routing (ARR) 3.0**.
2. Buka **IIS Manager** -> klik **nama server paling atas** (bukan site) -> buka **Application Request Routing Cache** -> klik **Server Proxy Settings...** di panel kanan -> centang **Enable proxy** -> klik **Apply**.
3. Ubah `C:\inetpub\...\frontend-web\web.config` menjadi:
   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <configuration>
     <system.webServer>
       <rewrite>
         <rules>
           <rule name="ProxyApiToGateway" stopProcessing="true">
             <match url="^api/(.*)" />
             <action type="Rewrite" url="http://localhost:5080/api/{R:1}" />
           </rule>
           <rule name="ProxyHubsToGateway" stopProcessing="true">
             <match url="^hubs/(.*)" />
             <action type="Rewrite" url="http://localhost:5080/hubs/{R:1}" />
           </rule>
           <rule name="ReactRouterRoutes" stopProcessing="true">
             <match url=".*" />
             <conditions logicalGrouping="MatchAll">
               <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
               <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
             </conditions>
             <action type="Rewrite" url="/index.html" />
           </rule>
         </rules>
       </rewrite>
     </system.webServer>
   </configuration>
   ```
4. Refresh browser (`Ctrl + F5`) dan coba login lagi.

> **Tips cek cepat**: Kalau `web.config` di atas sudah dipasang tapi `/api/auth/login` masih `404`, biasanya **ARR 3.0 belum ter-install** atau checkbox **Enable proxy** di level server IIS belum dicentang/di-Apply.

---

### Opsi 2 (Tanpa Install ARR): Arahkan `VITE_API_URL` Langsung ke `:5080`
Cocok kalau tidak bisa install ARR di server tujuan.

1. Buat file `frontend\.env.production`:
   ```env
   VITE_API_URL=http://localhost:5080/api
   ```
   *(Ganti `localhost` dengan IP/domain server kalau diakses dari komputer lain.)*
2. Pastikan URL origin Frontend (misal `http://localhost:5173` atau `http://192.168.1.100:5173`) terdaftar di `gateway-api\appsettings.json` bagian `"Cors": { "AllowedOrigins": [...] }`.
3. Publish ulang Frontend saja:
   ```powershell
   .\publish-iis.ps1 -Target Frontend
   ```
4. Copy isi `publish-iis\frontend-web\*` ke folder `frontend-web` di `C:\inetpub`.

> **Catatan keterbatasan Opsi 2**: Karena `announcementHub.ts` (`/hubs/announcements`) dan URL banner/lampiran `Announcement.Api` (`/api/announcements/files/...`) menggunakan relative path, untuk dukungan 100% tanpa ubah kode tetap lebih bersih memakai **Opsi 1 (ARR)**.

---

## 4. Kasus 3 — Login Error 500 `SqlServerRetryingExecutionStrategy`

### Gejala
Request sudah tembus ke `Identity.Api`, tapi return HTTP `500`:
```json
{
  "succeeded": false,
  "message": "Terjadi kesalahan internal pada microservice. Silakan periksa log dengan Correlation ID terkait.",
  "errors": [
    "The maximum number of retries (3) was exceeded while executing database operations with 'SqlServerRetryingExecutionStrategy'. See the inner exception for the most recent failure."
  ],
  "statusCode": 500
}
```

### Penyebab
Connection string di `appsettings.json` masih memakai `Integrated Security=True` (Windows Authentication).
- Saat dev (`F5` / `dotnet run`), proses memakai **akun Windows developer** (sudah punya akses ke SQL Server).
- Saat jalan di **IIS**, tiap service memakai identitas virtual **`IIS APPPOOL\<nama-pool>`** yang **belum punya login di SQL Server**, sehingga ditolak (`Login failed`) dan EF Core gagal setelah 3x retry.

---

### Opsi A (Paling Cepat untuk Lokal): Daftarkan 5 AppPool IIS di SQL Server (SSMS)
Tanpa perlu edit `appsettings.json` sama sekali.

1. Buka **SSMS** -> connect ke instance SQL Server (misal `LAPTOP-G513H4H7\SQLEXPRESS02`) -> **New Query**.
2. Untuk **testing di laptop lokal** (paling cepat, langsung support auto-create DB & auto-seeding):
   ```sql
   CREATE LOGIN [IIS APPPOOL\nsp-identity-pool] FROM WINDOWS;
   ALTER SERVER ROLE [sysadmin] ADD MEMBER [IIS APPPOOL\nsp-identity-pool];

   CREATE LOGIN [IIS APPPOOL\nsp-catalog-pool] FROM WINDOWS;
   ALTER SERVER ROLE [sysadmin] ADD MEMBER [IIS APPPOOL\nsp-catalog-pool];

   CREATE LOGIN [IIS APPPOOL\nsp-order-pool] FROM WINDOWS;
   ALTER SERVER ROLE [sysadmin] ADD MEMBER [IIS APPPOOL\nsp-order-pool];

   CREATE LOGIN [IIS APPPOOL\nsp-workflow-pool] FROM WINDOWS;
   ALTER SERVER ROLE [sysadmin] ADD MEMBER [IIS APPPOOL\nsp-workflow-pool];

   CREATE LOGIN [IIS APPPOOL\nsp-announcement-pool] FROM WINDOWS;
   ALTER SERVER ROLE [sysadmin] ADD MEMBER [IIS APPPOOL\nsp-announcement-pool];
   ```
   *(Sesuaikan nama pool jika di IIS Manager kamu memakai nama berbeda.)*

3. Untuk **server production (Least Privilege — lebih aman, tidak pakai `sysadmin`)**:
   Buat login masing-masing AppPool, lalu map sebagai `db_owner` **hanya ke database miliknya sendiri**:
   ```sql
   -- Contoh untuk Identity.Api (ulangi pola yang sama untuk 4 DB lainnya)
   CREATE LOGIN [IIS APPPOOL\nsp-identity-pool] FROM WINDOWS;
   USE [NetStarterPack_IdentityDb];
   CREATE USER [IIS APPPOOL\nsp-identity-pool] FOR LOGIN [IIS APPPOOL\nsp-identity-pool];
   ALTER ROLE [db_owner] ADD MEMBER [IIS APPPOOL\nsp-identity-pool];
   ```
4. Buka **IIS Manager** -> **Recycle** (atau Stop -> Start) ke-5 AppPool backend.

---

### Opsi B (SQL Server Authentication — `User Id` & `Password`)
Cocok kalau SQL Server di server tujuan sudah mengaktifkan **Mixed Mode Authentication** (SQL Server + Windows Auth) dan pakai akun khusus / `sa`.

1. Di ke-5 file `appsettings.json` (`identity-api`, `catalog-api`, `order-api`, `workflow-api`, `announcement-api`), ganti `Integrated Security=True;` menjadi:
   ```text
   User Id=sa;Password=PasswordSQLKamu;
   ```
2. **Recycle** ke-5 AppPool backend di IIS Manager.

---

### Opsi C (Ganti Identity AppPool di IIS Manager ke Akun Windows)
Cocok kalau tidak punya akses mengubah SQL Server Logins, tapi punya akun Windows / Domain Service Account yang sudah terdaftar di SQL Server.

1. Di **IIS Manager** -> **Application Pools** -> klik kanan AppPool backend -> **Advanced Settings...**
2. Di bagian **Process Model -> Identity**, klik `...` -> pilih **Custom account** -> klik **Set...** -> masukkan username & password Windows / Domain account.
3. Klik **OK**, lalu **Recycle** AppPool tersebut (ulangi untuk 5 AppPool backend).

---

## 5. Kasus 4 — Konfigurasi Penting Lain yang Sering Kelupaan

### A. Matikan Auto-Orchestrator di `gateway-api\appsettings.json`
Di IIS, yang menyalakan service adalah **IIS Application Pool**, bukan `Gateway.Api`. Pastikan di `gateway-api\appsettings.json` nilainya `false`:
```json
"MicroservicesOrchestrator": {
  "AutoStartBackendServices": false,
  "AutoStartFrontendSpa": false
}
```

### B. Upload Banner / Lampiran `Announcement.Api` Gagal (`Access Denied`)
`Announcement.Api` menyimpan file upload dan seed banner SVG di disk lokalnya.
- Klik kanan folder `C:\inetpub\...\announcement-api` -> **Properties** -> **Security** -> **Edit** -> berikan izin **Modify / Write** untuk `IIS_IUSRS` (atau spesifik `IIS APPPOOL\nsp-announcement-pool`).

### C. SignalR Realtime Announcement Tidak Jalan di IIS
Pastikan 2 hal ini aktif:
1. Windows Feature **WebSocket Protocol** sudah dicentang di IIS.
2. Rule `ProxyHubsToGateway` (`^hubs/(.*)` -> `http://localhost:5080/hubs/{R:1}`) sudah ada di `frontend-web\web.config`.

### D. Cara Lihat Error Asli Kalau Kena `HTTP Error 500.30`
1. Buka `web.config` di folder service yang error (misal `identity-api\web.config`).
2. Ubah `stdoutLogEnabled="false"` menjadi **`stdoutLogEnabled="true"`**.
3. Buat folder kosong bernama **`logs`** di dalam folder service tersebut (pastikan `IIS_IUSRS` punya izin Write).
4. Recycle AppPool -> akses ulang endpoint-nya -> buka file `.log` terbaru di folder `logs\` untuk membaca stack trace asli.
5. Setelah ketemu & beres, kembalikan `stdoutLogEnabled="false"` biar disk nggak penuh log.

---

## 6. Cheat Sheet Perintah Cepat

```powershell
# Restart seluruh IIS setelah install Hosting Bundle / ARR / ubah modul
net stop was /y
net start w3svc

# Publish ulang semua service + Frontend
.\publish-iis.ps1 -Target All

# Publish ulang 1 target saja (misal Gateway atau Frontend)
.\publish-iis.ps1 -Target Gateway
.\publish-iis.ps1 -Target Frontend

# Cek cepat semua service lewat terminal
Invoke-RestMethod http://localhost:5080/api/health | ConvertTo-Json -Depth 4
```
