# Panduan Role, Hak Akses (RBAC), & Tampilan UI per Peran

Dokumen ini merangkum seluruh **10 role bawaan** yang ada di **NetStarterPack Microservices**, tugas masing-masing role di skenario perusahaan, akun demo yang sudah di-seed otomatis, matriks permission lintas **7 microservice**, serta bagaimana UI di **Web React** dan **Mobile Expo** menyesuaikan tampilan otomatis sesuai role yang sedang login.

> **Password default seluruh akun demo:** `Password123!`  
> Sumber konfigurasi bawaan: [`RoleNames.cs`](../src/BuildingBlocks/BuildingBlocks.Core/Constants/RoleNames.cs), [`Permissions.cs`](../src/BuildingBlocks/BuildingBlocks.Core/Constants/Permissions.cs), dan [`IdentityDatabaseSeeder.cs`](../src/Services/Identity/Identity.Api/Infrastructure/Persistence/IdentityDatabaseSeeder.cs).

---

## 1. Daftar 10 Role Bawaan & Fungsinya

| No | Role (`RoleNames`) | Nama Tampilan | Akun Demo Utama | Peran & Tanggung Jawab Utama |
| :-: | :--- | :--- | :--- | :--- |
| 1 | **`SuperAdmin`** | Super Administrator | `superadmin` *(Budi Santoso / CTO)* | Akses penuh lintas seluruh 7 microservice. Lolos semua pengecekan `[HasPermission]` (bypass RBAC), mengelola user, role, menu, struktur organisasi, master lookups, template workflow, dispatch & operasi live tracking, dan audit trail. |
| 2 | **`Admin`** | Administrator | `admin` *(Siti Rahmawati / System Ops Manager)* | Pengelola operasional sistem harian: manajemen pengguna (lihat/tambah/ubah), melihat konfigurasi role & menu, CRUD penuh Katalog & Pesanan, kelola template Workflow & approval, kelola Master Lookups, kelola Organisasi, Dispatcher + Operator Live Tracking, Laporan, dan Audit Log. |
| 3 | **`Manager`** | Manager (Approver L1) | `manager` *(Andi Pratama / VP Eng)*, `reza.coo`, `clarissa.trs`, `fajar.ga` | Atasan langsung & **Approver Level 1** pada alur Workflow (Pengadaan Laptop, Cuti, Barang Kantor). Juga berperan sebagai **Dispatcher & Verifikator POD** di Live Tracking, pengelola Katalog & Pesanan (tanpa hapus), melihat User, Master Lookups, dan Laporan/Ekspor. |
| 4 | **`ITLead`** | IT Infrastructure Lead | `itlead` *(Hendra Wijaya / Head of IT Infra)* | **Approver Teknis (Level 2)** untuk validasi spesifikasi perangkat & pengadaan IT/Laptop di `Workflow.Api`. Memiliki akses baca Katalog Produk, Struktur Organisasi, Pengumuman, serta tampilan Mesh/Teknis di Dashboard. |
| 5 | **`HRManager`** | HR Manager | `hrmanager` *(Rina Kusuma / CHRO)* | **Approver Final (Level 2)** untuk validasi kuota & persetujuan pengajuan cuti karyawan. Pengelola penuh **HR Newsroom** (`Announcements.Manage`: buat/edit/hapus pengumuman, upload banner/lampiran, on/off komentar), kelola **Struktur Organisasi**, dan lihat daftar User. |
| 6 | **`HRSupervisor`** | HR Supervisor | `hrsupervisor` *(Dimas Prakoso)* | Supervisor tim HR & komunikasi internal: menerbitkan & mengelola Pengumuman HR (`Announcements.Manage`), mengelola master Struktur Organisasi (`Organization.Manage`), serta membuat & memantau pengajuan form sendiri. |
| 7 | **`HRStaff`** | HR Staff | `hrstaff` *(Nadia Putri)*, `citra.talent` | Staf operasional HR: menerbitkan & mengelola konten Pengumuman perusahaan (`Announcements.Manage`), upload banner/lampiran, melihat Struktur Organisasi, serta membuat & memantau pengajuan form. |
| 8 | **`FinanceDirector`** | Finance Director | `financedirector` *(Surya Darmawan)*, `angelica.cfo` | **Approver Budget & Final Sign-off** untuk pengadaan barang kantor dan perangkat IT. Memiliki akses baca Pesanan (`Orders.View`), Laporan & Ekspor Analitik (`Reports.View` / `Export`), Pengumuman, dan Struktur Organisasi. |
| 9 | **`Staff`** | Staff Operasional | `staff` *(Dewi Lestari)*, `yoga.proc`, `putri.ops`, `bambang.ga`, `rafi.be`, `tiara.fe` | Eksekutor operasional harian & **Petugas Lapangan (Field Officer)**. Dapat membuat pengajuan form, mengelola Katalog & Pesanan (tanpa hapus), serta menjalankan **Live Tracking** (`Tracking.Operate` — hanya untuk tugas yang ditugaskan ke dirinya sendiri berkat proteksi **Anti-IDOR**). |
| 10 | **`Viewer`** | Viewer / Auditor | `viewer` *(Rizky Ramadhan / Head of Internal Audit)*, `luthfi.audit` | Akses **Read-Only (baca saja)** untuk keperluan audit & pemantauan: bisa melihat Dashboard, Katalog, Pesanan, Tracking Pengajuan, **Live Tracking semua petugas (tanpa bisa ubah/dispatch)**, Master Lookups, Struktur Organisasi, dan Pengumuman. |

