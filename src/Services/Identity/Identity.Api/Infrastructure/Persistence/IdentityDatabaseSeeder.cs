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

            await EnsureOrganizationSqlTablesAndColumnsAsync(cancellationToken);
        }
        else
        {
            await dbContext.Database.EnsureCreatedAsync(cancellationToken);
        }

        if (await dbContext.Roles.AnyAsync(cancellationToken))
        {
            await EnsureOrderMicroserviceMenuAndPermissionsAsync(cancellationToken);
            await EnsureWorkflowRolesUsersAndMenusAsync(cancellationToken);
            await EnsureAnnouncementRolesUsersAndMenuAsync(cancellationToken);
            await EnsureOrganizationSchemaAndSeedAsync(cancellationToken);
            await EnsureExpandedCorporateEmployeesAsync(cancellationToken);
            await EnsureMasterDataPermissionsAndMenuAsync(cancellationToken);
            await EnsureTrackingPermissionsAndMenuAsync(cancellationToken);
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
        await EnsureAnnouncementRolesUsersAndMenuAsync(cancellationToken);
        await EnsureOrganizationSchemaAndSeedAsync(cancellationToken);
        await EnsureExpandedCorporateEmployeesAsync(cancellationToken);
        await EnsureMasterDataPermissionsAndMenuAsync(cancellationToken);
        await EnsureTrackingPermissionsAndMenuAsync(cancellationToken);
        logger.LogInformation("Identity database seeded successfully with corporate workflow, HR announcements, master lookups, live tracking, & full organization master!");
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

    /// <summary>
    /// Auto-upgrade aman untuk Announcement.Api (Port 5085):
    /// menambahkan 2 role HR baru (HRSupervisor dan HRStaff), 2 akun demo HR (hrsupervisor dan hrstaff),
    /// permission Announcements.View (semua role) serta Announcements.Manage (khusus HRStaff, HRSupervisor, HRManager, SuperAdmin),
    /// dan menu sidebar Pengumuman (/announcements) tanpa menduplikasi jika user sudah membuat /announcements lewat UI.
    /// </summary>
    private async Task EnsureAnnouncementRolesUsersAndMenuAsync(CancellationToken cancellationToken)
    {
        var hasHrStaff = await dbContext.Roles.AnyAsync(r => r.Name == RoleNames.HRStaff, cancellationToken);
        var hasHrSupervisor = await dbContext.Roles.AnyAsync(r => r.Name == RoleNames.HRSupervisor, cancellationToken);
        var hasAnnPerm = await dbContext.RolePermissions.AnyAsync(rp => rp.PermissionCode == Permissions.Announcements.Manage, cancellationToken);
        if (hasHrStaff && hasHrSupervisor && hasAnnPerm)
        {
            return;
        }

        logger.LogInformation("[Identity.Api] Ensuring HR Announcement roles (HRStaff, HRSupervisor), users, permissions, and menu...");

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

        var hrSupervisorRole = EnsureRole(
            RoleNames.HRSupervisor,
            "HR Supervisor",
            "Supervisor HR: membuat & menerbitkan pengumuman perusahaan, kelola komentar, dan operasional HR.",
            "fuchsia");

        var hrStaffRole = EnsureRole(
            RoleNames.HRStaff,
            "HR Staff",
            "Staff HR: membuat & menerbitkan pengumuman perusahaan, upload banner/lampiran, dan pengajuan form.",
            "pink");

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

        await EnsureUserAsync("hrsupervisor", "hrsupervisor@starterpack.local", "Dimas Prakoso (HR Supervisor)", "+62 811-1000-009", "Human Resources & Internal Comms", hrSupervisorRole);
        await EnsureUserAsync("hrstaff", "hrstaff@starterpack.local", "Nadia Putri (HR Staff)", "+62 811-1000-010", "Human Resources & People Ops", hrStaffRole);

        // Hanya HRStaff, HRSupervisor, HRManager (+ SuperAdmin) yang mendapatkan Announcements.Manage
        var hrPublisherRoles = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            RoleNames.SuperAdmin, RoleNames.HRManager, RoleNames.HRSupervisor, RoleNames.HRStaff
        };

        foreach (var role in existingRoles)
        {
            var permsToAdd = new List<string> { Permissions.Announcements.View };
            if (hrPublisherRoles.Contains(role.Name))
            {
                permsToAdd.Add(Permissions.Announcements.Manage);
            }

            if (role.Name is RoleNames.HRSupervisor or RoleNames.HRStaff)
            {
                permsToAdd.AddRange([
                    Permissions.Dashboard.View,
                    Permissions.Workflows.View,
                    Permissions.Workflows.Create
                ]);
            }

            foreach (var code in permsToAdd.Distinct())
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

        // Gunakan menu /announcements yang sudah ada (misal buatan user dari UI /menus) agar tidak duplikat!
        var annMenu = existingMenus.FirstOrDefault(m =>
            m.Code.Equals("announcements", StringComparison.OrdinalIgnoreCase) ||
            m.Path.Equals("/announcements", StringComparison.OrdinalIgnoreCase));

        if (annMenu is null)
        {
            annMenu = new MenuItem
            {
                Code = "announcements",
                Title = "Pengumuman (HR News)",
                Path = "/announcements",
                Icon = "Bell",
                GroupName = "MAIN",
                SortOrder = 2,
                RequiredPermission = Permissions.Announcements.View,
                IsVisible = true,
                Description = "Papan pengumuman resmi perusahaan dengan banner, lampiran gambar/file, like, & komentar (Announcement.Api :5085)",
                CreatedBy = "SystemSeeder"
            };
            await dbContext.MenuItems.AddAsync(annMenu, cancellationToken);
            existingMenus.Add(annMenu);
        }

        // Berikan akses menu Pengumuman ke semua 10 role
        foreach (var role in existingRoles)
        {
            EnsureRoleMenu(role.Id, annMenu.Id);
        }

        // Berikan akses menu dasar (dashboard, workflow-create, workflow-tracking, profile) ke HRSupervisor & HRStaff
        foreach (var newRole in new[] { hrSupervisorRole, hrStaffRole })
        {
            foreach (var code in new[] { "dashboard", "workflow-create", "workflow-tracking", "profile" })
            {
                var m = existingMenus.FirstOrDefault(x => x.Code == code);
                if (m is not null) EnsureRoleMenu(newRole.Id, m.Id);
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        logger.LogInformation("[Identity.Api] HR Announcement roles (HRSupervisor, HRStaff), users, permissions, and menu ensured!");
    }

    /// <summary>
    /// Auto-upgrade skema SQL Server aman untuk database existing (tanpa DROP DATABASE):
    /// membuat tabel Directorates, Divisions, Departments, Positions dan menambah kolom profil organisasi pada tabel Users.
    /// </summary>
    private async Task EnsureOrganizationSqlTablesAndColumnsAsync(CancellationToken cancellationToken)
    {
        try
        {
            if (!dbContext.Database.IsSqlServer())
            {
                return;
            }

            await dbContext.Database.ExecuteSqlRawAsync("""
                IF OBJECT_ID(N'Directorates', N'U') IS NULL
                BEGIN
                    CREATE TABLE [Directorates] (
                        [Id] uniqueidentifier NOT NULL PRIMARY KEY,
                        [Code] nvarchar(40) NOT NULL,
                        [Name] nvarchar(150) NOT NULL,
                        [Description] nvarchar(500) NOT NULL DEFAULT N'',
                        [HeadUserId] uniqueidentifier NULL,
                        [IsActive] bit NOT NULL DEFAULT 1,
                        [CreatedAt] datetime2 NOT NULL,
                        [CreatedBy] nvarchar(max) NULL,
                        [UpdatedAt] datetime2 NULL,
                        [UpdatedBy] nvarchar(max) NULL,
                        [IsDeleted] bit NOT NULL DEFAULT 0
                    );
                    CREATE UNIQUE INDEX [IX_Directorates_Code] ON [Directorates]([Code]);
                END;

                IF OBJECT_ID(N'Divisions', N'U') IS NULL
                BEGIN
                    CREATE TABLE [Divisions] (
                        [Id] uniqueidentifier NOT NULL PRIMARY KEY,
                        [DirectorateId] uniqueidentifier NOT NULL,
                        [Code] nvarchar(40) NOT NULL,
                        [Name] nvarchar(150) NOT NULL,
                        [Description] nvarchar(500) NOT NULL DEFAULT N'',
                        [HeadUserId] uniqueidentifier NULL,
                        [IsActive] bit NOT NULL DEFAULT 1,
                        [CreatedAt] datetime2 NOT NULL,
                        [CreatedBy] nvarchar(max) NULL,
                        [UpdatedAt] datetime2 NULL,
                        [UpdatedBy] nvarchar(max) NULL,
                        [IsDeleted] bit NOT NULL DEFAULT 0,
                        CONSTRAINT [FK_Divisions_Directorates_DirectorateId] FOREIGN KEY ([DirectorateId]) REFERENCES [Directorates]([Id])
                    );
                    CREATE UNIQUE INDEX [IX_Divisions_Code] ON [Divisions]([Code]);
                END;

                IF OBJECT_ID(N'Departments', N'U') IS NULL
                BEGIN
                    CREATE TABLE [Departments] (
                        [Id] uniqueidentifier NOT NULL PRIMARY KEY,
                        [DivisionId] uniqueidentifier NOT NULL,
                        [Code] nvarchar(40) NOT NULL,
                        [Name] nvarchar(150) NOT NULL,
                        [Description] nvarchar(500) NOT NULL DEFAULT N'',
                        [HeadUserId] uniqueidentifier NULL,
                        [IsActive] bit NOT NULL DEFAULT 1,
                        [CreatedAt] datetime2 NOT NULL,
                        [CreatedBy] nvarchar(max) NULL,
                        [UpdatedAt] datetime2 NULL,
                        [UpdatedBy] nvarchar(max) NULL,
                        [IsDeleted] bit NOT NULL DEFAULT 0,
                        CONSTRAINT [FK_Departments_Divisions_DivisionId] FOREIGN KEY ([DivisionId]) REFERENCES [Divisions]([Id])
                    );
                    CREATE UNIQUE INDEX [IX_Departments_Code] ON [Departments]([Code]);
                END;

                IF OBJECT_ID(N'Positions', N'U') IS NULL
                BEGIN
                    CREATE TABLE [Positions] (
                        [Id] uniqueidentifier NOT NULL PRIMARY KEY,
                        [Code] nvarchar(40) NOT NULL,
                        [Name] nvarchar(150) NOT NULL,
                        [Level] int NOT NULL DEFAULT 5,
                        [Description] nvarchar(500) NOT NULL DEFAULT N'',
                        [IsActive] bit NOT NULL DEFAULT 1,
                        [CreatedAt] datetime2 NOT NULL,
                        [CreatedBy] nvarchar(max) NULL,
                        [UpdatedAt] datetime2 NULL,
                        [UpdatedBy] nvarchar(max) NULL,
                        [IsDeleted] bit NOT NULL DEFAULT 0
                    );
                    CREATE UNIQUE INDEX [IX_Positions_Code] ON [Positions]([Code]);
                END;

                IF OBJECT_ID(N'Users', N'U') IS NOT NULL
                BEGIN
                    IF COL_LENGTH(N'Users', N'EmployeeCode') IS NULL ALTER TABLE [Users] ADD [EmployeeCode] nvarchar(40) NULL;
                    IF COL_LENGTH(N'Users', N'DirectorateId') IS NULL ALTER TABLE [Users] ADD [DirectorateId] uniqueidentifier NULL;
                    IF COL_LENGTH(N'Users', N'DivisionId') IS NULL ALTER TABLE [Users] ADD [DivisionId] uniqueidentifier NULL;
                    IF COL_LENGTH(N'Users', N'DepartmentId') IS NULL ALTER TABLE [Users] ADD [DepartmentId] uniqueidentifier NULL;
                    IF COL_LENGTH(N'Users', N'PositionId') IS NULL ALTER TABLE [Users] ADD [PositionId] uniqueidentifier NULL;
                    IF COL_LENGTH(N'Users', N'ManagerUserId') IS NULL ALTER TABLE [Users] ADD [ManagerUserId] uniqueidentifier NULL;
                END;
                """, cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "[Identity.Api] Gagal memastikan skema tabel Organisasi pada SQL Server.");
        }
    }

    /// <summary>
    /// Seed Master Struktur Organisasi (4 Direktorat, 8 Divisi, 15 Departemen, 10 Posisi),
    /// pemetaan 1 Bos per Direktorat (termasuk CFO Angelica Wijaya untuk Direktorat Finance),
    /// tambahan 15 user korporat baru (total 25 user), permission Organization.*, dan menu Struktur Organisasi.
    /// </summary>
    private async Task EnsureOrganizationSchemaAndSeedAsync(CancellationToken cancellationToken)
    {
        if (await dbContext.Directorates.AnyAsync(cancellationToken))
        {
            return;
        }

        logger.LogInformation("[Identity.Api] Seeding Organization Master (4 Directorates, 8 Divisions, 15 Departments, 10 Positions) & corporate users...");

        // 1. Seed 10 Master Posisi / Jabatan (Level 1 = C-Level tertinggi)
        var posCfo = new Position { Code = "POS-CFO", Name = "Chief Financial Officer (CFO)", Level = 1, Description = "Kepala Direktorat Finance & Strategi Keuangan", CreatedBy = "SystemSeeder" };
        var posCto = new Position { Code = "POS-CTO", Name = "Chief Technology Officer (CTO)", Level = 1, Description = "Kepala Direktorat Technology & Digital Architecture", CreatedBy = "SystemSeeder" };
        var posChro = new Position { Code = "POS-CHRO", Name = "Chief Human Resources Officer (CHRO)", Level = 1, Description = "Kepala Direktorat Human Capital & General Affairs", CreatedBy = "SystemSeeder" };
        var posCoo = new Position { Code = "POS-COO", Name = "Chief Operating Officer (COO)", Level = 1, Description = "Kepala Direktorat Operations & Audit", CreatedBy = "SystemSeeder" };
        var posVp = new Position { Code = "POS-VP", Name = "Division Head / VP", Level = 2, Description = "Kepala Divisi yang memimpin beberapa Departemen", CreatedBy = "SystemSeeder" };
        var posMgr = new Position { Code = "POS-MGR", Name = "Department Manager", Level = 3, Description = "Manager pengelola operasional departemen", CreatedBy = "SystemSeeder" };
        var posLead = new Position { Code = "POS-LEAD", Name = "Supervisor / Team Lead", Level = 4, Description = "Supervisor teknis atau operasional tim", CreatedBy = "SystemSeeder" };
        var posSrStaff = new Position { Code = "POS-SR-STAFF", Name = "Senior Specialist / Engineer", Level = 5, Description = "Staf senior dan spesialis bidang", CreatedBy = "SystemSeeder" };
        var posStaff = new Position { Code = "POS-STAFF", Name = "Operational Staff / Analyst", Level = 6, Description = "Staf operasional harian departemen", CreatedBy = "SystemSeeder" };
        var posAuditor = new Position { Code = "POS-AUDITOR", Name = "Internal Auditor", Level = 5, Description = "Auditor kepatuhan dan kontrol risiko internal", CreatedBy = "SystemSeeder" };

        await dbContext.Positions.AddRangeAsync([posCfo, posCto, posChro, posCoo, posVp, posMgr, posLead, posSrStaff, posStaff, posAuditor], cancellationToken);

        // 2. Seed 4 Direktorat
        var dirFinance = new Directorate { Code = "DIR-FIN", Name = "Direktorat Finance", Description = "Pengelolaan keuangan perusahaan, akuntansi, perpajakan, treasury, dan FP&A.", CreatedBy = "SystemSeeder" };
        var dirTech = new Directorate { Code = "DIR-TECH", Name = "Direktorat Technology & Digital", Description = "Pengembangan software, microservices, infrastruktur cloud, dan keamanan siber.", CreatedBy = "SystemSeeder" };
        var dirHrGa = new Directorate { Code = "DIR-HRGA", Name = "Direktorat Human Capital & GA", Description = "Pengelolaan SDM, budaya perusahaan, komunikasi internal, dan fasilitas kantor.", CreatedBy = "SystemSeeder" };
        var dirOps = new Directorate { Code = "DIR-OPS", Name = "Direktorat Operations & Audit", Description = "Operasional rantai pasok, pengadaan vendor, logistik, serta audit internal.", CreatedBy = "SystemSeeder" };

        await dbContext.Directorates.AddRangeAsync([dirFinance, dirTech, dirHrGa, dirOps], cancellationToken);

        // 3. Seed 8 Divisi (masing-masing 2 Divisi per Direktorat)
        var divAccounting = new Division { DirectorateId = dirFinance.Id, Code = "DIV-ACC", Name = "Divisi Accounting", Description = "Pencatatan laporan keuangan, general ledger, dan kepatuhan pajak.", CreatedBy = "SystemSeeder" };
        var divTreasury = new Division { DirectorateId = dirFinance.Id, Code = "DIV-TRS", Name = "Divisi Treasury", Description = "Manajemen arus kas, likuiditas, perencanaan anggaran, dan FP&A.", CreatedBy = "SystemSeeder" };

        var divEngineering = new Division { DirectorateId = dirTech.Id, Code = "DIV-ENG", Name = "Divisi Software Engineering", Description = "Pengembangan backend API, frontend web, dan produk digital.", CreatedBy = "SystemSeeder" };
        var divInfra = new Division { DirectorateId = dirTech.Id, Code = "DIV-INFRA", Name = "Divisi IT Infrastructure & Security", Description = "Operasional cloud, DevOps, jaringan, dan keamanan sistem.", CreatedBy = "SystemSeeder" };

        var divHr = new Division { DirectorateId = dirHrGa.Id, Code = "DIV-HR", Name = "Divisi Human Resources", Description = "People operations, rekrutmen, pelatihan, dan komunikasi internal.", CreatedBy = "SystemSeeder" };
        var divGa = new Division { DirectorateId = dirHrGa.Id, Code = "DIV-GA", Name = "Divisi General Affairs", Description = "Pengelolaan gedung, aset kantor, dan layanan operasional umum.", CreatedBy = "SystemSeeder" };

        var divProc = new Division { DirectorateId = dirOps.Id, Code = "DIV-PROC", Name = "Divisi Supply Chain & Procurement", Description = "Pengadaan barang/vendor dan manajemen inventori operasional.", CreatedBy = "SystemSeeder" };
        var divAudit = new Division { DirectorateId = dirOps.Id, Code = "DIV-AUDIT", Name = "Divisi Internal Audit & Risk", Description = "Audit kepatuhan SOP, mitigasi risiko, dan tata kelola perusahaan.", CreatedBy = "SystemSeeder" };

        await dbContext.Divisions.AddRangeAsync([divAccounting, divTreasury, divEngineering, divInfra, divHr, divGa, divProc, divAudit], cancellationToken);

        // 4. Seed 15 Departemen (turunan tiap Divisi)
        var deptGl = new Department { DivisionId = divAccounting.Id, Code = "DEPT-GL", Name = "General Ledger & Reporting", Description = "Penyusunan laporan keuangan bulanan & tahunan.", CreatedBy = "SystemSeeder" };
        var deptTax = new Department { DivisionId = divAccounting.Id, Code = "DEPT-TAX", Name = "Tax & Compliance", Description = "Pelaporan perpajakan dan kepatuhan regulasi fiskal.", CreatedBy = "SystemSeeder" };
        var deptCash = new Department { DivisionId = divTreasury.Id, Code = "DEPT-CASH", Name = "Cash & Liquidity Management", Description = "Pengelolaan kas harian, pembayaran vendor, dan perbankan.", CreatedBy = "SystemSeeder" };
        var deptFpna = new Department { DivisionId = divTreasury.Id, Code = "DEPT-FPNA", Name = "FP&A & Budgeting", Description = "Analisis kinerja keuangan dan penyusunan budget tahunan.", CreatedBy = "SystemSeeder" };

        var deptBe = new Department { DivisionId = divEngineering.Id, Code = "DEPT-BE", Name = "Backend & Microservices", Description = "Arsitektur .NET 10, API Gateway, dan layanan inti.", CreatedBy = "SystemSeeder" };
        var deptFe = new Department { DivisionId = divEngineering.Id, Code = "DEPT-FE", Name = "Frontend & Product UI", Description = "Pengembangan aplikasi web React TypeScript & design system.", CreatedBy = "SystemSeeder" };
        var deptCloud = new Department { DivisionId = divInfra.Id, Code = "DEPT-CLOUD", Name = "Cloud & DevOps", Description = "CI/CD, containerization Docker, dan keandalan server.", CreatedBy = "SystemSeeder" };
        var deptSec = new Department { DivisionId = divInfra.Id, Code = "DEPT-SEC", Name = "Cybersecurity & System Ops", Description = "Keamanan akses, monitoring, dan operasional sistem.", CreatedBy = "SystemSeeder" };

        var deptPeople = new Department { DivisionId = divHr.Id, Code = "DEPT-PEOPLE", Name = "People Operations & Comms", Description = "Administrasi karyawan, benefit, dan HR newsroom.", CreatedBy = "SystemSeeder" };
        var deptRecruit = new Department { DivisionId = divHr.Id, Code = "DEPT-RECRUIT", Name = "Talent Acquisition & L&D", Description = "Rekrutmen talenta dan pengembangan kompetensi.", CreatedBy = "SystemSeeder" };
        var deptFacility = new Department { DivisionId = divGa.Id, Code = "DEPT-FACILITY", Name = "Facility & Office Asset", Description = "Pemeliharaan fasilitas ruang kerja dan aset fisik kantor.", CreatedBy = "SystemSeeder" };

        var deptProc = new Department { DivisionId = divProc.Id, Code = "DEPT-PROC", Name = "Vendor & Procurement", Description = "Negosiasi vendor dan eksekusi pembelian barang.", CreatedBy = "SystemSeeder" };
        var deptWh = new Department { DivisionId = divProc.Id, Code = "DEPT-WH", Name = "Warehouse & Fulfillment", Description = "Penerimaan, penyimpanan, dan distribusi barang.", CreatedBy = "SystemSeeder" };
        var deptAudit = new Department { DivisionId = divAudit.Id, Code = "DEPT-AUDIT", Name = "Corporate Risk & Audit", Description = "Pemeriksaan audit proses bisnis dan kepatuhan.", CreatedBy = "SystemSeeder" };

        await dbContext.Departments.AddRangeAsync([
            deptGl, deptTax, deptCash, deptFpna,
            deptBe, deptFe, deptCloud, deptSec,
            deptPeople, deptRecruit, deptFacility,
            deptProc, deptWh, deptAudit
        ], cancellationToken);

        await dbContext.SaveChangesAsync(cancellationToken);

        // 5. Pastikan 25 User (10 existing + 15 corporate users baru) lengkap dengan Direktorat, Divisi, Departemen, Posisi, NIK, & Atasan
        var rolesByName = (await dbContext.Roles.Include(r => r.RolePermissions).ToListAsync(cancellationToken))
            .ToDictionary(r => r.Name, StringComparer.OrdinalIgnoreCase);
        var existingUsers = await dbContext.Users.ToListAsync(cancellationToken);
        var usersByUsername = existingUsers.ToDictionary(u => u.Username, StringComparer.OrdinalIgnoreCase);
        var defaultPasswordHash = passwordHasher.HashPassword("Password123!");

        async Task<User> EnsureOrgUserAsync(
            string username,
            string email,
            string fullName,
            string empCode,
            string phone,
            string roleName,
            Directorate dir,
            Division? div,
            Department? dept,
            Position pos,
            User? manager)
        {
            if (!usersByUsername.TryGetValue(username, out var u))
            {
                u = new User
                {
                    Username = username,
                    Email = email,
                    FullName = fullName,
                    PasswordHash = defaultPasswordHash,
                    PhoneNumber = phone,
                    Status = UserStatus.Active,
                    CreatedBy = "SystemSeeder"
                };
                await dbContext.Users.AddAsync(u, cancellationToken);
                usersByUsername[username] = u;

                if (rolesByName.TryGetValue(roleName, out var role))
                {
                    await dbContext.UserRoles.AddAsync(new UserRole
                    {
                        UserId = u.Id,
                        RoleId = role.Id,
                        CreatedBy = "SystemSeeder"
                    }, cancellationToken);
                }
            }

            u.EmployeeCode = empCode;
            u.DirectorateId = dir.Id;
            u.DivisionId = div?.Id;
            u.DepartmentId = dept?.Id;
            u.Department = dept?.Name ?? div?.Name ?? dir.Name;
            u.PositionId = pos.Id;
            u.ManagerUserId = manager?.Id;
            return u;
        }

        // === DIREKTORAT 1: FINANCE (Bos: CFO Angelica Wijaya) ===
        var cfoAngelica = await EnsureOrgUserAsync("angelica.cfo", "angelica.cfo@starterpack.local", "Angelica Wijaya (CFO)", "EMP-0001", "+62 811-2000-001", RoleNames.FinanceDirector, dirFinance, null, null, posCfo, null);
        var vpAccounting = await EnsureOrgUserAsync("financedirector", "finance@starterpack.local", "Surya Darmawan (VP Accounting)", "EMP-0002", "+62 811-1000-008", RoleNames.FinanceDirector, dirFinance, divAccounting, deptGl, posVp, cfoAngelica);
        var staffGl = await EnsureOrgUserAsync("dina.acc", "dina.acc@starterpack.local", "Dina Kartika (Senior Accounting)", "EMP-0011", "+62 811-2000-011", RoleNames.Staff, dirFinance, divAccounting, deptGl, posSrStaff, vpAccounting);
        var staffTax = await EnsureOrgUserAsync("farhan.tax", "farhan.tax@starterpack.local", "Farhan Hakim (Tax Specialist)", "EMP-0012", "+62 811-2000-012", RoleNames.Staff, dirFinance, divAccounting, deptTax, posSrStaff, vpAccounting);

        var headTreasury = await EnsureOrgUserAsync("clarissa.trs", "clarissa.trs@starterpack.local", "Clarissa Tan (Head of Treasury)", "EMP-0013", "+62 811-2000-013", RoleNames.Manager, dirFinance, divTreasury, deptCash, posVp, cfoAngelica);
        var staffCash = await EnsureOrgUserAsync("kevin.cash", "kevin.cash@starterpack.local", "Kevin Setiawan (Treasury Analyst)", "EMP-0014", "+62 811-2000-014", RoleNames.Staff, dirFinance, divTreasury, deptCash, posStaff, headTreasury);
        var staffFpna = await EnsureOrgUserAsync("melisa.fpna", "melisa.fpna@starterpack.local", "Melisa Gunawan (FP&A Analyst)", "EMP-0015", "+62 811-2000-015", RoleNames.Staff, dirFinance, divTreasury, deptFpna, posStaff, headTreasury);

        // === DIREKTORAT 2: TECHNOLOGY & DIGITAL (Bos: CTO Budi Santoso / superadmin) ===
        var ctoBudi = await EnsureOrgUserAsync("superadmin", "superadmin@starterpack.local", "Budi Santoso (CTO / Super Admin)", "EMP-0003", "+62 811-1000-001", RoleNames.SuperAdmin, dirTech, null, null, posCto, null);
        var vpEng = await EnsureOrgUserAsync("manager", "manager@starterpack.local", "Andi Pratama (VP Engineering)", "EMP-0004", "+62 811-1000-003", RoleNames.Manager, dirTech, divEngineering, deptBe, posVp, ctoBudi);
        var srBe = await EnsureOrgUserAsync("rafi.be", "rafi.be@starterpack.local", "Rafi Pratama (Senior Backend Engineer)", "EMP-0016", "+62 811-2000-016", RoleNames.Staff, dirTech, divEngineering, deptBe, posSrStaff, vpEng);
        var feEng = await EnsureOrgUserAsync("tiara.fe", "tiara.fe@starterpack.local", "Tiara Permata (Frontend Engineer)", "EMP-0017", "+62 811-2000-017", RoleNames.Staff, dirTech, divEngineering, deptFe, posStaff, vpEng);

        var headInfra = await EnsureOrgUserAsync("itlead", "itlead@starterpack.local", "Hendra Wijaya (Head of IT Infra)", "EMP-0005", "+62 811-1000-006", RoleNames.ITLead, dirTech, divInfra, deptCloud, posVp, ctoBudi);
        var devops = await EnsureOrgUserAsync("bagas.devops", "bagas.devops@starterpack.local", "Bagas Saputra (DevOps Engineer)", "EMP-0018", "+62 811-2000-018", RoleNames.Staff, dirTech, divInfra, deptCloud, posSrStaff, headInfra);
        var sysAdmin = await EnsureOrgUserAsync("admin", "admin@starterpack.local", "Siti Rahmawati (System Ops Manager)", "EMP-0006", "+62 811-1000-002", RoleNames.Admin, dirTech, divInfra, deptSec, posMgr, headInfra);

        // === DIREKTORAT 3: HUMAN CAPITAL & GA (Bos: CHRO Rina Kusuma / hrmanager) ===
        var chroRina = await EnsureOrgUserAsync("hrmanager", "hrmanager@starterpack.local", "Rina Kusuma (CHRO / HR Manager)", "EMP-0007", "+62 811-1000-007", RoleNames.HRManager, dirHrGa, null, null, posChro, null);
        var hrSpv = await EnsureOrgUserAsync("hrsupervisor", "hrsupervisor@starterpack.local", "Dimas Prakoso (HR Supervisor)", "EMP-0008", "+62 811-1000-009", RoleNames.HRSupervisor, dirHrGa, divHr, deptPeople, posLead, chroRina);
        var hrStaff = await EnsureOrgUserAsync("hrstaff", "hrstaff@starterpack.local", "Nadia Putri (HR Staff)", "EMP-0009", "+62 811-1000-010", RoleNames.HRStaff, dirHrGa, divHr, deptPeople, posStaff, hrSpv);
        var talentStaff = await EnsureOrgUserAsync("citra.talent", "citra.talent@starterpack.local", "Citra Melati (Talent Acquisition)", "EMP-0019", "+62 811-2000-019", RoleNames.HRStaff, dirHrGa, divHr, deptRecruit, posStaff, hrSpv);

        var gaMgr = await EnsureOrgUserAsync("fajar.ga", "fajar.ga@starterpack.local", "Fajar Nugroho (GA Manager)", "EMP-0020", "+62 811-2000-020", RoleNames.Manager, dirHrGa, divGa, deptFacility, posMgr, chroRina);
        var gaStaff = await EnsureOrgUserAsync("bambang.ga", "bambang.ga@starterpack.local", "Bambang Susanto (GA Operations)", "EMP-0021", "+62 811-2000-021", RoleNames.Staff, dirHrGa, divGa, deptFacility, posStaff, gaMgr);

        // === DIREKTORAT 4: OPERATIONS & AUDIT (Bos: COO Reza Mahendra) ===
        var cooReza = await EnsureOrgUserAsync("reza.coo", "reza.coo@starterpack.local", "Reza Mahendra (COO)", "EMP-0010", "+62 811-2000-010", RoleNames.Manager, dirOps, null, null, posCoo, null);
        var procLead = await EnsureOrgUserAsync("staff", "staff@starterpack.local", "Dewi Lestari (Procurement Lead)", "EMP-0022", "+62 811-1000-004", RoleNames.Staff, dirOps, divProc, deptProc, posLead, cooReza);
        var procStaff = await EnsureOrgUserAsync("yoga.proc", "yoga.proc@starterpack.local", "Yoga Saputra (Procurement Staff)", "EMP-0023", "+62 811-2000-023", RoleNames.Staff, dirOps, divProc, deptProc, posStaff, procLead);
        var whStaff = await EnsureOrgUserAsync("putri.ops", "putri.ops@starterpack.local", "Putri Wulandari (Warehouse Staff)", "EMP-0024", "+62 811-2000-024", RoleNames.Staff, dirOps, divProc, deptWh, posStaff, procLead);

        var auditHead = await EnsureOrgUserAsync("viewer", "viewer@starterpack.local", "Rizky Ramadhan (Head of Internal Audit)", "EMP-0025", "+62 811-1000-005", RoleNames.Viewer, dirOps, divAudit, deptAudit, posMgr, cooReza);
        var auditorStaff = await EnsureOrgUserAsync("luthfi.audit", "luthfi.audit@starterpack.local", "Luthfi Hidayat (Internal Auditor)", "EMP-0026", "+62 811-2000-026", RoleNames.Viewer, dirOps, divAudit, deptAudit, posAuditor, auditHead);

        // 6. Set HeadUserId (Bos tiap Direktorat, Divisi, & Departemen)
        dirFinance.HeadUserId = cfoAngelica.Id;
        dirTech.HeadUserId = ctoBudi.Id;
        dirHrGa.HeadUserId = chroRina.Id;
        dirOps.HeadUserId = cooReza.Id;

        divAccounting.HeadUserId = vpAccounting.Id;
        divTreasury.HeadUserId = headTreasury.Id;
        divEngineering.HeadUserId = vpEng.Id;
        divInfra.HeadUserId = headInfra.Id;
        divHr.HeadUserId = hrSpv.Id;
        divGa.HeadUserId = gaMgr.Id;
        divProc.HeadUserId = procLead.Id;
        divAudit.HeadUserId = auditHead.Id;

        deptGl.HeadUserId = staffGl.Id;
        deptTax.HeadUserId = staffTax.Id;
        deptCash.HeadUserId = staffCash.Id;
        deptFpna.HeadUserId = staffFpna.Id;
        deptBe.HeadUserId = srBe.Id;
        deptFe.HeadUserId = feEng.Id;
        deptCloud.HeadUserId = devops.Id;
        deptSec.HeadUserId = sysAdmin.Id;
        deptPeople.HeadUserId = hrStaff.Id;
        deptRecruit.HeadUserId = talentStaff.Id;
        deptFacility.HeadUserId = gaStaff.Id;
        deptProc.HeadUserId = procStaff.Id;
        deptWh.HeadUserId = whStaff.Id;
        deptAudit.HeadUserId = auditorStaff.Id;

        // 7. Pastikan Permission Organization.View & Organization.Manage + Menu Struktur Organisasi (/organization)
        var orgManagers = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            RoleNames.SuperAdmin, RoleNames.Admin, RoleNames.HRManager, RoleNames.HRSupervisor
        };

        foreach (var role in rolesByName.Values)
        {
            var permsToAdd = new List<string> { Permissions.Organization.View };
            if (orgManagers.Contains(role.Name))
            {
                permsToAdd.Add(Permissions.Organization.Manage);
            }

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

        var existingMenus = await dbContext.MenuItems.ToListAsync(cancellationToken);
        var existingRoleMenus = await dbContext.RoleMenus.ToListAsync(cancellationToken);
        var orgMenu = existingMenus.FirstOrDefault(m => m.Code == "organization" || m.Path == "/organization");
        if (orgMenu is null)
        {
            orgMenu = new MenuItem
            {
                Code = "organization",
                Title = "Struktur Organisasi",
                Path = "/organization",
                Icon = "Network",
                GroupName = "IDENTITY & RBAC",
                SortOrder = 7,
                RequiredPermission = Permissions.Organization.View,
                IsVisible = true,
                Description = "Pohon struktur Direktorat, Divisi, Departemen, dan Master Posisi karyawan",
                CreatedBy = "SystemSeeder"
            };
            await dbContext.MenuItems.AddAsync(orgMenu, cancellationToken);
        }

        foreach (var role in rolesByName.Values)
        {
            if (!existingRoleMenus.Any(rm => rm.RoleId == role.Id && rm.MenuItemId == orgMenu.Id))
            {
                await dbContext.RoleMenus.AddAsync(new RoleMenu
                {
                    RoleId = role.Id,
                    MenuItemId = orgMenu.Id,
                    CreatedBy = "SystemSeeder"
                }, cancellationToken);
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        logger.LogInformation("[Identity.Api] Organization Master (4 Directorates, 8 Divisions, 14 Departments, 10 Positions) & 26 corporate users seeded successfully!");
    }

    /// <summary>
    /// Idempotent expansion: melengkapi setiap Divisi dengan Division Head khusus (POS-VP),
    /// setiap dari 14 Departemen dengan Department Head khusus (POS-MGR), serta tambahan Supervisor dan Staff
    /// sehingga total menjadi 63 karyawan korporat tanpa menimpa nama custom user existing.
    /// </summary>
    private async Task EnsureExpandedCorporateEmployeesAsync(CancellationToken cancellationToken)
    {
        if (await dbContext.Users.AnyAsync(u => u.Username == "hendra.gl", cancellationToken))
        {
            return;
        }

        var directorates = (await dbContext.Directorates.ToListAsync(cancellationToken))
            .ToDictionary(d => d.Code, StringComparer.OrdinalIgnoreCase);
        var divisions = (await dbContext.Divisions.ToListAsync(cancellationToken))
            .ToDictionary(d => d.Code, StringComparer.OrdinalIgnoreCase);
        var departments = (await dbContext.Departments.ToListAsync(cancellationToken))
            .ToDictionary(d => d.Code, StringComparer.OrdinalIgnoreCase);
        var positions = (await dbContext.Positions.ToListAsync(cancellationToken))
            .ToDictionary(p => p.Code, StringComparer.OrdinalIgnoreCase);

        if (!directorates.TryGetValue("DIR-FIN", out var dirFinance) ||
            !directorates.TryGetValue("DIR-TECH", out var dirTech) ||
            !directorates.TryGetValue("DIR-HRGA", out var dirHrGa) ||
            !directorates.TryGetValue("DIR-OPS", out var dirOps))
        {
            return;
        }

        logger.LogInformation("[Identity.Api] Expanding corporate employees (dedicated Div Heads, Dept Heads, Leads, & Staff across all 14 departments)...");

        var rolesByName = (await dbContext.Roles.ToListAsync(cancellationToken))
            .ToDictionary(r => r.Name, StringComparer.OrdinalIgnoreCase);
        var usersByUsername = (await dbContext.Users.ToListAsync(cancellationToken))
            .ToDictionary(u => u.Username, StringComparer.OrdinalIgnoreCase);
        var defaultPasswordHash = passwordHasher.HashPassword("Password123!");

        var posVp = positions["POS-VP"];
        var posMgr = positions["POS-MGR"];
        var posLead = positions["POS-LEAD"];
        var posSrStaff = positions["POS-SR-STAFF"];
        var posStaff = positions["POS-STAFF"];
        var posAuditor = positions["POS-AUDITOR"];

        var divAccounting = divisions["DIV-ACC"];
        var divTreasury = divisions["DIV-TRS"];
        var divEngineering = divisions["DIV-ENG"];
        var divInfra = divisions["DIV-INFRA"];
        var divHr = divisions["DIV-HR"];
        var divGa = divisions["DIV-GA"];
        var divProc = divisions["DIV-PROC"];
        var divAudit = divisions["DIV-AUDIT"];

        var deptGl = departments["DEPT-GL"];
        var deptTax = departments["DEPT-TAX"];
        var deptCash = departments["DEPT-CASH"];
        var deptFpna = departments["DEPT-FPNA"];
        var deptBe = departments["DEPT-BE"];
        var deptFe = departments["DEPT-FE"];
        var deptCloud = departments["DEPT-CLOUD"];
        var deptSec = departments["DEPT-SEC"];
        var deptPeople = departments["DEPT-PEOPLE"];
        var deptRecruit = departments["DEPT-RECRUIT"];
        var deptFacility = departments["DEPT-FACILITY"];
        var deptProc = departments["DEPT-PROC"];
        var deptWh = departments["DEPT-WH"];
        var deptAudit = departments["DEPT-AUDIT"];

        async Task<User> UpsertEmployeeAsync(
            string username,
            string email,
            string fullName,
            string empCode,
            string phone,
            string roleName,
            Directorate dir,
            Division? div,
            Department? dept,
            Position pos,
            User? manager)
        {
            if (!usersByUsername.TryGetValue(username, out var u))
            {
                u = new User
                {
                    Username = username,
                    Email = email,
                    FullName = fullName,
                    PasswordHash = defaultPasswordHash,
                    PhoneNumber = phone,
                    Status = UserStatus.Active,
                    CreatedBy = "SystemSeeder"
                };
                await dbContext.Users.AddAsync(u, cancellationToken);
                usersByUsername[username] = u;

                if (rolesByName.TryGetValue(roleName, out var role))
                {
                    await dbContext.UserRoles.AddAsync(new UserRole
                    {
                        UserId = u.Id,
                        RoleId = role.Id,
                        CreatedBy = "SystemSeeder"
                    }, cancellationToken);
                }
            }

            u.EmployeeCode = empCode;
            u.DirectorateId = dir.Id;
            u.DivisionId = div?.Id;
            u.DepartmentId = dept?.Id;
            u.Department = dept?.Name ?? div?.Name ?? dir.Name;
            u.PositionId = pos.Id;
            u.ManagerUserId = manager?.Id;
            return u;
        }

        // 4 Directorate Heads (C-Level) yang sudah ada
        var cfoAngelica = usersByUsername["angelica.cfo"];
        var ctoBudi = usersByUsername["superadmin"];
        var chroRina = usersByUsername["hrmanager"];
        var cooReza = usersByUsername["reza.coo"];

        // ==================== DIREKTORAT 1: FINANCE (CFO Angelica Wijaya) ====================
        // Divisi Accounting — Div Head (DepartmentId = null agar bersih di level Divisi)
        var vpAccounting = await UpsertEmployeeAsync("financedirector", "finance@starterpack.local", "Surya Darmawan (VP Accounting)", "EMP-0002", "+62 811-1000-008", RoleNames.FinanceDirector, dirFinance, divAccounting, null, posVp, cfoAngelica);
        divAccounting.HeadUserId = vpAccounting.Id;

        // Dept General Ledger & Reporting
        var headGl = await UpsertEmployeeAsync("hendra.gl", "hendra.gl@starterpack.local", "Hendra Kurniawan (Head of General Ledger)", "EMP-0027", "+62 811-2000-027", RoleNames.Manager, dirFinance, divAccounting, deptGl, posMgr, vpAccounting);
        deptGl.HeadUserId = headGl.Id;
        await UpsertEmployeeAsync("dina.acc", "dina.acc@starterpack.local", "Dina Kartika (Senior Accounting)", "EMP-0011", "+62 811-2000-011", RoleNames.Staff, dirFinance, divAccounting, deptGl, posSrStaff, headGl);
        await UpsertEmployeeAsync("salsa.gl", "salsa.gl@starterpack.local", "Salsa Nabila (Accounting Staff)", "EMP-0028", "+62 811-2000-028", RoleNames.Staff, dirFinance, divAccounting, deptGl, posStaff, headGl);
        await UpsertEmployeeAsync("rico.gl", "rico.gl@starterpack.local", "Rico Firmansyah (GL Reporting Analyst)", "EMP-0029", "+62 811-2000-029", RoleNames.Staff, dirFinance, divAccounting, deptGl, posStaff, headGl);

        // Dept Tax & Compliance
        var headTax = await UpsertEmployeeAsync("ratna.tax", "ratna.tax@starterpack.local", "Ratna Sari (Head of Tax & Compliance)", "EMP-0030", "+62 811-2000-030", RoleNames.Manager, dirFinance, divAccounting, deptTax, posMgr, vpAccounting);
        deptTax.HeadUserId = headTax.Id;
        await UpsertEmployeeAsync("farhan.tax", "farhan.tax@starterpack.local", "Farhan Hakim (Tax Specialist)", "EMP-0012", "+62 811-2000-012", RoleNames.Staff, dirFinance, divAccounting, deptTax, posSrStaff, headTax);
        await UpsertEmployeeAsync("ayu.tax", "ayu.tax@starterpack.local", "Ayu Lestari (Tax Compliance Staff)", "EMP-0031", "+62 811-2000-031", RoleNames.Staff, dirFinance, divAccounting, deptTax, posStaff, headTax);

        // Divisi Treasury — Div Head
        var vpTreasury = await UpsertEmployeeAsync("clarissa.trs", "clarissa.trs@starterpack.local", "Clarissa Tan (VP Treasury)", "EMP-0013", "+62 811-2000-013", RoleNames.Manager, dirFinance, divTreasury, null, posVp, cfoAngelica);
        divTreasury.HeadUserId = vpTreasury.Id;

        // Dept Cash & Liquidity Management
        var headCash = await UpsertEmployeeAsync("denny.cash", "denny.cash@starterpack.local", "Denny Setiadi (Head of Cash & Liquidity)", "EMP-0032", "+62 811-2000-032", RoleNames.Manager, dirFinance, divTreasury, deptCash, posMgr, vpTreasury);
        deptCash.HeadUserId = headCash.Id;
        var leadCash = await UpsertEmployeeAsync("mira.cash", "mira.cash@starterpack.local", "Mira Andini (Treasury Supervisor)", "EMP-0033", "+62 811-2000-033", RoleNames.Staff, dirFinance, divTreasury, deptCash, posLead, headCash);
        await UpsertEmployeeAsync("kevin.cash", "kevin.cash@starterpack.local", "Kevin Setiawan (Treasury Analyst)", "EMP-0014", "+62 811-2000-014", RoleNames.Staff, dirFinance, divTreasury, deptCash, posStaff, leadCash);
        await UpsertEmployeeAsync("galih.cash", "galih.cash@starterpack.local", "Galih Prakasa (Cash Operations Staff)", "EMP-0034", "+62 811-2000-034", RoleNames.Staff, dirFinance, divTreasury, deptCash, posStaff, leadCash);

        // Dept FP&A & Budgeting
        var headFpna = await UpsertEmployeeAsync("vincent.fpna", "vincent.fpna@starterpack.local", "Vincent Halim (Head of FP&A & Budgeting)", "EMP-0035", "+62 811-2000-035", RoleNames.Manager, dirFinance, divTreasury, deptFpna, posMgr, vpTreasury);
        deptFpna.HeadUserId = headFpna.Id;
        await UpsertEmployeeAsync("shintia.fpna", "shintia.fpna@starterpack.local", "Shintia Dewi (Senior Financial Planner)", "EMP-0036", "+62 811-2000-036", RoleNames.Staff, dirFinance, divTreasury, deptFpna, posSrStaff, headFpna);
        await UpsertEmployeeAsync("melisa.fpna", "melisa.fpna@starterpack.local", "Melisa Gunawan (FP&A Analyst)", "EMP-0015", "+62 811-2000-015", RoleNames.Staff, dirFinance, divTreasury, deptFpna, posStaff, headFpna);

        // ==================== DIREKTORAT 2: TECHNOLOGY & DIGITAL (CTO) ====================
        // Divisi Software Engineering — Div Head
        var vpEng = await UpsertEmployeeAsync("manager", "manager@starterpack.local", "Andi Pratama (VP Engineering)", "EMP-0004", "+62 811-1000-003", RoleNames.Manager, dirTech, divEngineering, null, posVp, ctoBudi);
        divEngineering.HeadUserId = vpEng.Id;

        // Dept Backend & Microservices
        var headBe = await UpsertEmployeeAsync("alvin.be", "alvin.be@starterpack.local", "Alvin Santoso (Head of Backend Engineering)", "EMP-0037", "+62 811-2000-037", RoleNames.Manager, dirTech, divEngineering, deptBe, posMgr, vpEng);
        deptBe.HeadUserId = headBe.Id;
        var leadBe = await UpsertEmployeeAsync("rafi.be", "rafi.be@starterpack.local", "Rafi Pratama (Backend Tech Lead)", "EMP-0016", "+62 811-2000-016", RoleNames.Staff, dirTech, divEngineering, deptBe, posLead, headBe);
        await UpsertEmployeeAsync("ilham.be", "ilham.be@starterpack.local", "Ilham Fauzi (Senior .NET Engineer)", "EMP-0038", "+62 811-2000-038", RoleNames.Staff, dirTech, divEngineering, deptBe, posSrStaff, leadBe);
        await UpsertEmployeeAsync("naufal.be", "naufal.be@starterpack.local", "Naufal Rizky (Backend Developer)", "EMP-0039", "+62 811-2000-039", RoleNames.Staff, dirTech, divEngineering, deptBe, posStaff, leadBe);

        // Dept Frontend & Product UI
        var headFe = await UpsertEmployeeAsync("jessica.fe", "jessica.fe@starterpack.local", "Jessica Lim (Head of Frontend & UI)", "EMP-0040", "+62 811-2000-040", RoleNames.Manager, dirTech, divEngineering, deptFe, posMgr, vpEng);
        deptFe.HeadUserId = headFe.Id;
        await UpsertEmployeeAsync("dimas.ui", "dimas.ui@starterpack.local", "Dimas Aditya (Senior UI/UX Engineer)", "EMP-0041", "+62 811-2000-041", RoleNames.Staff, dirTech, divEngineering, deptFe, posSrStaff, headFe);
        await UpsertEmployeeAsync("tiara.fe", "tiara.fe@starterpack.local", "Tiara Permata (Frontend Engineer)", "EMP-0017", "+62 811-2000-017", RoleNames.Staff, dirTech, divEngineering, deptFe, posStaff, headFe);
        await UpsertEmployeeAsync("keisha.fe", "keisha.fe@starterpack.local", "Keisha Putri (Frontend Developer)", "EMP-0042", "+62 811-2000-042", RoleNames.Staff, dirTech, divEngineering, deptFe, posStaff, headFe);

        // Divisi IT Infrastructure & Security — Div Head
        var vpInfra = await UpsertEmployeeAsync("itlead", "itlead@starterpack.local", "Hendra Wijaya (VP IT Infrastructure)", "EMP-0005", "+62 811-1000-006", RoleNames.ITLead, dirTech, divInfra, null, posVp, ctoBudi);
        divInfra.HeadUserId = vpInfra.Id;

        // Dept Cloud & DevOps
        var headCloud = await UpsertEmployeeAsync("arif.cloud", "arif.cloud@starterpack.local", "Arif Budiman (Head of Cloud & DevOps)", "EMP-0043", "+62 811-2000-043", RoleNames.ITLead, dirTech, divInfra, deptCloud, posMgr, vpInfra);
        deptCloud.HeadUserId = headCloud.Id;
        await UpsertEmployeeAsync("bagas.devops", "bagas.devops@starterpack.local", "Bagas Saputra (Senior DevOps Engineer)", "EMP-0018", "+62 811-2000-018", RoleNames.Staff, dirTech, divInfra, deptCloud, posSrStaff, headCloud);
        await UpsertEmployeeAsync("fadhil.cloud", "fadhil.cloud@starterpack.local", "Fadhil Rahman (Cloud Reliability Engineer)", "EMP-0044", "+62 811-2000-044", RoleNames.Staff, dirTech, divInfra, deptCloud, posStaff, headCloud);

        // Dept Cybersecurity & System Ops
        var headSec = await UpsertEmployeeAsync("admin", "admin@starterpack.local", "Siti Rahmawati (Head of System Ops & Security)", "EMP-0006", "+62 811-1000-002", RoleNames.Admin, dirTech, divInfra, deptSec, posMgr, vpInfra);
        deptSec.HeadUserId = headSec.Id;
        await UpsertEmployeeAsync("reza.sec", "reza.sec@starterpack.local", "Reza Pahlevi (Cybersecurity Analyst)", "EMP-0045", "+62 811-2000-045", RoleNames.Staff, dirTech, divInfra, deptSec, posSrStaff, headSec);
        await UpsertEmployeeAsync("tania.ops", "tania.ops@starterpack.local", "Tania Kusuma (IT Support & SysOps Staff)", "EMP-0046", "+62 811-2000-046", RoleNames.Staff, dirTech, divInfra, deptSec, posStaff, headSec);

        // ==================== DIREKTORAT 3: HUMAN CAPITAL & GA (CHRO) ====================
        // Divisi Human Resources — Div Head baru khusus level VP
        var vpHr = await UpsertEmployeeAsync("nadia.vphr", "nadia.vphr@starterpack.local", "Nadia Larasati (VP Human Resources)", "EMP-0047", "+62 811-2000-047", RoleNames.HRManager, dirHrGa, divHr, null, posVp, chroRina);
        divHr.HeadUserId = vpHr.Id;

        // Dept People Operations & Comms
        var headPeople = await UpsertEmployeeAsync("maya.people", "maya.people@starterpack.local", "Maya Anggraini (Head of People Operations)", "EMP-0048", "+62 811-2000-048", RoleNames.HRManager, dirHrGa, divHr, deptPeople, posMgr, vpHr);
        deptPeople.HeadUserId = headPeople.Id;
        var hrSpv = await UpsertEmployeeAsync("hrsupervisor", "hrsupervisor@starterpack.local", "Dimas Prakoso (HR Supervisor)", "EMP-0008", "+62 811-1000-009", RoleNames.HRSupervisor, dirHrGa, divHr, deptPeople, posLead, headPeople);
        await UpsertEmployeeAsync("hrstaff", "hrstaff@starterpack.local", "Nadia Putri (HR Staff)", "EMP-0009", "+62 811-1000-010", RoleNames.HRStaff, dirHrGa, divHr, deptPeople, posStaff, hrSpv);
        await UpsertEmployeeAsync("laras.hr", "laras.hr@starterpack.local", "Larasati Wibowo (Payroll & Benefit Staff)", "EMP-0049", "+62 811-2000-049", RoleNames.HRStaff, dirHrGa, divHr, deptPeople, posStaff, hrSpv);

        // Dept Talent Acquisition & L&D
        var headRecruit = await UpsertEmployeeAsync("indra.talent", "indra.talent@starterpack.local", "Indra Permana (Head of Talent & L&D)", "EMP-0050", "+62 811-2000-050", RoleNames.HRSupervisor, dirHrGa, divHr, deptRecruit, posMgr, vpHr);
        deptRecruit.HeadUserId = headRecruit.Id;
        await UpsertEmployeeAsync("bella.lnd", "bella.lnd@starterpack.local", "Bella Oktaviani (Learning & Development Specialist)", "EMP-0051", "+62 811-2000-051", RoleNames.HRStaff, dirHrGa, divHr, deptRecruit, posSrStaff, headRecruit);
        await UpsertEmployeeAsync("citra.talent", "citra.talent@starterpack.local", "Citra Melati (Talent Acquisition Staff)", "EMP-0019", "+62 811-2000-019", RoleNames.HRStaff, dirHrGa, divHr, deptRecruit, posStaff, headRecruit);

        // Divisi General Affairs — Div Head
        var vpGa = await UpsertEmployeeAsync("fajar.ga", "fajar.ga@starterpack.local", "Fajar Nugroho (VP General Affairs)", "EMP-0020", "+62 811-2000-020", RoleNames.Manager, dirHrGa, divGa, null, posVp, chroRina);
        divGa.HeadUserId = vpGa.Id;

        // Dept Facility & Office Asset
        var headFacility = await UpsertEmployeeAsync("eko.ga", "eko.ga@starterpack.local", "Eko Prasetyo (Head of Facility & Asset)", "EMP-0052", "+62 811-2000-052", RoleNames.Manager, dirHrGa, divGa, deptFacility, posMgr, vpGa);
        deptFacility.HeadUserId = headFacility.Id;
        var leadGa = await UpsertEmployeeAsync("wahyu.ga", "wahyu.ga@starterpack.local", "Wahyu Hidayat (Facility Supervisor)", "EMP-0053", "+62 811-2000-053", RoleNames.Staff, dirHrGa, divGa, deptFacility, posLead, headFacility);
        await UpsertEmployeeAsync("bambang.ga", "bambang.ga@starterpack.local", "Bambang Susanto (GA Operations Staff)", "EMP-0021", "+62 811-2000-021", RoleNames.Staff, dirHrGa, divGa, deptFacility, posStaff, leadGa);
        await UpsertEmployeeAsync("sri.asset", "sri.asset@starterpack.local", "Sri Rahayu (Office Asset Admin)", "EMP-0054", "+62 811-2000-054", RoleNames.Staff, dirHrGa, divGa, deptFacility, posStaff, leadGa);

        // ==================== DIREKTORAT 4: OPERATIONS & AUDIT (COO Reza Mahendra) ====================
        // Divisi Supply Chain & Procurement — Div Head baru khusus level VP
        var vpProc = await UpsertEmployeeAsync("bayu.vpops", "bayu.vpops@starterpack.local", "Bayu Perkasa (VP Supply Chain)", "EMP-0055", "+62 811-2000-055", RoleNames.Manager, dirOps, divProc, null, posVp, cooReza);
        divProc.HeadUserId = vpProc.Id;

        // Dept Vendor & Procurement
        var headProc = await UpsertEmployeeAsync("yudi.proc", "yudi.proc@starterpack.local", "Yudi Hartono (Head of Procurement)", "EMP-0056", "+62 811-2000-056", RoleNames.Manager, dirOps, divProc, deptProc, posMgr, vpProc);
        deptProc.HeadUserId = headProc.Id;
        var procLead = await UpsertEmployeeAsync("staff", "staff@starterpack.local", "Dewi Lestari (Procurement Lead)", "EMP-0022", "+62 811-1000-004", RoleNames.Staff, dirOps, divProc, deptProc, posLead, headProc);
        await UpsertEmployeeAsync("yoga.proc", "yoga.proc@starterpack.local", "Yoga Saputra (Procurement Staff)", "EMP-0023", "+62 811-2000-023", RoleNames.Staff, dirOps, divProc, deptProc, posStaff, procLead);
        await UpsertEmployeeAsync("anita.vendor", "anita.vendor@starterpack.local", "Anita Sari (Vendor Relations Staff)", "EMP-0057", "+62 811-2000-057", RoleNames.Staff, dirOps, divProc, deptProc, posStaff, procLead);

        // Dept Warehouse & Fulfillment
        var headWh = await UpsertEmployeeAsync("agustinus.wh", "agustinus.wh@starterpack.local", "Agustinus Wijaya (Head of Warehouse)", "EMP-0058", "+62 811-2000-058", RoleNames.Manager, dirOps, divProc, deptWh, posMgr, vpProc);
        deptWh.HeadUserId = headWh.Id;
        var leadWh = await UpsertEmployeeAsync("rendi.wh", "rendi.wh@starterpack.local", "Rendi Kurnia (Warehouse Supervisor)", "EMP-0059", "+62 811-2000-059", RoleNames.Staff, dirOps, divProc, deptWh, posLead, headWh);
        await UpsertEmployeeAsync("putri.ops", "putri.ops@starterpack.local", "Putri Wulandari (Warehouse Staff)", "EMP-0024", "+62 811-2000-024", RoleNames.Staff, dirOps, divProc, deptWh, posStaff, leadWh);
        await UpsertEmployeeAsync("danu.log", "danu.log@starterpack.local", "Danu Prasetya (Logistics & Fulfillment Staff)", "EMP-0060", "+62 811-2000-060", RoleNames.Staff, dirOps, divProc, deptWh, posStaff, leadWh);

        // Divisi Internal Audit & Risk — Div Head
        var vpAudit = await UpsertEmployeeAsync("viewer", "viewer@starterpack.local", "Rizky Ramadhan (VP Internal Audit)", "EMP-0025", "+62 811-1000-005", RoleNames.Viewer, dirOps, divAudit, null, posVp, cooReza);
        divAudit.HeadUserId = vpAudit.Id;

        // Dept Corporate Risk & Audit
        var headAudit = await UpsertEmployeeAsync("kartika.audit", "kartika.audit@starterpack.local", "Kartika Sari (Head of Corporate Risk & Audit)", "EMP-0061", "+62 811-2000-061", RoleNames.Viewer, dirOps, divAudit, deptAudit, posMgr, vpAudit);
        deptAudit.HeadUserId = headAudit.Id;
        await UpsertEmployeeAsync("luthfi.audit", "luthfi.audit@starterpack.local", "Luthfi Hidayat (Senior Internal Auditor)", "EMP-0026", "+62 811-2000-026", RoleNames.Viewer, dirOps, divAudit, deptAudit, posAuditor, headAudit);
        await UpsertEmployeeAsync("nadine.risk", "nadine.risk@starterpack.local", "Nadine Kusuma (Risk & Compliance Auditor)", "EMP-0062", "+62 811-2000-062", RoleNames.Viewer, dirOps, divAudit, deptAudit, posAuditor, headAudit);
        await UpsertEmployeeAsync("gilang.audit", "gilang.audit@starterpack.local", "Gilang Mahendra (IT & Process Auditor)", "EMP-0063", "+62 811-2000-063", RoleNames.Viewer, dirOps, divAudit, deptAudit, posAuditor, headAudit);

        await dbContext.SaveChangesAsync(cancellationToken);
        logger.LogInformation("[Identity.Api] Expanded corporate employees seeded! Total 63 employees (4 C-Level, 8 Div Heads, 14 Dept Heads, 37 Leads & Staff).");
    }

    /// <summary>
    /// Auto-upgrade aman untuk MasterData.Api (Port 5086):
    /// menambahkan permission Lookups.View &amp; Lookups.Manage serta menu sidebar Master Data (Lookups) di /lookups.
    /// </summary>
    private async Task EnsureMasterDataPermissionsAndMenuAsync(CancellationToken cancellationToken)
    {
        var roles = await dbContext.Roles
            .Include(r => r.RolePermissions)
            .ToListAsync(cancellationToken);

        var managerOrHigher = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            RoleNames.SuperAdmin,
            RoleNames.Admin
        };

        var viewRoles = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            RoleNames.SuperAdmin,
            RoleNames.Admin,
            RoleNames.Manager,
            RoleNames.Viewer
        };

        var changed = false;

        foreach (var role in roles)
        {
            var toGrant = new List<string>();
            if (viewRoles.Contains(role.Name))
            {
                toGrant.Add(Permissions.Lookups.View);
            }
            if (managerOrHigher.Contains(role.Name))
            {
                toGrant.Add(Permissions.Lookups.Manage);
            }

            foreach (var code in toGrant)
            {
                if (!role.RolePermissions.Any(rp => rp.PermissionCode == code))
                {
                    await dbContext.RolePermissions.AddAsync(new RolePermission
                    {
                        RoleId = role.Id,
                        PermissionCode = code,
                        CreatedBy = "SystemSeeder"
                    }, cancellationToken);
                    changed = true;
                }
            }
        }

        var existingMenu = await dbContext.MenuItems
            .FirstOrDefaultAsync(m => m.Code == "lookups" || m.Path == "/lookups", cancellationToken);

        if (existingMenu is null)
        {
            existingMenu = new MenuItem
            {
                Code = "lookups",
                Title = "Master Lookups",
                Path = "/lookups",
                Icon = "Database",
                GroupName = "SYSTEM MESH",
                SortOrder = 10,
                RequiredPermission = Permissions.Lookups.View,
                IsVisible = true,
                Description = "Unified Master Data & Lookup Table (Kategori Produk, Satuan, Metode Bayar, Prioritas, dll.)",
                CreatedBy = "SystemSeeder"
            };
            await dbContext.MenuItems.AddAsync(existingMenu, cancellationToken);
            changed = true;
        }

        var existingRoleMenus = await dbContext.RoleMenus
            .Where(rm => rm.MenuItemId == existingMenu.Id)
            .ToListAsync(cancellationToken);

        foreach (var role in roles.Where(r => viewRoles.Contains(r.Name)))
        {
            if (!existingRoleMenus.Any(rm => rm.RoleId == role.Id))
            {
                await dbContext.RoleMenus.AddAsync(new RoleMenu
                {
                    RoleId = role.Id,
                    MenuItemId = existingMenu.Id,
                    CreatedBy = "SystemSeeder"
                }, cancellationToken);
                changed = true;
            }
        }

        if (changed)
        {
            await dbContext.SaveChangesAsync(cancellationToken);
            logger.LogInformation("[Identity.Api] Ensured MasterData.Api permissions (Lookups.View/Manage) & sidebar menu (/lookups).");
        }
    }

    /// <summary>
    /// Auto-upgrade aman untuk Tracking.Api (Port 5087):
    /// menambahkan permission Tracking.View / Tracking.Dispatch / Tracking.Operate serta menu sidebar Live Tracking di /tracking.
    /// </summary>
    private async Task EnsureTrackingPermissionsAndMenuAsync(CancellationToken cancellationToken)
    {
        var roles = await dbContext.Roles
            .Include(r => r.RolePermissions)
            .ToListAsync(cancellationToken);

        var dispatchRoles = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            RoleNames.SuperAdmin,
            RoleNames.Admin,
            RoleNames.Manager
        };

        var operateRoles = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            RoleNames.SuperAdmin,
            RoleNames.Admin,
            RoleNames.Manager,
            RoleNames.Staff
        };

        var viewRoles = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            RoleNames.SuperAdmin,
            RoleNames.Admin,
            RoleNames.Manager,
            RoleNames.Staff,
            RoleNames.Viewer
        };

        var changed = false;

        foreach (var role in roles)
        {
            var toGrant = new List<string>();
            if (viewRoles.Contains(role.Name)) toGrant.Add(Permissions.Tracking.View);
            if (dispatchRoles.Contains(role.Name)) toGrant.Add(Permissions.Tracking.Dispatch);
            if (operateRoles.Contains(role.Name)) toGrant.Add(Permissions.Tracking.Operate);

            foreach (var code in toGrant)
            {
                if (!role.RolePermissions.Any(rp => rp.PermissionCode == code))
                {
                    await dbContext.RolePermissions.AddAsync(new RolePermission
                    {
                        RoleId = role.Id,
                        PermissionCode = code,
                        CreatedBy = "SystemSeeder"
                    }, cancellationToken);
                    changed = true;
                }
            }
        }

        var existingMenu = await dbContext.MenuItems
            .FirstOrDefaultAsync(m => m.Code == "live-tracking" || m.Path == "/tracking", cancellationToken);

        if (existingMenu is null)
        {
            existingMenu = new MenuItem
            {
                Code = "live-tracking",
                Title = "Live Tracking",
                Path = "/tracking",
                Icon = "MapPin",
                GroupName = "OPERASIONAL BISNIS",
                SortOrder = 6,
                RequiredPermission = Permissions.Tracking.View,
                IsVisible = true,
                Description = "Field Dispatch & Live Location Tracking (Peta Command Center Realtime, Geofence, & Proof of Delivery)",
                CreatedBy = "SystemSeeder"
            };
            await dbContext.MenuItems.AddAsync(existingMenu, cancellationToken);
            changed = true;
        }

        var existingRoleMenus = await dbContext.RoleMenus
            .Where(rm => rm.MenuItemId == existingMenu.Id)
            .ToListAsync(cancellationToken);

        foreach (var role in roles.Where(r => viewRoles.Contains(r.Name)))
        {
            if (!existingRoleMenus.Any(rm => rm.RoleId == role.Id))
            {
                await dbContext.RoleMenus.AddAsync(new RoleMenu
                {
                    RoleId = role.Id,
                    MenuItemId = existingMenu.Id,
                    CreatedBy = "SystemSeeder"
                }, cancellationToken);
                changed = true;
            }
        }

        if (changed)
        {
            await dbContext.SaveChangesAsync(cancellationToken);
            logger.LogInformation("[Identity.Api] Ensured Tracking.Api permissions (Tracking.View/Dispatch/Operate) & sidebar menu (/tracking).");
        }
    }
}
