# Panduan NetStarterPack Mobile (React Native + Expo)

Dokumen ini merangkum arsitektur, cara menjalankan, dan pola pengembangan untuk **NetStarterPack Mobile** di folder `mobile/` yang mengonsumsi seluruh microservice lewat satu pintu **`Gateway.Api` (`:5080`)**.

---

## 1. Gambaran Arsitektur & Integrasi dengan Backend

Aplikasi mobile tidak pernah menembak port masing-masing microservice (`:5081`–`:5085`). Semua trafik HTTP REST & WebSocket SignalR masuk melalui **`Gateway.Api` (`:5080`)**:

- **Auth & Zero-Trust JWT**: Login (`/api/auth/login`), profil (`/api/auth/me`), avatar (`/api/auth/avatar`), serta menu dinamis (`/api/menus/my-menus`).
- **Token Security**: Access Token & Refresh Token disimpan terenkripsi menggunakan **`expo-secure-store`** (Android Keystore / iOS Keychain), bukan storage plain text.
- **Single-Flight Refresh Token Queue**: Di `mobile/src/core/api/client.ts`, request paralel yang kena `401` otomatis diantrekan sehingga `/api/auth/refresh` hanya dipanggil **1 kali** (aman untuk *Refresh Token Rotation*).
- **Offline Resilience**: Menggunakan **TanStack Query + AsyncStorage Persister** (cache 24 jam) dan **`OfflineBanner`** global via `@react-native-community/netinfo`.
- **Real-time SignalR**: Terhubung ke `/hubs/announcements` melalui `mobile/src/core/realtime/announcementHub.ts` untuk live update pengumuman, jumlah like, dan komentar.

---

## 2. Daftar Fitur Operational yang Sudah Tersedia

1. **Auth, Biometrik (App Lock & Quick Login), & Dev Server URL Switcher**
   - Login (React Hook Form + Zod), quick-fill akun dummy di mode `__DEV__`, **Kunci Sidik Jari / Face ID** saat membuka ulang app (`BiometricLockScreen`), **Biometric Quick Login** langsung di layar Login (tetap tersedia setelah Logout biasa), serta modal **⚙️ API Gateway URL** lengkap dengan tombol *Tes Koneksi* ke `/api/health`.
2. **Dashboard & Live Cluster Health Monitor**
   - Menampilkan topologi **`1 Gateway • 5 Cluster • 5 Isolated DB`**, status live tiap node (**`Reachable • Xms`** / **`Unreachable`**) dan nama database terisolasinya langsung dari `GET /api/health`, plus metrik lintas service & aktivitas terbaru.
3. **Live Tab Badges & Dynamic Menu Grid (RBAC 100% Terhubung)**
   - Tab **Approval** menampilkan badge jumlah pending working list dan tab **Info** menampilkan badge jumlah pengumuman belum dibaca secara live via SignalR.
   - Dynamic Menu Grid dirender otomatis dari `/api/menus/my-menus` dengan `lucide-react-native` dan terhubung penuh ke seluruh 14 modul aplikasi.
4. **Profil & Keamanan Akun**
   - Tampil & ganti/hapus **foto profil** (Bottom Sheet Kamera / Galeri via `expo-image-picker`), grid **Profil Organisasi** (NIK, Direktorat, Divisi, Departemen, Atasan), edit profil, ganti password, toggle Biometrik, switcher Tema (**Sistem / Terang / Gelap**), Logout, & Logout Semua Perangkat.
5. **Catalog / Products CRUD (`Catalog.Api :5082`)**
   - Search, filter kategori dinamis, Tambah/Edit/Soft-Delete produk sesuai `Products.*` permission.
6. **Orders CRUD (`Order.Api :5083`)**
   - Ringkasan stats (`/api/orders/stats`), filter status, quick-pick produk dari `Catalog.Api`, kalkulasi total otomatis, Tambah/Edit/Hapus sesuai `Orders.*` permission.
7. **Workflow Dynamic Form & Multi-Level Approval (`Workflow.Api :5084`)**
   - **Working List Approval** (Tab Approval): antrean pending sesuai role + modal keputusan **Approve / Minta Revisi / Tolak**.
   - **Buat Pengajuan (`workflow-create`)**: pilih template dari database, render field JSON dinamis (`text`, `textarea`, `number`, `currency`, `date`, `select`), simpan Draft atau Submit langsung.
   - **Tracking (`workflow-tracking`)**: filter *Semua / Saya Ajukan / Pernah Proses*, **Vertical Approval Stepper**, riwayat aktivitas, dan **Edit & Resubmit** untuk Draft / RevisionRequested.
8. **HR Newsroom, Composer, & Live SignalR (`Announcement.Api :5085`)**
   - Feed berhalaman (pagination 10/halaman), filter tipe, pencarian, quick Like, **Announcement Composer** (untuk `Announcements.Manage` lengkap dengan upload Banner & Galeri Foto), detail artikel & lampiran, serta komentar & **balasan berjenjang ala IG** (`@username`) yang live sinkron via SignalR.
9. **Monitoring & Direktori Admin (`Identity.Api :5081`)**
   - Layar **Audit Trail & Log**, **Laporan & Analitik** (lengkap dengan Share sheet native), **Direktori Pengguna**, **Struktur Organisasi (Tree)**, **Roles & Permissions**, dan **Konfigurasi Menu**.

---

## 3. Cara Menjalankan di HP Fisik (Android / iOS dengan Expo Go)

### One-Click Launcher (Paling Praktis)
1. Install aplikasi gratis **Expo Go** di HP kamu (Play Store / App Store).
2. Pastikan laptop dan HP berada di **Wi-Fi yang sama** (atau tethering hotspot).
3. Jalankan salah satu:
   - Klik 2x **`run-mobile.bat`**, atau
   - Di PowerShell terminal interaktif:
     ```powershell
     .\start-mobile-dev.ps1
     ```
4. Script otomatis mendeteksi IPv4 LAN laptop, menyetel `mobile/.env`, menyalakan `Gateway.Api` pada `http://0.0.0.0:5080`, dan memunculkan **QR Code** Expo.
5. Scan QR Code dari **Expo Go** (atau masukkan URL `exp://<IP-LAN>:8081` secara manual).

### Troubleshooting Singkat Windows
- **HP gagal konek ke `:5080` atau `:8081`**: Buka PowerShell sebagai Administrator sekali saja untuk mengizinkan port dev lokal:
  ```powershell
  New-NetFirewallRule -DisplayName "NetStarterPack Mobile Dev" -Direction Inbound -Protocol TCP -LocalPort 5080,8081,8082 -Action Allow
  ```
- **Wi-Fi kantor/publik memblokir koneksi antar-device**: Gunakan mode tunnel:
  ```powershell
  .\start-mobile-dev.ps1 -Tunnel
  ```

---

## 4. Menambah Modul Mobile Baru & Rilis CI/CD Terpisah

- **Tambah layar baru**: Buat file di `mobile/app/(modules)/<nama-modul>.tsx`, lalu daftarkan pemetaan path-nya di `mobile/app/(tabs)/menus.tsx`.
- **Typecheck**: `cd mobile && npm run typecheck`
- **Build rilis independen (EAS)**: Folder `mobile/` sudah dilengkapi `mobile/eas.json` (`development`, `preview` APK, `production` AAB/IPA). Di CI/CD, cukup gunakan filter path `mobile/**` dan tag `mobile-v*` agar rilis mobile terpisah total dari lifecycle backend & web.
