using BuildingBlocks.Core.Common;
using BuildingBlocks.Core.Constants;
using BuildingBlocks.Core.Interfaces;
using Identity.Api.Application.DTOs;
using Identity.Api.Application.Interfaces;
using Identity.Api.Domain.Entities;
using Identity.Api.Domain.Interfaces;

namespace Identity.Api.Application.Services;

public class UserService(
    IIdentityUnitOfWork unitOfWork,
    IPasswordHasher passwordHasher,
    ICurrentUserService currentUserService,
    ICacheService? cacheService = null) : IUserService
{
    public async Task<Result<IReadOnlyList<UserDto>>> GetAllUsersAsync(
        string? search = null,
        string? role = null,
        CancellationToken cancellationToken = default)
    {
        List<UserDto> allDtos;
        if (cacheService is not null)
        {
            allDtos = await cacheService.GetOrCreateAsync(
                CacheKeys.AllUsers(),
                async ct =>
                {
                    var users = await unitOfWork.Users.GetAllWithRolesAsync(ct);
                    return users.Select(MapToDto).ToList();
                },
                TimeSpan.FromMinutes(15),
                cancellationToken);
        }
        else
        {
            var users = await unitOfWork.Users.GetAllWithRolesAsync(cancellationToken);
            allDtos = users.Select(MapToDto).ToList();
        }

        IEnumerable<UserDto> filtered = allDtos;
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            filtered = filtered.Where(u =>
                u.Username.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                u.FullName.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                u.Email.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                (u.EmployeeCode?.Contains(term, StringComparison.OrdinalIgnoreCase) ?? false) ||
                (u.Department?.Contains(term, StringComparison.OrdinalIgnoreCase) ?? false) ||
                (u.DirectorateName?.Contains(term, StringComparison.OrdinalIgnoreCase) ?? false) ||
                (u.DivisionName?.Contains(term, StringComparison.OrdinalIgnoreCase) ?? false) ||
                (u.DepartmentName?.Contains(term, StringComparison.OrdinalIgnoreCase) ?? false) ||
                (u.PositionName?.Contains(term, StringComparison.OrdinalIgnoreCase) ?? false));
        }

        if (!string.IsNullOrWhiteSpace(role))
        {
            var roleTerm = role.Trim();
            filtered = filtered.Where(u =>
                u.Roles.Any(r => r.Equals(roleTerm, StringComparison.OrdinalIgnoreCase)));
        }

        return Result<IReadOnlyList<UserDto>>.Success(filtered.ToList());
    }

    public async Task<Result<UserDto>> GetUserByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var user = await unitOfWork.Users.GetWithRolesAndPermissionsByIdAsync(id, cancellationToken);
        if (user is null)
        {
            return Result<UserDto>.Failure("Pengguna tidak ditemukan.", 404);
        }

        return Result<UserDto>.Success(MapToDto(user));
    }

    public async Task<Result<UserDto>> CreateUserAsync(CreateUserRequest request, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.Username) ||
            string.IsNullOrWhiteSpace(request.Email) ||
            string.IsNullOrWhiteSpace(request.Password))
        {
            return Result<UserDto>.Failure("Username, Email, dan Password wajib diisi.", 400);
        }

        var passwordError = AuthService.ValidatePasswordStrength(request.Password);
        if (passwordError is not null)
        {
            return Result<UserDto>.Failure(passwordError, 400);
        }

        var username = request.Username.Trim().ToLowerInvariant();
        var email = request.Email.Trim().ToLowerInvariant();

        if (await unitOfWork.Users.AnyAsync(u => u.Username.ToLower() == username || u.Email.ToLower() == email, cancellationToken))
        {
            return Result<UserDto>.Failure("Username atau Email sudah terdaftar.", 409);
        }

        var allRoles = await unitOfWork.Roles.GetListAsync(cancellationToken: cancellationToken);
        var requestedRoleNames = request.Roles?.Count > 0 ? request.Roles : [RoleNames.Viewer];

        var matchedRoles = allRoles
            .Where(r => requestedRoleNames.Contains(r.Name, StringComparer.OrdinalIgnoreCase))
            .ToList();

        if (matchedRoles.Count == 0)
        {
            return Result<UserDto>.Failure("Minimal satu role yang valid harus dipilih.", 400);
        }

        // Anti-Privilege-Escalation Guard: hanya SuperAdmin yang boleh menetapkan role SuperAdmin
        var callerIsSuperAdmin = currentUserService.Roles.Contains(RoleNames.SuperAdmin, StringComparer.OrdinalIgnoreCase);
        if (!callerIsSuperAdmin &&
            matchedRoles.Any(r => r.Name.Equals(RoleNames.SuperAdmin, StringComparison.OrdinalIgnoreCase)))
        {
            return Result<UserDto>.Failure("Akses ditolak. Hanya SuperAdmin yang diizinkan menetapkan role SuperAdmin.", 403);
        }

        if (!Enum.TryParse<UserStatus>(request.Status, true, out var status))
        {
            status = UserStatus.Active;
        }

        string? resolvedDeptText = request.Department?.Trim();
        if (string.IsNullOrWhiteSpace(resolvedDeptText) && request.DepartmentId.HasValue)
        {
            var dept = await unitOfWork.Repository<Department>().GetByIdAsync(request.DepartmentId.Value, cancellationToken);
            resolvedDeptText = dept?.Name;
        }

        var user = new User
        {
            Username = username,
            Email = email,
            FullName = request.FullName.Trim(),
            PasswordHash = passwordHasher.HashPassword(request.Password),
            EmployeeCode = string.IsNullOrWhiteSpace(request.EmployeeCode) ? null : request.EmployeeCode.Trim().ToUpperInvariant(),
            PhoneNumber = request.PhoneNumber?.Trim(),
            Department = resolvedDeptText,
            DirectorateId = request.DirectorateId,
            DivisionId = request.DivisionId,
            DepartmentId = request.DepartmentId,
            PositionId = request.PositionId,
            ManagerUserId = request.ManagerUserId,
            Status = status,
            CreatedBy = currentUserService.Username ?? "System"
        };

        foreach (var role in matchedRoles)
        {
            user.UserRoles.Add(new UserRole
            {
                UserId = user.Id,
                RoleId = role.Id,
                Role = role
            });
        }

        await unitOfWork.Users.AddAsync(user, cancellationToken);
        await unitOfWork.Repository<AuditLog>().AddAsync(new AuditLog
        {
            UserId = currentUserService.UserId,
            UserName = currentUserService.Username ?? "System",
            Action = "CREATE_USER",
            Module = "Users",
            EntityId = user.Id.ToString(),
            Details = $"[Identity.Api] Membuat akun pengguna '{user.Username}' dengan role [{string.Join(", ", matchedRoles.Select(r => r.Name))}].",
            IpAddress = currentUserService.IpAddress
        }, cancellationToken);

        await unitOfWork.SaveChangesAsync(cancellationToken);
        await InvalidateUserCachesAsync(cancellationToken);
        var loaded = await unitOfWork.Users.GetWithRolesAndPermissionsByIdAsync(user.Id, cancellationToken);
        return Result<UserDto>.Success(MapToDto(loaded ?? user), "Pengguna berhasil ditambahkan.", 201);
    }

    public async Task<Result<UserDto>> UpdateUserAsync(Guid id, UpdateUserRequest request, CancellationToken cancellationToken = default)
    {
        var user = await unitOfWork.Users.GetWithRolesAndPermissionsByIdAsync(id, cancellationToken);
        if (user is null)
        {
            return Result<UserDto>.Failure("Pengguna tidak ditemukan.", 404);
        }

        var callerIsSuperAdmin = currentUserService.Roles.Contains(RoleNames.SuperAdmin, StringComparer.OrdinalIgnoreCase);
        var targetIsSuperAdmin =
            user.Username.Equals("superadmin", StringComparison.OrdinalIgnoreCase) ||
            user.UserRoles.Any(ur => ur.Role is not null && !ur.Role.IsDeleted &&
                                     ur.Role.Name.Equals(RoleNames.SuperAdmin, StringComparison.OrdinalIgnoreCase));

        // Anti-Privilege-Escalation Guard: non-SuperAdmin tidak boleh memodifikasi/reset password akun SuperAdmin
        if (targetIsSuperAdmin && !callerIsSuperAdmin)
        {
            return Result<UserDto>.Failure("Akses ditolak. Hanya SuperAdmin yang diizinkan mengubah data atau password akun SuperAdmin.", 403);
        }

        var email = request.Email.Trim().ToLowerInvariant();
        if (await unitOfWork.Users.AnyAsync(u => u.Id != id && u.Email.ToLower() == email, cancellationToken))
        {
            return Result<UserDto>.Failure("Email sudah digunakan oleh pengguna lain.", 409);
        }

        string? resolvedDeptText = request.Department?.Trim();
        if (request.DepartmentId.HasValue)
        {
            var dept = await unitOfWork.Repository<Department>().GetByIdAsync(request.DepartmentId.Value, cancellationToken);
            if (dept is not null) resolvedDeptText = dept.Name;
        }

        user.Email = email;
        user.FullName = request.FullName.Trim();
        user.EmployeeCode = string.IsNullOrWhiteSpace(request.EmployeeCode) ? user.EmployeeCode : request.EmployeeCode.Trim().ToUpperInvariant();
        user.PhoneNumber = request.PhoneNumber?.Trim();
        user.Department = resolvedDeptText;
        user.DirectorateId = request.DirectorateId;
        user.DivisionId = request.DivisionId;
        user.DepartmentId = request.DepartmentId;
        user.PositionId = request.PositionId;
        user.ManagerUserId = request.ManagerUserId == id ? null : request.ManagerUserId;
        user.UpdatedAt = DateTime.UtcNow;
        user.UpdatedBy = currentUserService.Username ?? "System";

        var shouldRevokeSessions = false;

        if (Enum.TryParse<UserStatus>(request.Status, true, out var status))
        {
            if (user.Username.Equals("superadmin", StringComparison.OrdinalIgnoreCase) && status != UserStatus.Active)
            {
                return Result<UserDto>.Failure("Akun SuperAdmin utama tidak dapat dinonaktifkan.", 400);
            }
            if (status != UserStatus.Active)
            {
                shouldRevokeSessions = true;
            }
            user.Status = status;
        }

        if (!string.IsNullOrWhiteSpace(request.NewPassword))
        {
            var passwordError = AuthService.ValidatePasswordStrength(request.NewPassword);
            if (passwordError is not null)
            {
                return Result<UserDto>.Failure(passwordError, 400);
            }

            user.PasswordHash = passwordHasher.HashPassword(request.NewPassword);
            shouldRevokeSessions = true;
        }

        if (request.Roles is { Count: > 0 })
        {
            var allRoles = await unitOfWork.Roles.GetListAsync(cancellationToken: cancellationToken);
            var matchedRoles = allRoles
                .Where(r => request.Roles.Contains(r.Name, StringComparer.OrdinalIgnoreCase))
                .ToList();

            if (!callerIsSuperAdmin &&
                matchedRoles.Any(r => r.Name.Equals(RoleNames.SuperAdmin, StringComparison.OrdinalIgnoreCase)))
            {
                return Result<UserDto>.Failure("Akses ditolak. Hanya SuperAdmin yang diizinkan menetapkan role SuperAdmin.", 403);
            }

            if (user.Username.Equals("superadmin", StringComparison.OrdinalIgnoreCase) &&
                !matchedRoles.Any(r => r.Name.Equals(RoleNames.SuperAdmin, StringComparison.OrdinalIgnoreCase)))
            {
                return Result<UserDto>.Failure("Role SuperAdmin tidak dapat dihapus dari akun superadmin utama.", 400);
            }

            if (matchedRoles.Count > 0)
            {
                var existingUserRoles = await unitOfWork.Repository<UserRole>()
                    .GetListAsync(ur => ur.UserId == user.Id, cancellationToken);
                foreach (var ur in existingUserRoles)
                {
                    unitOfWork.Repository<UserRole>().HardRemove(ur);
                }

                user.UserRoles.Clear();
                foreach (var role in matchedRoles)
                {
                    var newUr = new UserRole
                    {
                        UserId = user.Id,
                        RoleId = role.Id,
                        Role = role
                    };
                    await unitOfWork.Repository<UserRole>().AddAsync(newUr, cancellationToken);
                    user.UserRoles.Add(newUr);
                }
            }
        }

        if (shouldRevokeSessions)
        {
            var activeTokens = await unitOfWork.Repository<RefreshToken>()
                .GetListAsync(rt => rt.UserId == user.Id && rt.RevokedAt == null, cancellationToken);
            foreach (var rt in activeTokens)
            {
                rt.RevokedAt = DateTime.UtcNow;
                unitOfWork.Repository<RefreshToken>().Update(rt);
            }
        }

        unitOfWork.Users.Update(user);
        await unitOfWork.Repository<AuditLog>().AddAsync(new AuditLog
        {
            UserId = currentUserService.UserId,
            UserName = currentUserService.Username ?? "System",
            Action = "UPDATE_USER",
            Module = "Users",
            EntityId = user.Id.ToString(),
            Details = $"[Identity.Api] Memperbarui akun pengguna '{user.Username}'.",
            IpAddress = currentUserService.IpAddress
        }, cancellationToken);

        await unitOfWork.SaveChangesAsync(cancellationToken);
        await InvalidateUserCachesAsync(cancellationToken);
        var loaded = await unitOfWork.Users.GetWithRolesAndPermissionsByIdAsync(id, cancellationToken);
        return Result<UserDto>.Success(MapToDto(loaded ?? user), "Data pengguna berhasil diperbarui.");
    }

    public async Task<Result> DeleteUserAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var user = await unitOfWork.Users.GetWithRolesAndPermissionsByIdAsync(id, cancellationToken);
        if (user is null)
        {
            return Result.Failure("Pengguna tidak ditemukan.", 404);
        }

        if (user.Username.Equals("superadmin", StringComparison.OrdinalIgnoreCase))
        {
            return Result.Failure("Akun SuperAdmin utama tidak dapat dihapus.", 400);
        }

        var callerIsSuperAdmin = currentUserService.Roles.Contains(RoleNames.SuperAdmin, StringComparer.OrdinalIgnoreCase);
        var targetIsSuperAdmin = user.UserRoles.Any(ur => ur.Role is not null && !ur.Role.IsDeleted &&
                                                          ur.Role.Name.Equals(RoleNames.SuperAdmin, StringComparison.OrdinalIgnoreCase));
        if (targetIsSuperAdmin && !callerIsSuperAdmin)
        {
            return Result.Failure("Akses ditolak. Hanya SuperAdmin yang diizinkan menghapus akun SuperAdmin.", 403);
        }

        if (currentUserService.UserId == user.Id)
        {
            return Result.Failure("Anda tidak dapat menghapus akun Anda sendiri yang sedang login.", 400);
        }

        var activeTokens = await unitOfWork.Repository<RefreshToken>()
            .GetListAsync(rt => rt.UserId == user.Id && rt.RevokedAt == null, cancellationToken);
        foreach (var rt in activeTokens)
        {
            rt.RevokedAt = DateTime.UtcNow;
            unitOfWork.Repository<RefreshToken>().Update(rt);
        }

        unitOfWork.Users.Remove(user);
        await unitOfWork.Repository<AuditLog>().AddAsync(new AuditLog
        {
            UserId = currentUserService.UserId,
            UserName = currentUserService.Username ?? "System",
            Action = "DELETE_USER",
            Module = "Users",
            EntityId = user.Id.ToString(),
            Details = $"[Identity.Api] Menghapus akun pengguna '{user.Username}'.",
            IpAddress = currentUserService.IpAddress
        }, cancellationToken);

        await unitOfWork.SaveChangesAsync(cancellationToken);
        await InvalidateUserCachesAsync(cancellationToken);
        return Result.Success("Pengguna berhasil dihapus.");
    }

    private async Task InvalidateUserCachesAsync(CancellationToken cancellationToken)
    {
        if (cacheService is null) return;
        await cacheService.RemoveByPrefixAsync(CacheKeys.UsersPrefix, cancellationToken);
        await cacheService.RemoveByPrefixAsync(CacheKeys.RolesPrefix, cancellationToken);
        await cacheService.RemoveByPrefixAsync(CacheKeys.OrganizationPrefix, cancellationToken);
        await cacheService.RemoveByPrefixAsync(CacheKeys.DashboardPrefix, cancellationToken);
    }

    private static UserDto MapToDto(User user) =>
        new(
            user.Id,
            user.Username,
            user.Email,
            user.FullName,
            user.PhoneNumber,
            user.DepartmentEntity?.Name ?? user.Department,
            user.Status.ToString(),
            user.UserRoles
                .Where(ur => ur.Role is not null && !ur.Role.IsDeleted)
                .Select(ur => ur.Role.Name)
                .Distinct()
                .ToList(),
            user.CreatedAt,
            user.LastLoginAt,
            user.EmployeeCode,
            user.DirectorateId,
            user.Directorate?.Name,
            user.DivisionId,
            user.Division?.Name,
            user.DepartmentId,
            user.DepartmentEntity?.Name,
            user.PositionId,
            user.Position?.Name,
            user.Position?.Level,
            user.ManagerUserId,
            user.Manager?.FullName);
}
