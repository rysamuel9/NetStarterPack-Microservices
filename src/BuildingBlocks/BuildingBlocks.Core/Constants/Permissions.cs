namespace BuildingBlocks.Core.Constants;

public record PermissionDefinition(string Code, string Name, string Module, string Description);

/// <summary>
/// Konstanta permission granular yang dipakai bersama oleh Identity.Api, Catalog.Api, Order.Api, Workflow.Api, dan microservice lainnya.
/// </summary>
public static class Permissions
{
    public static class Dashboard
    {
        public const string View = "Dashboard.View";
    }

    public static class Users
    {
        public const string View = "Users.View";
        public const string Create = "Users.Create";
        public const string Edit = "Users.Edit";
        public const string Delete = "Users.Delete";
    }

    public static class Roles
    {
        public const string View = "Roles.View";
        public const string Manage = "Roles.Manage";
    }

    public static class Menus
    {
        public const string View = "Menus.View";
        public const string Manage = "Menus.Manage";
    }

    public static class Products
    {
        public const string View = "Products.View";
        public const string Create = "Products.Create";
        public const string Edit = "Products.Edit";
        public const string Delete = "Products.Delete";
    }

    public static class Orders
    {
        public const string View = "Orders.View";
        public const string Create = "Orders.Create";
        public const string Edit = "Orders.Edit";
        public const string Delete = "Orders.Delete";
    }

    public static class Workflows
    {
        public const string View = "Workflows.View";
        public const string Create = "Workflows.Create";
        public const string Approve = "Workflows.Approve";
        public const string ManageTemplates = "Workflows.ManageTemplates";
    }

    public static class Announcements
    {
        public const string View = "Announcements.View";
        public const string Manage = "Announcements.Manage";
    }

    public static class Organization
    {
        public const string View = "Organization.View";
        public const string Manage = "Organization.Manage";
    }

    public static class Reports
    {
        public const string View = "Reports.View";
        public const string Export = "Reports.Export";
    }

    public static class AuditLogs
    {
        public const string View = "AuditLogs.View";
    }

    public static IReadOnlyList<PermissionDefinition> GetAll() =>
    [
        new(Dashboard.View, "Lihat Dashboard", "Dashboard", "Akses halaman utama ringkasan sistem lintas microservice"),

        new(Users.View, "Lihat Pengguna", "Users", "Melihat daftar dan detail pengguna (Identity Service)"),
        new(Users.Create, "Tambah Pengguna", "Users", "Membuat akun pengguna baru (Identity Service)"),
        new(Users.Edit, "Ubah Pengguna", "Users", "Mengubah profil, role, dan status pengguna (Identity Service)"),
        new(Users.Delete, "Hapus Pengguna", "Users", "Menonaktifkan atau menghapus akun pengguna (Identity Service)"),

        new(Roles.View, "Lihat Role & Permission", "Roles", "Melihat daftar role dan matriks permission (Identity Service)"),
        new(Roles.Manage, "Kelola Role & Permission", "Roles", "Membuat, mengubah role, serta mengatur hak akses (Identity Service)"),

        new(Menus.View, "Lihat Konfigurasi Menu", "Menus", "Melihat struktur menu navigasi (Identity Service)"),
        new(Menus.Manage, "Kelola Menu", "Menus", "Mengatur menu dinamis dan visibilitas per role (Identity Service)"),

        new(Products.View, "Lihat Katalog / Item", "Products", "Melihat daftar item katalog (Catalog Microservice)"),
        new(Products.Create, "Tambah Katalog / Item", "Products", "Menambahkan item baru (Catalog Microservice)"),
        new(Products.Edit, "Ubah Katalog / Item", "Products", "Mengubah data item katalog (Catalog Microservice)"),
        new(Products.Delete, "Hapus Katalog / Item", "Products", "Menghapus item katalog (Catalog Microservice)"),

        new(Orders.View, "Lihat Pesanan / Order", "Orders", "Melihat daftar transaksi pesanan (Order Microservice)"),
        new(Orders.Create, "Buat Pesanan / Order", "Orders", "Membuat transaksi pesanan baru (Order Microservice)"),
        new(Orders.Edit, "Ubah Pesanan / Order", "Orders", "Mengubah status dan detail pesanan (Order Microservice)"),
        new(Orders.Delete, "Hapus Pesanan / Order", "Orders", "Menghapus/membatalkan data pesanan (Order Microservice)"),

        new(Workflows.View, "Lihat Tracking Pengajuan", "Workflows", "Melihat tracking list & riwayat approval pengajuan form (Workflow Microservice)"),
        new(Workflows.Create, "Buat Pengajuan Form", "Workflows", "Membuat dan men-submit formulir dinamis (Workflow Microservice)"),
        new(Workflows.Approve, "Approval Working List", "Workflows", "Menyetujui, meminta revisi, atau menolak dokumen di Working List (Workflow Microservice)"),
        new(Workflows.ManageTemplates, "Kelola Template Form", "Workflows", "Membuat dan mengubah skema form dinamis serta tahapan approval (Workflow Microservice)"),

        new(Announcements.View, "Lihat Pengumuman", "Announcements", "Melihat daftar, detail, notifikasi bel, like, dan komentar pengumuman (Announcement Microservice)"),
        new(Announcements.Manage, "Kelola Pengumuman (HR)", "Announcements", "Membuat, mengubah, menghapus pengumuman, upload banner/lampiran, dan on/off komentar (khusus Tim HR)"),

        new(Organization.View, "Lihat Struktur Organisasi", "Organization", "Melihat pohon struktur Direktorat, Divisi, Departemen, dan Master Posisi (Identity Service)"),
        new(Organization.Manage, "Kelola Master Organisasi", "Organization", "Membuat, mengubah, dan menghapus master Direktorat, Divisi, Departemen, dan Posisi (Identity Service)"),

        new(Reports.View, "Lihat Laporan & Analitik", "Reports", "Mengakses halaman laporan manajemen"),
        new(Reports.Export, "Ekspor Laporan", "Reports", "Mengunduh/mengekspor data laporan"),

        new(AuditLogs.View, "Lihat Audit Log", "AuditLogs", "Melihat riwayat aktivitas dan keamanan terpusat")
    ];
}
