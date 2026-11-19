using BuildingBlocks.Core.Constants;
using Identity.Api.Application.Interfaces;
using Identity.Api.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Identity.Api.Infrastructure.Persistence;

public class IdentityDatabaseSeeder(
    IdentityDbContext dbContext,
    IPasswordHasher passwordHasher,
    ILogger<IdentityDatabaseSeeder> logger)
{
    public async Task SeedAsync(CancellationToken cancellationToken = default)
    {
        if (dbContext.Database.IsRelational())
        {
            var pendingMigrations = await dbContext.Database.GetPendingMigrationsAsync(cancellationToken);
            if (pendingMigrations.Any())
            {
                await dbContext.Database.MigrateAsync(cancellationToken);
            }
            else
            {
                await dbContext.Database.EnsureCreatedAsync(cancellationToken);
            }
        }
        else
        {
            await dbContext.Database.EnsureCreatedAsync(cancellationToken);
        }

        if (await dbContext.Roles.AnyAsync(cancellationToken))
        {
            await EnsureOrderMicroserviceMenuAndPermissionsAsync(cancellationToken);
            return;
        }

        logger.LogInformation("Seeding initial Identity roles, permissions, menus, and users into NetStarterPack_IdentityDb...");

        var superAdminRole = new Role
        {
            Name = RoleNames.SuperAdmin,
            DisplayName = "Super Administrator",
            Description = "Akses penuh ke seluruh microservice, manajemen pengguna, role, menu, dan konfigurasi.",
            BadgeColor = "rose",
            IsSystemRole = true,
            CreatedBy = "SystemSeeder"
        };

        var adminRole = new Role
        {
            Name = RoleNames.Admin,
            DisplayName = "Administrator",
            Description = "Mengelola pengguna operasional, data katalog, transaksi pesanan, laporan, dan audit log.",
            BadgeColor = "indigo",
            IsSystemRole = true,
            CreatedBy = "SystemSeeder"
        };

        var managerRole = new Role
        {
            Name = RoleNames.Manager,
            DisplayName = "Manager (Dummy Role)",
            Description = "Melihat tim, mengelola katalog & transaksi pesanan, serta melihat dan mengekspor laporan.",
            BadgeColor = "amber",
            IsSystemRole = false,
            CreatedBy = "SystemSeeder"
        };

        var staffRole = new Role
        {
            Name = RoleNames.Staff,
            DisplayName = "Staff Operasional (Dummy Role)",
            Description = "Mengelola operasional harian di Catalog & Order Microservice (tambah & ubah item/pesanan).",
            BadgeColor = "emerald",
            IsSystemRole = false,
            CreatedBy = "SystemSeeder"
        };

        var viewerRole = new Role
        {
            Name = RoleNames.Viewer,
            DisplayName = "Viewer / Guest (Dummy Role)",
            Description = "Akses baca saja (read-only) untuk melihat dashboard, daftar katalog, dan daftar pesanan.",
            BadgeColor = "slate",
            IsSystemRole = false,
            CreatedBy = "SystemSeeder"
        };

        var allRoles = new[] { superAdminRole, adminRole, managerRole, staffRole, viewerRole };
        await dbContext.Roles.AddRangeAsync(allRoles, cancellationToken);

        var rolePermissionsMap = new Dictionary<Role, string[]>
        {
            [superAdminRole] = Permissions.GetAll().Select(p => p.Code).ToArray(),
            [adminRole] =
            [
                Permissions.Dashboard.View,
                Permissions.Users.View, Permissions.Users.Create, Permissions.Users.Edit,
                Permissions.Roles.View,
                Permissions.Menus.View,
                Permissions.Products.View, Permissions.Products.Create, Permissions.Products.Edit, Permissions.Products.Delete,
                Permissions.Orders.View, Permissions.Orders.Create, Permissions.Orders.Edit, Permissions.Orders.Delete,
                Permissions.Reports.View, Permissions.Reports.Export,
                Permissions.AuditLogs.View
            ],
            [managerRole] =
            [
                Permissions.Dashboard.View,
                Permissions.Users.View,
                Permissions.Products.View, Permissions.Products.Create, Permissions.Products.Edit,
                Permissions.Orders.View, Permissions.Orders.Create, Permissions.Orders.Edit,
                Permissions.Reports.View, Permissions.Reports.Export
            ],
            [staffRole] =
            [
                Permissions.Dashboard.View,
                Permissions.Products.View, Permissions.Products.Create, Permissions.Products.Edit,
                Permissions.Orders.View, Permissions.Orders.Create, Permissions.Orders.Edit
            ],
            [viewerRole] =
            [
                Permissions.Dashboard.View,
                Permissions.Products.View,
                Permissions.Orders.View
            ]
        };

        foreach (var (role, codes) in rolePermissionsMap)
        {
            foreach (var code in codes.Distinct())
            {
                await dbContext.RolePermissions.AddAsync(new RolePermission
                {
                    RoleId = role.Id,
                    PermissionCode = code,
                    CreatedBy = "SystemSeeder"
                }, cancellationToken);
            }
        }

        var menus = new List<(MenuItem Menu, Role[] AllowedRoles)>
        {
            (new MenuItem
            {
                Code = "dashboard",
                Title = "Mesh Dashboard",
                Path = "/dashboard",
                Icon = "LayoutDashboard",
                GroupName = "MAIN",
                SortOrder = 1,
                RequiredPermission = Permissions.Dashboard.View,
                IsVisible = true,
                Description = "Topologi live microservice, metrik lintas DB, dan stream aktivitas terpusat",
                CreatedBy = "SystemSeeder"
            }, [superAdminRole, adminRole, managerRole, staffRole, viewerRole]),

            (new MenuItem
            {
                Code = "products",
                Title = "Katalog (Catalog.Api)",
                Path = "/products",
                Icon = "Package",
                GroupName = "MICROSERVICES",
                SortOrder = 2,
                RequiredPermission = Permissions.Products.View,
                IsVisible = true,
                Description = "Microservice 1: CRUD Produk di Port 5082 (DB: NetStarterPack_CatalogDb)",
                CreatedBy = "SystemSeeder"
            }, [superAdminRole, adminRole, managerRole, staffRole, viewerRole]),

            (new MenuItem
            {
                Code = "orders",
                Title = "Pesanan (Order.Api)",
                Path = "/orders",
                Icon = "ShoppingCart",
                GroupName = "MICROSERVICES",
                SortOrder = 3,
                RequiredPermission = Permissions.Orders.View,
                IsVisible = true,
                Description = "Microservice 2 (Example 2): CRUD Transaksi Pesanan di Port 5083 (DB: NetStarterPack_OrderDb)",
                CreatedBy = "SystemSeeder"
            }, [superAdminRole, adminRole, managerRole, staffRole, viewerRole]),

            (new MenuItem
            {
                Code = "reports",
                Title = "Laporan & Analitik",
                Path = "/reports",
                Icon = "BarChart3",
                GroupName = "MICROSERVICES",
                SortOrder = 4,
                RequiredPermission = Permissions.Reports.View,
                IsVisible = true,
                Description = "Agregasi analitik lintas microservice (Catalog.Api & Order.Api)",
                CreatedBy = "SystemSeeder"
            }, [superAdminRole, adminRole, managerRole]),

            (new MenuItem
            {
                Code = "users",
                Title = "Manajemen Pengguna",
                Path = "/users",
                Icon = "Users",
                GroupName = "IDENTITY & RBAC",
                SortOrder = 5,
                RequiredPermission = Permissions.Users.View,
                IsVisible = true,
                Description = "Kelola akun pengguna, status aktif, dan penugasan role (Identity.Api :5081)",
                CreatedBy = "SystemSeeder"
            }, [superAdminRole, adminRole, managerRole]),

            (new MenuItem
            {
                Code = "roles",
                Title = "Role & Permission",
                Path = "/roles",
                Icon = "ShieldCheck",
                GroupName = "IDENTITY & RBAC",
                SortOrder = 6,
                RequiredPermission = Permissions.Roles.View,
                IsVisible = true,
                Description = "Konfigurasi role dinamis, matriks permission Zero-Trust JWT, dan hak akses menu",
                CreatedBy = "SystemSeeder"
            }, [superAdminRole, adminRole]),

            (new MenuItem
            {
                Code = "menus",
                Title = "Manajemen Menu",
                Path = "/menus",
                Icon = "Menu",
                GroupName = "SYSTEM MESH",
                SortOrder = 7,
                RequiredPermission = Permissions.Menus.View,
                IsVisible = true,
                Description = "Atur struktur navigasi menu sidebar secara dinamis per role",
                CreatedBy = "SystemSeeder"
            }, [superAdminRole, adminRole]),

            (new MenuItem
            {
                Code = "audit-logs",
                Title = "Event & Audit Stream",
                Path = "/audit-logs",
                Icon = "Activity",
                GroupName = "SYSTEM MESH",
                SortOrder = 8,
                RequiredPermission = Permissions.AuditLogs.View,
                IsVisible = true,
                Description = "Riwayat event audit terpusat dari Identity.Api, Catalog.Api, dan Order.Api",
                CreatedBy = "SystemSeeder"
            }, [superAdminRole, adminRole]),

            (new MenuItem
            {
                Code = "profile",
                Title = "Profil & Keamanan",
                Path = "/profile",
                Icon = "UserCircle",
                GroupName = "ACCOUNT",
                SortOrder = 9,
                RequiredPermission = null,
                IsVisible = true,
                Description = "Pengaturan profil pengguna yang sedang login dan ubah password",
                CreatedBy = "SystemSeeder"
            }, [superAdminRole, adminRole, managerRole, staffRole, viewerRole])
        };

        foreach (var (menu, allowedRoles) in menus)
        {
            await dbContext.MenuItems.AddAsync(menu, cancellationToken);
            foreach (var role in allowedRoles)
            {
                await dbContext.RoleMenus.AddAsync(new RoleMenu
                {
                    RoleId = role.Id,
                    MenuItemId = menu.Id,
                    CreatedBy = "SystemSeeder"
                }, cancellationToken);
            }
        }

        var defaultPasswordHash = passwordHasher.HashPassword("Password123!");
        var usersToSeed = new List<(User User, Role Role)>
        {
            (new User
            {
                Username = "superadmin",
                Email = "superadmin@starterpack.local",
                FullName = "Budi Santoso (Super Admin)",
                PasswordHash = defaultPasswordHash,
                PhoneNumber = "+62 811-1000-001",
                Department = "IT & Microservices Architecture",
                Status = UserStatus.Active,
                CreatedBy = "SystemSeeder"
            }, superAdminRole),
            (new User
            {
                Username = "admin",
                Email = "admin@starterpack.local",
                FullName = "Siti Rahmawati (Admin)",
                PasswordHash = defaultPasswordHash,
                PhoneNumber = "+62 811-1000-002",
                Department = "System Operations",
                Status = UserStatus.Active,
                CreatedBy = "SystemSeeder"
            }, adminRole),
            (new User
            {
                Username = "manager",
                Email = "manager@starterpack.local",
                FullName = "Andi Pratama (Manager)",
                PasswordHash = defaultPasswordHash,
                PhoneNumber = "+62 811-1000-003",
                Department = "Business & Planning",
                Status = UserStatus.Active,
                CreatedBy = "SystemSeeder"
            }, managerRole),
            (new User
            {
                Username = "staff",
                Email = "staff@starterpack.local",
                FullName = "Dewi Lestari (Staff)",
                PasswordHash = defaultPasswordHash,
                PhoneNumber = "+62 811-1000-004",
                Department = "Operational Catalog & Order",
                Status = UserStatus.Active,
                CreatedBy = "SystemSeeder"
            }, staffRole),
            (new User
            {
                Username = "viewer",
                Email = "viewer@starterpack.local",
                FullName = "Rizky Ramadhan (Viewer)",
                PasswordHash = defaultPasswordHash,
                PhoneNumber = "+62 811-1000-005",
                Department = "Internal Audit / Guest",
                Status = UserStatus.Active,
                CreatedBy = "SystemSeeder"
            }, viewerRole)
        };

        foreach (var (user, role) in usersToSeed)
        {
            await dbContext.Users.AddAsync(user, cancellationToken);
            await dbContext.UserRoles.AddAsync(new UserRole
            {
                UserId = user.Id,
                RoleId = role.Id,
                CreatedBy = "SystemSeeder"
            }, cancellationToken);
        }

        await dbContext.AuditLogs.AddAsync(new AuditLog
        {
            UserName = "SystemSeeder",
            Action = "MICROSERVICE_SEEDED",
            Module = "System",
            Details = "[Identity.Api] Database NetStarterPack_IdentityDb berhasil di-seed (5 role, 20 permission, 9 menu, 5 akun user).",
            IpAddress = "127.0.0.1",
            Timestamp = DateTime.UtcNow
        }, cancellationToken);

        await dbContext.SaveChangesAsync(cancellationToken);
        logger.LogInformation("Identity database seeded successfully!");
    }

    private async Task EnsureOrderMicroserviceMenuAndPermissionsAsync(CancellationToken cancellationToken)
    {
        if (await dbContext.MenuItems.AnyAsync(m => m.Code == "orders", cancellationToken))
        {
            return;
        }

        var roles = await dbContext.Roles.Include(r => r.RolePermissions).ToListAsync(cancellationToken);
        var orderMenu = new MenuItem
        {
            Code = "orders",
            Title = "Pesanan (Order.Api)",
            Path = "/orders",
            Icon = "ShoppingCart",
            GroupName = "MICROSERVICES",
            SortOrder = 3,
            RequiredPermission = Permissions.Orders.View,
            IsVisible = true,
            Description = "Microservice 2 (Example 2): CRUD Transaksi Pesanan di Port 5083 (DB: NetStarterPack_OrderDb)",
            CreatedBy = "SystemSeeder"
        };

        await dbContext.MenuItems.AddAsync(orderMenu, cancellationToken);

        foreach (var role in roles)
        {
            await dbContext.RoleMenus.AddAsync(new RoleMenu
            {
                RoleId = role.Id,
                MenuItemId = orderMenu.Id,
                CreatedBy = "SystemSeeder"
            }, cancellationToken);

            var permsToAdd = role.Name switch
            {
                RoleNames.SuperAdmin or RoleNames.Admin => new[]
                {
                    Permissions.Orders.View, Permissions.Orders.Create, Permissions.Orders.Edit, Permissions.Orders.Delete
                },
                RoleNames.Manager or RoleNames.Staff => new[]
                {
                    Permissions.Orders.View, Permissions.Orders.Create, Permissions.Orders.Edit
                },
                _ => new[] { Permissions.Orders.View }
            };

            foreach (var code in permsToAdd)
            {
                if (!role.RolePermissions.Any(rp => rp.PermissionCode == code))
                {
                    await dbContext.RolePermissions.AddAsync(new RolePermission
                    {
                        RoleId = role.Id,
                        PermissionCode = code,
                        CreatedBy = "SystemSeeder"
                    }, cancellationToken);
                }
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        logger.LogInformation("[Identity.Api] Auto-upgraded existing Identity database with Order.Api menu and permissions.");
    }
}