---

## 2. Matriks Permission per Role (Lintas 7 Microservice)

Keterangan: `✅` = Diizinkan penuh pada kategori, `👁️` = Read-only (`*.View`), `✍️` = Operasional terbatas (tanpa delete/manage), `—` = Tidak punya akses.

| Modul / Microservice | Permission | SuperAdmin | Admin | Manager | ITLead | HRManager | HRSupervisor | HRStaff | FinanceDirector | Staff | Viewer |
| :--- | :--- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| **Dashboard** (`:5081`) | `Dashboard.View` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Users** (`:5081`) | `Users.View/Create/Edit/Delete` | ✅ Full | ✍️ V/C/E | 👁️ View | — | 👁️ View | — | — | — | — | — |
| **Roles** (`:5081`) | `Roles.View/Manage` | ✅ Full | 👁️ View | — | — | — | — | — | — | — | — |
| **Menus** (`:5081`) | `Menus.View/Manage` | ✅ Full | 👁️ View | — | — | — | — | — | — | — | — |
| **Organization** (`:5081`) | `Organization.View/Manage` | ✅ Full | ✅ Full | 👁️ View | 👁️ View | ✅ Full | ✅ Full | 👁️ View | 👁️ View | 👁️ View | 👁️ View |
| **Audit Logs** (`:5081`) | `AuditLogs.View` | ✅ | ✅ | — | — | — | — | — | — | — | — |
| **Products** (`:5082`) | `Products.View/Create/Edit/Delete` | ✅ Full | ✅ Full | ✍️ V/C/E | 👁️ View | — | — | — | — | ✍️ V/C/E | 👁️ View |
| **Orders** (`:5083`) | `Orders.View/Create/Edit/Delete` | ✅ Full | ✅ Full | ✍️ V/C/E | — | — | — | — | 👁️ View | ✍️ V/C/E | 👁️ View |
| **Workflows** (`:5084`) | `View / Create / Approve / ManageTemplates` | ✅ Full | ✅ Full | ✍️ V/C/A | ✍️ V/C/A | ✍️ V/C/A | ✍️ V/C | ✍️ V/C | ✍️ V/C/A | ✍️ V/C | 👁️ View |
| **Announcements** (`:5085`) | `Announcements.View/Manage` | ✅ Full | 👁️ View | 👁️ View | 👁️ View | ✅ Full | ✅ Full | ✅ Full | 👁️ View | 👁️ View | 👁️ View |
| **MasterData** (`:5086`) | `Lookups.View/Manage` | ✅ Full | ✅ Full | 👁️ View | — | — | — | — | — | — | 👁️ View |
| **Live Tracking** (`:5087`) | `Tracking.View/Dispatch/Operate` | ✅ Full | ✅ Full | ✅ Full | — | — | — | — | — | ✍️ V+Op | 👁️ View |
| **Reports** (`:5081..84`) | `Reports.View/Export` | ✅ Full | ✅ Full | ✅ Full | — | — | — | — | ✅ Full | — | — |

---

## 3. Penyesuaian Tampilan UI per Role (Web & Mobile)

Supaya setiap user tidak dibingungkan oleh menu atau tombol teknis yang bukan bagian pekerjaannya, UI di **Web React (`frontend/`)** dan **Mobile Expo (`mobile/`)** otomatis beradaptasi berdasarkan **Role & Permission JWT**:

### A. Sidebar, Topbar, & Bottom Navigation
- **Menu Dinamis dari Server (`/api/menus/my-menus`)**: Sidebar Web & Tab "Menu" di Mobile hanya menampilkan modul yang diizinkan untuk role tersebut.
- **Elemen Teknis / Developer (Web `Layout.tsx`)**:
  - Strip **Active Cluster Nodes (`:5080–:5087`)**, **Unified Swagger**, dan **Scalar Docs** hanya tampil untuk role teknis/admin (`SuperAdmin`, `Admin`, `ITLead`, atau pemegang `AuditLogs.View` / `Roles.View`).
  - Untuk role bisnis (`Staff`, `Manager`, `HR*`, `FinanceDirector`, `Viewer`), topbar menampilkan label workspace yang relevan (misal: *Workspace Petugas & Operasional*, *Workspace Manager & Approver*, *Workspace HR & People Ops*, *Mode Audit Read-Only*).
- **Bottom Tab Mobile (`mobile/app/(tabs)/_layout.tsx`)**:
  - Tab **Approval** otomatis disembunyikan untuk role non-approver (`Staff`, `HRSupervisor`, `HRStaff`, `Viewer`) sehingga navigasi bawah jauh lebih ringkas dan fokus ke **Home**, **Info**, **Menu**, dan **Profil**.

