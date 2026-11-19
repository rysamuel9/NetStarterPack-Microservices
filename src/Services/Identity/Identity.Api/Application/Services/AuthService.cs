using BuildingBlocks.Core.Common;
using BuildingBlocks.Core.Constants;
using BuildingBlocks.Core.Interfaces;
using Identity.Api.Application.DTOs;
using Identity.Api.Application.Interfaces;
using Identity.Api.Domain.Entities;
using Identity.Api.Domain.Interfaces;

namespace Identity.Api.Application.Services;

public class AuthService(
    IIdentityUnitOfWork unitOfWork,
    IJwtTokenService jwtTokenService,
    IPasswordHasher passwordHasher,
    ICurrentUserService currentUserService,
    ICacheService? cacheService = null) : IAuthService
{
    public async Task<Result<AuthResponse>> LoginAsync(LoginRequest request, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.UsernameOrEmail) || string.IsNullOrWhiteSpace(request.Password))
        {
            return Result<AuthResponse>.Failure("Username/Email dan Password wajib diisi.", 400);
        }

        var user = await unitOfWork.Users.GetWithRolesAndPermissionsByUsernameOrEmailAsync(
            request.UsernameOrEmail.Trim(),
            cancellationToken);

        if (user is null || !passwordHasher.VerifyPassword(request.Password, user.PasswordHash))
        {
            return Result<AuthResponse>.Failure("Kredensial login tidak valid (username/email atau password salah).", 401);
        }

        if (user.Status != UserStatus.Active)
        {
            return Result<AuthResponse>.Failure($"Akun Anda saat ini berstatus {user.Status}. Hubungi Administrator.", 403);
        }

        var (roles, permissions) = ExtractRolesAndPermissions(user);
        var (accessToken, expiresAt) = jwtTokenService.GenerateAccessToken(user, roles, permissions);
        var refreshTokenValue = jwtTokenService.GenerateRefreshToken();

        var refreshToken = new RefreshToken
        {
            UserId = user.Id,
            Token = refreshTokenValue,
            ExpiresAt = DateTime.UtcNow.AddDays(jwtTokenService.GetRefreshTokenExpiryDays()),
            CreatedByIp = currentUserService.IpAddress,
            CreatedBy = user.Username
        };

        user.LastLoginAt = DateTime.UtcNow;
        unitOfWork.Users.Update(user);
        await unitOfWork.Repository<RefreshToken>().AddAsync(refreshToken, cancellationToken);

        await unitOfWork.Repository<AuditLog>().AddAsync(new AuditLog
        {
            UserId = user.Id,
            UserName = user.Username,
            Action = "LOGIN",
            Module = "Auth",
            EntityId = user.Id.ToString(),
            Details = $"[Identity.Api] User '{user.Username}' berhasil login dengan role [{string.Join(", ", roles)}].",
            IpAddress = currentUserService.IpAddress
        }, cancellationToken);

        await unitOfWork.SaveChangesAsync(cancellationToken);
        if (cacheService is not null)
        {
            await cacheService.RemoveByPrefixAsync(CacheKeys.UsersPrefix, cancellationToken);
            await cacheService.RemoveByPrefixAsync(CacheKeys.DashboardPrefix, cancellationToken);
        }

        var response = new AuthResponse(
            accessToken,
            refreshTokenValue,
            expiresAt,
            MapToCurrentUserDto(user, roles, permissions));

        return Result<AuthResponse>.Success(response, "Login berhasil.");
    }

    public async Task<Result<AuthResponse>> RefreshTokenAsync(RefreshTokenRequest request, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.RefreshToken))
        {
            return Result<AuthResponse>.Failure("Refresh token wajib diisi.", 400);
        }

        var user = await unitOfWork.Users.GetByRefreshTokenAsync(request.RefreshToken, cancellationToken);
        if (user is null)
        {
            return Result<AuthResponse>.Failure("Refresh token tidak ditemukan atau tidak valid.", 401);
        }

        var existingToken = user.RefreshTokens.FirstOrDefault(rt => rt.Token == request.RefreshToken);
        if (existingToken is null || !existingToken.IsActive)
        {
            return Result<AuthResponse>.Failure("Refresh token sudah kadaluarsa atau dicabut.", 401);
        }

        var newRefreshTokenValue = jwtTokenService.GenerateRefreshToken();
        existingToken.RevokedAt = DateTime.UtcNow;
        existingToken.ReplacedByToken = newRefreshTokenValue;
        unitOfWork.Repository<RefreshToken>().Update(existingToken);

        var newRefreshToken = new RefreshToken
        {
            UserId = user.Id,
            Token = newRefreshTokenValue,
            ExpiresAt = DateTime.UtcNow.AddDays(jwtTokenService.GetRefreshTokenExpiryDays()),
            CreatedByIp = currentUserService.IpAddress,
            CreatedBy = user.Username
        };
        await unitOfWork.Repository<RefreshToken>().AddAsync(newRefreshToken, cancellationToken);

        var (roles, permissions) = ExtractRolesAndPermissions(user);
        var (accessToken, expiresAt) = jwtTokenService.GenerateAccessToken(user, roles, permissions);

        await unitOfWork.SaveChangesAsync(cancellationToken);

        return Result<AuthResponse>.Success(new AuthResponse(
            accessToken,
            newRefreshTokenValue,
            expiresAt,
            MapToCurrentUserDto(user, roles, permissions)), "Token berhasil diperbarui.");
    }

    public async Task<Result> LogoutAsync(string? refreshToken, CancellationToken cancellationToken = default)
    {
        if (!string.IsNullOrWhiteSpace(refreshToken))
        {
            var tokenEntity = await unitOfWork.Repository<RefreshToken>()
                .FirstOrDefaultAsync(rt => rt.Token == refreshToken, cancellationToken);
            if (tokenEntity is not null && tokenEntity.IsActive)
            {
                tokenEntity.RevokedAt = DateTime.UtcNow;
                unitOfWork.Repository<RefreshToken>().Update(tokenEntity);
            }
        }

        if (currentUserService.UserId is not null)
        {
            await unitOfWork.Repository<AuditLog>().AddAsync(new AuditLog
            {
                UserId = currentUserService.UserId,
                UserName = currentUserService.Username ?? "User",
                Action = "LOGOUT",
                Module = "Auth",
                EntityId = currentUserService.UserId.ToString(),
                Details = $"[Identity.Api] User '{currentUserService.Username}' keluar dari sesi aplikasi (logout).",
                IpAddress = currentUserService.IpAddress
            }, cancellationToken);
        }

        await unitOfWork.SaveChangesAsync(cancellationToken);
        if (cacheService is not null)
        {
            await cacheService.RemoveByPrefixAsync(CacheKeys.DashboardPrefix, cancellationToken);
        }
        return Result.Success("Berhasil keluar dari sesi (logout).");
    }

    public async Task<Result> LogoutAllDevicesAsync(CancellationToken cancellationToken = default)
    {
        if (currentUserService.UserId is null)
        {
            return Result.Failure("Tidak terautentikasi.", 401);
        }

        var userId = currentUserService.UserId.Value;
        var activeTokens = await unitOfWork.Repository<RefreshToken>()
            .GetListAsync(rt => rt.UserId == userId && rt.RevokedAt == null, cancellationToken);

        foreach (var token in activeTokens)
        {
            token.RevokedAt = DateTime.UtcNow;
            unitOfWork.Repository<RefreshToken>().Update(token);
        }

        await unitOfWork.Repository<AuditLog>().AddAsync(new AuditLog
        {
            UserId = userId,
            UserName = currentUserService.Username ?? "User",
            Action = "LOGOUT_ALL_DEVICES",
            Module = "Auth",
            EntityId = userId.ToString(),
            Details = $"[Identity.Api] User '{currentUserService.Username}' mencabut seluruh sesi login aktif ({activeTokens.Count} perangkat).",
            IpAddress = currentUserService.IpAddress
        }, cancellationToken);

        await unitOfWork.SaveChangesAsync(cancellationToken);
        if (cacheService is not null)
        {
            await cacheService.RemoveByPrefixAsync(CacheKeys.DashboardPrefix, cancellationToken);
        }
        return Result.Success($"Berhasil keluar dari semua perangkat ({activeTokens.Count} sesi dicabut).");
    }

    public async Task<Result<CurrentUserDto>> GetCurrentUserAsync(CancellationToken cancellationToken = default)
    {
        if (currentUserService.UserId is null)
        {
            return Result<CurrentUserDto>.Failure("Tidak terautentikasi.", 401);
        }

        var user = await unitOfWork.Users.GetWithRolesAndPermissionsByIdAsync(currentUserService.UserId.Value, cancellationToken);
        if (user is null)
        {
            return Result<CurrentUserDto>.Failure("Pengguna tidak ditemukan.", 404);
        }

        var (roles, permissions) = ExtractRolesAndPermissions(user);
        return Result<CurrentUserDto>.Success(MapToCurrentUserDto(user, roles, permissions));
    }

    public async Task<Result<CurrentUserDto>> UpdateProfileAsync(UpdateProfileRequest request, CancellationToken cancellationToken = default)
    {
        if (currentUserService.UserId is null)
        {
            return Result<CurrentUserDto>.Failure("Tidak terautentikasi.", 401);
        }

        var user = await unitOfWork.Users.GetWithRolesAndPermissionsByIdAsync(currentUserService.UserId.Value, cancellationToken);
        if (user is null)
        {
            return Result<CurrentUserDto>.Failure("Pengguna tidak ditemukan.", 404);
        }

        user.FullName = request.FullName.Trim();
        user.Email = request.Email.Trim();
        user.PhoneNumber = request.PhoneNumber?.Trim();
        user.Department = request.Department?.Trim();
        unitOfWork.Users.Update(user);

        await unitOfWork.Repository<AuditLog>().AddAsync(new AuditLog
        {
            UserId = user.Id,
            UserName = user.Username,
            Action = "UPDATE_PROFILE",
            Module = "Auth",
            EntityId = user.Id.ToString(),
            Details = $"[Identity.Api] User '{user.Username}' memperbarui profil pribadi.",
            IpAddress = currentUserService.IpAddress
        }, cancellationToken);

        await unitOfWork.SaveChangesAsync(cancellationToken);
        if (cacheService is not null)
        {
            await cacheService.RemoveByPrefixAsync(CacheKeys.UsersPrefix, cancellationToken);
            await cacheService.RemoveByPrefixAsync(CacheKeys.DashboardPrefix, cancellationToken);
        }

        var (roles, permissions) = ExtractRolesAndPermissions(user);
        return Result<CurrentUserDto>.Success(MapToCurrentUserDto(user, roles, permissions), "Profil berhasil diperbarui.");
    }

    public async Task<Result> ChangePasswordAsync(ChangePasswordRequest request, CancellationToken cancellationToken = default)
    {
        if (currentUserService.UserId is null)
        {
            return Result.Failure("Tidak terautentikasi.", 401);
        }

        if (string.IsNullOrWhiteSpace(request.NewPassword) || request.NewPassword.Length < 6)
        {
            return Result.Failure("Password baru minimal 6 karakter.", 400);
        }

        var user = await unitOfWork.Users.GetByIdAsync(currentUserService.UserId.Value, cancellationToken);
        if (user is null)
        {
            return Result.Failure("Pengguna tidak ditemukan.", 404);
        }

        if (!passwordHasher.VerifyPassword(request.CurrentPassword, user.PasswordHash))
        {
            return Result.Failure("Password saat ini tidak sesuai.", 400);
        }

        user.PasswordHash = passwordHasher.HashPassword(request.NewPassword);
        unitOfWork.Users.Update(user);

        await unitOfWork.Repository<AuditLog>().AddAsync(new AuditLog
        {
            UserId = user.Id,
            UserName = user.Username,
            Action = "CHANGE_PASSWORD",
            Module = "Auth",
            EntityId = user.Id.ToString(),
            Details = $"[Identity.Api] User '{user.Username}' mengganti password.",
            IpAddress = currentUserService.IpAddress
        }, cancellationToken);

        await unitOfWork.SaveChangesAsync(cancellationToken);
        return Result.Success("Password berhasil diperbarui.");
    }

    private static (IReadOnlyList<string> Roles, IReadOnlyList<string> Permissions) ExtractRolesAndPermissions(User user)
    {
        var roles = user.UserRoles
            .Where(ur => ur.Role is not null && !ur.Role.IsDeleted)
            .Select(ur => ur.Role.Name)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (roles.Contains(RoleNames.SuperAdmin, StringComparer.OrdinalIgnoreCase))
        {
            var allPermissions = Permissions.GetAll().Select(p => p.Code).ToList();
            return (roles, allPermissions);
        }

        var permissions = user.UserRoles
            .Where(ur => ur.Role is not null && !ur.Role.IsDeleted)
            .SelectMany(ur => ur.Role.RolePermissions)
            .Select(rp => rp.PermissionCode)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        return (roles, permissions);
    }

    private static CurrentUserDto MapToCurrentUserDto(
        User user,
        IReadOnlyList<string> roles,
        IReadOnlyList<string> permissions) =>
        new(
            user.Id,
            user.Username,
            user.Email,
            user.FullName,
            user.PhoneNumber,
            user.DepartmentEntity?.Name ?? user.Department,
            user.AvatarUrl,
            user.Status.ToString(),
            roles,
            permissions,
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
