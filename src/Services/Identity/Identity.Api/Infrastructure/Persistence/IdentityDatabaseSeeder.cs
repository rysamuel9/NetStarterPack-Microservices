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
            await EnsureWorkflowRolesUsersAndMenusAsync(cancellationToken);
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
            Description = "Mengelola pengguna operasional, template form workflow, katalog, pesanan, laporan, dan audit log.",
            BadgeColor = "indigo",
            IsSystemRole = true,
            CreatedBy = "SystemSeeder"
        };

        var managerRole = new Role
        {
            Name = RoleNames.Manager,
            DisplayName = "Manager (Approver Level 1)",
            Description = "Atasan langsung (Approver L1 untuk Pengadaan Laptop, Cuti, & Barang Kantor) serta operasional bisnis.",
            BadgeColor = "amber",
            IsSystemRole = false,
            CreatedBy = "SystemSeeder"
        };

        var itLeadRole = new Role
        {
            Name = RoleNames.ITLead,
            DisplayName = "IT Infrastructure Lead",
            Description = "Approver teknis (L2) untuk validasi spesifikasi perangkat & pengadaan IT (Laptop/Hardware).",
            BadgeColor = "cyan",
            IsSystemRole = false,
            CreatedBy = "SystemSeeder"
        };

        var hrManagerRole = new Role
        {
            Name = RoleNames.HRManager,
            DisplayName = "HR Manager",
            Description = "Approver final (L2) untuk validasi kuota & persetujuan pengajuan cuti karyawan.",
            BadgeColor = "violet",
            IsSystemRole = false,
            CreatedBy = "SystemSeeder"
        };

        var financeDirectorRole = new Role
        {
            Name = RoleNames.FinanceDirector,
            DisplayName = "Finance Director",
            Description = "Approver budget & final sign-off untuk pengadaan barang kantor dan pengadaan laptop.",
            BadgeColor = "teal",
            IsSystemRole = false,
            CreatedBy = "SystemSeeder"
        };

        var staffRole = new Role
        {
            Name = RoleNames.Staff,
            DisplayName = "Staff Operasional",
            Description = "Mengelola operasional harian & membuat pengajuan form (Pengadaan Laptop, Cuti, Barang Kantor).",
            BadgeColor = "emerald",
            IsSystemRole = false,
            CreatedBy = "SystemSeeder"
        };

        var viewerRole = new Role
        {
            Name = RoleNames.Viewer,
            DisplayName = "Viewer / Auditor",
            Description = "Akses baca saja (read-only) untuk dashboard, katalog, pesanan, dan tracking progres pengajuan.",
            BadgeColor = "slate",
            IsSystemRole = false,
            CreatedBy = "SystemSeeder"
        };

        var allRoles = new[]
        {
            superAdminRole, adminRole, managerRole, itLeadRole, hrManagerRole, financeDirectorRole, staffRole, viewerRole
        };
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
                Permissions.Workflows.View, Permissions.Workflows.Create, Permissions.Workflows.Approve, Permissions.Workflows.ManageTemplates,
                Permissions.Reports.View, Permissions.Reports.Export,
                Permissions.AuditLogs.View
            ],
            [managerRole] =
            [
                Permissions.Dashboard.View,
                Permissions.Users.View,
                Permissions.Products.View, Permissions.Products.Create, Permissions.Products.Edit,
                Permissions.Orders.View, Permissions.Orders.Create, Permissions.Orders.Edit,
                Permissions.Workflows.View, Permissions.Workflows.Create, Permissions.Workflows.Approve,
                Permissions.Reports.View, Permissions.Reports.Export
            ],
            [itLeadRole] =
            [
                Permissions.Dashboard.View,
                Permissions.Products.View,
                Permissions.Workflows.View, Permissions.Workflows.Create, Permissions.Workflows.Approve
            ],
            [hrManagerRole] =
            [
                Permissions.Dashboard.View,
                Permissions.Users.View,
                Permissions.Workflows.View, Permissions.Workflows.Create, Permissions.Workflows.Approve
            ],
            [financeDirectorRole] =
            [
                Permissions.Dashboard.View,
                Permissions.Orders.View,
                Permissions.Workflows.View, Permissions.Workflows.Create, Permissions.Workflows.Approve,
                Permissions.Reports.View, Permissions.Reports.Export
            ],
            [staffRole] =
            [
                Permissions.Dashboard.View,
                Permissions.Products.View, Permissions.Products.Create, Permissions.Products.Edit,
                Permissions.Orders.View, Permissions.Orders.Create, Permissions.Orders.Edit,
                Permissions.Workflows.View, Permissions.Workflows.Create
            ],
            [viewerRole] =
            [
                Permissions.Dashboard.View,
                Permissions.Products.View,
                Permissions.Orders.View,
                Permissions.Workflows.View
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

        var approverRoles = new[] { superAdminRole, adminRole, managerRole, itLeadRole, hrManagerRole, financeDirectorRole };
        var creatorRoles = new[] { superAdminRole, adminRole, managerRole, itLeadRole, hrManagerRole, financeDirectorRole, staffRole };

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
            }, allRoles),

            (new MenuItem
            {
                Code = "workflow-create",
                Title = "Buat Pengajuan Form",
                Path = "/workflow-create",
                Icon = "FilePlus2",
                GroupName = "WORKFLOW & APPROVAL",
                SortOrder = 2,
                RequiredPermission = Permissions.Workflows.Create,
                IsVisible = true,
                Description = "Form dinamis berbasis tipe dokumen (Laptop, Cuti, Barang Kantor) + preview alur approval",
                CreatedBy = "SystemSeeder"
            }, creatorRoles),

            (new MenuItem
            {
                Code = "workflow-working-list",
                Title = "Working List (Approval)",
                Path = "/workflow-working-list",
                Icon = "ClipboardCheck",
                GroupName = "WORKFLOW & APPROVAL",
                SortOrder = 3,
                RequiredPermission = Permissions.Workflows.Approve,
                IsVisible = true,
                Description = "Inbox antrean persetujuan (Approve / Revisi / Reject) khusus untuk role approver aktif",
                CreatedBy = "SystemSeeder"
            }, approverRoles),

            (new MenuItem
            {
                Code = "workflow-tracking",
                Title = "Tracking Pengajuan",
                Path = "/workflow-tracking",
                Icon = "GitBranch",
                GroupName = "WORKFLOW & APPROVAL",
                SortOrder = 4,
                RequiredPermission = Permissions.Workflows.View,
                IsVisible = true,
                Description = "Pantau posisi approver saat ini, riwayat approval, dan edit/submit ulang dokumen revisi",
                CreatedBy = "SystemSeeder"
            }, allRoles),

            (new MenuItem
            {
                Code = "products",
                Title = "Katalog (Catalog.Api)",
                Path = "/products",
                Icon = "Package",
                GroupName = "MICROSERVICES",
                SortOrder = 5,
                RequiredPermission = Permissions.Products.View,
                IsVisible = true,
                Description = "Microservice 1: CRUD Produk di Port 5082 (DB: NetStarterPack_CatalogDb)",
                CreatedBy = "SystemSeeder"
            }, [superAdminRole, adminRole, managerRole, itLeadRole, staffRole, viewerRole]),

            (new MenuItem
            {
                Code = "orders",
                Title = "Pesanan (Order.Api)",
                Path = "/orders",
                Icon = "ShoppingCart",
                GroupName = "MICROSERVICES",
                SortOrder = 6,
                RequiredPermission = Permissions.Orders.View,
                IsVisible = true,
                Description = "Microservice 2 (Example 2): CRUD Transaksi Pesanan di Port 5083 (DB: NetStarterPack_OrderDb)",
                CreatedBy = "SystemSeeder"
            }, [superAdminRole, adminRole, managerRole, financeDirectorRole, staffRole, viewerRole]),

            (new MenuItem
            {
                Code = "reports",
                Title = "Laporan & Analitik",
                Path = "/reports",
                Icon = "BarChart3",
                GroupName = "MICROSERVICES",
                SortOrder = 7,
                RequiredPermission = Permissions.Reports.View,
                IsVisible = true,
                Description = "Agregasi analitik lintas microservice (Catalog.Api, Order.Api, & Workflow.Api)",
                CreatedBy = "SystemSeeder"
            }, [superAdminRole, adminRole, managerRole, financeDirectorRole]),

            (new MenuItem
            {
                Code = "users",
                Title = "Manajemen Pengguna",
                Path = "/users",
                Icon = "Users",
                GroupName = "IDENTITY & RBAC",
                SortOrder = 8,
                RequiredPermission = Permissions.Users.View,
                IsVisible = true,
                Description = "Kelola akun pengguna, status aktif, dan penugasan role (Identity.Api :5081)",
                CreatedBy = "SystemSeeder"
            }, [superAdminRole, adminRole, managerRole, hrManagerRole]),

            (new MenuItem
            {
                Code = "roles",
                Title = "Role & Permission",
                Path = "/roles",
                Icon = "ShieldCheck",
                GroupName = "IDENTITY & RBAC",
                SortOrder = 9,
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
                SortOrder = 10,
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
                SortOrder = 11,
                RequiredPermission = Permissions.AuditLogs.View,
                IsVisible = true,
                Description = "Riwayat event audit terpusat dari Identity.Api, Catalog.Api, Order.Api, & Workflow.Api",
                CreatedBy = "SystemSeeder"
            }, [superAdminRole, adminRole]),

            (new MenuItem
            {
                Code = "profile",
                Title = "Profil & Keamanan",
                Path = "/profile",
                Icon = "UserCircle",
                GroupName = "ACCOUNT",
                SortOrder = 12,
                RequiredPermission = null,
                IsVisible = true,
                Description = "Pengaturan profil pengguna yang sedang login dan ubah password",
                CreatedBy = "SystemSeeder"
            }, allRoles)
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
                Department = "Business & Engineering Ops",
                Status = UserStatus.Active,
                CreatedBy = "SystemSeeder"
            }, managerRole),
            (new User
            {
                Username = "itlead",
                Email = "itlead@starterpack.local",
                FullName = "Hendra Wijaya (IT Lead)",
                PasswordHash = defaultPasswordHash,
                PhoneNumber = "+62 811-1000-006",
                Department = "IT Infrastructure & Security",
                Status = UserStatus.Active,
                CreatedBy = "SystemSeeder"
            }, itLeadRole),
            (new User
            {
                Username = "hrmanager",
                Email = "hrmanager@starterpack.local",
                FullName = "Rina Kusuma (HR Manager)",
                PasswordHash = defaultPasswordHash,
                PhoneNumber = "+62 811-1000-007",
                Department = "Human Resources & People Ops",
                Status = UserStatus.Active,
                CreatedBy = "SystemSeeder"
            }, hrManagerRole),
            (new User
            {
                Username = "financedirector",
                Email = "finance@starterpack.local",
                FullName = "Surya Darmawan (Finance Director)",
                PasswordHash = defaultPasswordHash,
                PhoneNumber = "+62 811-1000-008",
                Department = "Finance & Procurement Budget",
                Status = UserStatus.Active,
                CreatedBy = "SystemSeeder"
            }, financeDirectorRole),
            (new User
            {
                Username = "staff",
                Email = "staff@starterpack.local",
                FullName = "Dewi Lestari (Staff)",
                PasswordHash = defaultPasswordHash,
                PhoneNumber = "+62 811-1000-004",
                Department = "Operational & Product Team",
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
            Details = "[Identity.Api] Database NetStarterPack_IdentityDb berhasil di-seed (8 role organisasi, 24 permission, 12 menu, 8 akun user).",
            IpAddress = "127.0.0.1",
            Timestamp = DateTime.UtcNow
        }, cancellationToken);

        await dbContext.SaveChangesAsync(cancellationToken);
        logger.LogInformation("Identity database seeded successfully with corporate workflow roles & users!");
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
            SortOrder = 6,
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

    /// <summary>
    /// Auto-upgrade aman untuk database Identity existing (tanpa perlu DROP DATABASE):
    /// menambahkan 3 role korporat baru (ITLead, HRManager, FinanceDirector), 3 akun demo baru,
    /// 4 permission Workflows.*, dan 3 menu sidebar (Buat Pengajuan, Working List, Tracking).
    /// </summary>
    private async Task EnsureWorkflowRolesUsersAndMenusAsync(CancellationToken cancellationToken)
    {
        var alreadyHasWorkflowMenus = await dbContext.MenuItems.AnyAsync(m => m.Code == "workflow-working-list", cancellationToken);
        var alreadyHasItLead = await dbContext.Roles.AnyAsync(r => r.Name == RoleNames.ITLead, cancellationToken);
        if (alreadyHasWorkflowMenus && alreadyHasItLead)
        {
            return;
        }

        logger.LogInformation("[Identity.Api] Upgrading existing Identity DB with Workflow corporate roles, users, permissions, and menus...");

        var existingRoles = await dbContext.Roles.Include(r => r.RolePermissions).ToListAsync(cancellationToken);
        Role EnsureRole(string name, string displayName, string description, string badgeColor)
        {
            var found = existingRoles.FirstOrDefault(r => r.Name == name);
            if (found is not null) return found;

            var created = new Role
            {
                Name = name,
                DisplayName = displayName,
                Description = description,
                BadgeColor = badgeColor,
                IsSystemRole = false,
                CreatedBy = "SystemSeeder"
            };
            dbContext.Roles.Add(created);
            existingRoles.Add(created);
            return created;
        }

        var itLeadRole = EnsureRole(RoleNames.ITLead, "IT Infrastructure Lead", "Approver teknis (L2) untuk validasi spesifikasi perangkat & pengadaan IT.", "cyan");
        var hrManagerRole = EnsureRole(RoleNames.HRManager, "HR Manager", "Approver final (L2) untuk validasi kuota & persetujuan pengajuan cuti karyawan.", "violet");
        var financeDirectorRole = EnsureRole(RoleNames.FinanceDirector, "Finance Director", "Approver budget & final sign-off untuk pengadaan barang kantor dan pengadaan laptop.", "teal");

        // Ensure new users exist
        var defaultPasswordHash = passwordHasher.HashPassword("Password123!");
        async Task EnsureUserAsync(string username, string email, string fullName, string phone, string dept, Role role)
        {
            if (await dbContext.Users.AnyAsync(u => u.Username == username, cancellationToken))
                return;

            var user = new User
            {
                Username = username,
                Email = email,
                FullName = fullName,
                PasswordHash = defaultPasswordHash,
                PhoneNumber = phone,
                Department = dept,
                Status = UserStatus.Active,
                CreatedBy = "SystemSeeder"
            };
            await dbContext.Users.AddAsync(user, cancellationToken);
            await dbContext.UserRoles.AddAsync(new UserRole
            {
                UserId = user.Id,
                RoleId = role.Id,
                CreatedBy = "SystemSeeder"
            }, cancellationToken);
        }

        await EnsureUserAsync("itlead", "itlead@starterpack.local", "Hendra Wijaya (IT Lead)", "+62 811-1000-006", "IT Infrastructure & Security", itLeadRole);
        await EnsureUserAsync("hrmanager", "hrmanager@starterpack.local", "Rina Kusuma (HR Manager)", "+62 811-1000-007", "Human Resources & People Ops", hrManagerRole);
        await EnsureUserAsync("financedirector", "finance@starterpack.local", "Surya Darmawan (Finance Director)", "+62 811-1000-008", "Finance & Procurement Budget", financeDirectorRole);

        // Ensure permissions on all roles
        foreach (var role in existingRoles)
        {
            var permsToAdd = role.Name switch
            {
                RoleNames.SuperAdmin or RoleNames.Admin => new[]
                {
                    Permissions.Workflows.View, Permissions.Workflows.Create, Permissions.Workflows.Approve, Permissions.Workflows.ManageTemplates
                },
                RoleNames.Manager => new[]
                {
                    Permissions.Workflows.View, Permissions.Workflows.Create, Permissions.Workflows.Approve
                },
                RoleNames.ITLead => new[]
                {
                    Permissions.Dashboard.View, Permissions.Products.View,
                    Permissions.Workflows.View, Permissions.Workflows.Create, Permissions.Workflows.Approve
                },
                RoleNames.HRManager => new[]
                {
                    Permissions.Dashboard.View, Permissions.Users.View,
                    Permissions.Workflows.View, Permissions.Workflows.Create, Permissions.Workflows.Approve
                },
                RoleNames.FinanceDirector => new[]
                {
                    Permissions.Dashboard.View, Permissions.Orders.View, Permissions.Reports.View, Permissions.Reports.Export,
                    Permissions.Workflows.View, Permissions.Workflows.Create, Permissions.Workflows.Approve
                },
                RoleNames.Staff => new[]
                {
                    Permissions.Workflows.View, Permissions.Workflows.Create
                },
                _ => new[] { Permissions.Workflows.View }
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

        // Ensure existing core menus (dashboard, profile, etc.) are also mapped to the 3 new roles
        var existingMenus = await dbContext.MenuItems.ToListAsync(cancellationToken);
        var existingRoleMenus = await dbContext.RoleMenus.ToListAsync(cancellationToken);

        void EnsureRoleMenu(Guid roleId, Guid menuId)
        {
            if (!existingRoleMenus.Any(rm => rm.RoleId == roleId && rm.MenuItemId == menuId))
            {
                var rm = new RoleMenu { RoleId = roleId, MenuItemId = menuId, CreatedBy = "SystemSeeder" };
                dbContext.RoleMenus.Add(rm);
                existingRoleMenus.Add(rm);
            }
        }

        foreach (var newRole in new[] { itLeadRole, hrManagerRole, financeDirectorRole })
        {
            foreach (var menuCode in new[] { "dashboard", "profile" })
            {
                var m = existingMenus.FirstOrDefault(x => x.Code == menuCode);
                if (m is not null) EnsureRoleMenu(newRole.Id, m.Id);
            }
        }

        var prodMenu = existingMenus.FirstOrDefault(x => x.Code == "products");
        if (prodMenu is not null) EnsureRoleMenu(itLeadRole.Id, prodMenu.Id);
        var usersMenu = existingMenus.FirstOrDefault(x => x.Code == "users");
        if (usersMenu is not null) EnsureRoleMenu(hrManagerRole.Id, usersMenu.Id);
        var ordersMenu = existingMenus.FirstOrDefault(x => x.Code == "orders");
        if (ordersMenu is not null) EnsureRoleMenu(financeDirectorRole.Id, ordersMenu.Id);
        var reportsMenu = existingMenus.FirstOrDefault(x => x.Code == "reports");
        if (reportsMenu is not null) EnsureRoleMenu(financeDirectorRole.Id, reportsMenu.Id);

        // Ensure the 3 workflow menus exist
        async Task<MenuItem> EnsureMenuAsync(string code, string title, string path, string icon, int sortOrder, string? perm, string desc)
        {
            var found = existingMenus.FirstOrDefault(m => m.Code == code);
            if (found is not null) return found;

            var created = new MenuItem
            {
                Code = code,
                Title = title,
                Path = path,
                Icon = icon,
                GroupName = "WORKFLOW & APPROVAL",
                SortOrder = sortOrder,
                RequiredPermission = perm,
                IsVisible = true,
                Description = desc,
                CreatedBy = "SystemSeeder"
            };
            await dbContext.MenuItems.AddAsync(created, cancellationToken);
            existingMenus.Add(created);
            return created;
        }

        var wfCreateMenu = await EnsureMenuAsync("workflow-create", "Buat Pengajuan Form", "/workflow-create", "FilePlus2", 2, Permissions.Workflows.Create, "Form dinamis berbasis tipe dokumen + preview alur approval");
        var wfWorkingMenu = await EnsureMenuAsync("workflow-working-list", "Working List (Approval)", "/workflow-working-list", "ClipboardCheck", 3, Permissions.Workflows.Approve, "Inbox antrean persetujuan khusus role approver aktif");
        var wfTrackingMenu = await EnsureMenuAsync("workflow-tracking", "Tracking Pengajuan", "/workflow-tracking", "GitBranch", 4, Permissions.Workflows.View, "Pantau posisi approver saat ini, riwayat approval, dan revisi dokumen");

        var approverRoleNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            RoleNames.SuperAdmin, RoleNames.Admin, RoleNames.Manager, RoleNames.ITLead, RoleNames.HRManager, RoleNames.FinanceDirector
        };
        var creatorRoleNames = new HashSet<string>(approverRoleNames, StringComparer.OrdinalIgnoreCase) { RoleNames.Staff };

        foreach (var role in existingRoles)
        {
            EnsureRoleMenu(role.Id, wfTrackingMenu.Id);
            if (creatorRoleNames.Contains(role.Name)) EnsureRoleMenu(role.Id, wfCreateMenu.Id);
            if (approverRoleNames.Contains(role.Name)) EnsureRoleMenu(role.Id, wfWorkingMenu.Id);
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        logger.LogInformation("[Identity.Api] Auto-upgraded existing Identity DB with Workflow.Api roles, users, and 3 menus!");
    }
}