### B. Dashboard Utama (Web & Mobile)
- **Mode Teknis / Mesh Control (`SuperAdmin`, `Admin`, `ITLead`)**:
  - Menampilkan diagram **Topologi Live Cluster & 7 Isolated Database**, status health & latency tiap microservice, seluruh KPI lintas 7 service, klaim JWT, distribusi role, dan stream audit event.
- **Mode Workspace Operasional (`Staff`, `Manager`, `HR*`, `FinanceDirector`, `Viewer`)**:
  - Menyembunyikan detail infrastruktur mentah (port internal, nama database SQL, Swagger, raw JWT claims).
  - Menampilkan **Kartu Aksi Cepat (Quick Actions)** sesuai izin role: misalnya untuk `Staff` langsung menonjolkan **Tugas Lapangan Saya (Live Tracking)**, **Buat Pengajuan Form**, **Katalog**, **Pesanan**, dan **Pengumuman HR**; untuk `Manager` menonjolkan **Working List Approval** dan **Verifikasi Live Tracking**.

### C. Halaman Live Tracking (`Tracking.Api :5087`)
Modul Live Tracking menerapkan 3 mode tampilan otomatis + proteksi server-side:

| Mode | Role | Apa yang Terlihat di Web & Mobile |
| :--- | :--- | :--- |
| **Mode Dispatcher / Command Center** | `SuperAdmin`, `Admin`, `Manager` (`Tracking.Dispatch`) | Melihat **semua petugas** di peta Command Center secara realtime, tombol **Buat Tugas Lapangan** (map picker + radius geofence), tombol **Batalkan Tugas**, panel **Verifikasi POD (Setujui / Tolak)** untuk tugas `PendingVerification`, dan kartu indikator **Flag Anomali GPS**. |
| **Mode Petugas Lapangan** | `Staff` (`Tracking.Operate` tanpa `Tracking.Dispatch`) | Judul & filter fokus ke **Tugas Lapangan Saya** (server menerapkan **Anti-IDOR**, hanya mengembalikan tugas milik petugas tersebut). Tersedia kontrol eksekusi lengkap: **Mulai Perjalanan**, **Live GPS Asli**, **3 Skenario Simulasi Rute** (Normal, Luar Geofence, Test Fake GPS), **Check-In Tiba**, **Lapor Kendala**, dan **Upload POD & Selesai**. |
| **Mode Auditor (Read-Only)** | `Viewer` (`Tracking.View` saja) | Dapat memantau seluruh daftar tugas, peta rute, breadcrumb, detail POD + preview foto fullscreen, dan timeline status tanpa tombol ubah/dispatch/verifikasi. |

---

## 4. Alur Kolaborasi Lintas Role di Project Ini

1. **Alur Workflow Approval Multi-Level (`Workflow.Api :5084`)**
   - `Staff` membuat pengajuan form (Pengadaan Laptop / Cuti / Barang Kantor) → masuk ke Working List `Manager` (L1) → lanjut ke `ITLead` / `HRManager` / `FinanceDirector` (L2/L3) → `Staff` memantau progres & revisi di Tracking Pengajuan.
2. **Alur HR Newsroom (`Announcement.Api :5085`)**
   - `HRStaff` / `HRSupervisor` / `HRManager` menerbitkan pengumuman dengan banner & lampiran → seluruh 10 role menerima notifikasi bel realtime via SignalR, bisa membaca, like, dan berkomentar.
3. **Alur Field Dispatch & Live Tracking (`Tracking.Api :5087`)**
   - `Manager` / `Admin` membuat tugas lapangan & tentukan titik tujuan + radius geofence → `Staff` membuka aplikasi Mobile/Web, menyalakan Live GPS (atau simulasi rute) → `Manager` memantau pergerakan marker secara live di peta → `Staff` mengunggah foto bukti POD + nama penerima + catatan:
     - Jika **di dalam radius geofence** & GPS valid → otomatis **Selesai (`Completed`)**.
     - Jika **di luar radius geofence** atau terdeteksi **Mock GPS / Impossible Travel** → otomatis masuk **Perlu Verifikasi (`PendingVerification`)** agar `Manager` meninjau foto POD & posisi peta sebelum klik **Setujui** atau **Tolak**.

---

## 5. Cara Mengubah / Menambah Role Baru

- **Lewat UI (Runtime, tanpa coding):** Login sebagai `superadmin` → buka menu **Role & Permission** (`/roles`) untuk membuat role baru dan mencentang permission, lalu buka **Manajemen Menu** (`/menus`) untuk mengatur visibilitas menu sidebar/mobile.
- **Lewat Kode (Permanent Seed):** Tambahkan konstanta di [`RoleNames.cs`](../src/BuildingBlocks/BuildingBlocks.Core/Constants/RoleNames.cs), lalu daftarkan role, permission, menu, dan akun default di [`IdentityDatabaseSeeder.cs`](../src/Services/Identity/Identity.Api/Infrastructure/Persistence/IdentityDatabaseSeeder.cs).
