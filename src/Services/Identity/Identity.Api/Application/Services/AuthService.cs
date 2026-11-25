using System.Security.Cryptography;
using System.Text;
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
    public const int MaxFailedLoginAttempts = 5;
    public const int LockoutDurationMinutes = 15;
    private const string TokenHashPrefix = "sha256:";

    public static string HashRefreshToken(string rawToken)
    {
        var hashBytes = SHA256.HashData(Encoding.UTF8.GetBytes(rawToken));
        return TokenHashPrefix + Convert.ToHexString(hashBytes);
    }

    public static string? ValidatePasswordStrength(string? password)
    {
        if (string.IsNullOrWhiteSpace(password) || password.Length < 8)
        {
            return "Password minimal 8 karakter.";
        }

        if (!password.Any(char.IsUpper) || !password.Any(char.IsLower) || !password.Any(char.IsDigit))
        {
            return "Password wajib mengandung huruf besar, huruf kecil, dan angka.";
        }

        return null;
    }

    public async Task<Result<AuthResponse>> LoginAsync(LoginRequest request, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.UsernameOrEmail) || string.IsNullOrWhiteSpace(request.Password))
        {
            return Result<AuthResponse>.Failure("Username/Email dan Password wajib diisi.", 400);
        }

        var normalizedIdentity = request.UsernameOrEmail.Trim().ToLowerInvariant();

        // 1. Cek Distributed Account Lockout (Hybrid Cache L1/L2) sebelum memverifikasi password
        if (cacheService is not null)
        {
            var lockedUntil = await cacheService.GetAsync<DateTime?>(
                CacheKeys.AuthLockedUntil(normalizedIdentity),
                cancellationToken);

            if (lockedUntil.HasValue && lockedUntil.Value > DateTime.UtcNow)
            {
                var remainingMinutes = Math.Max(1, (int)Math.Ceiling((lockedUntil.Value - DateTime.UtcNow).TotalMinutes));
                return Result<AuthResponse>.Failure(
                    $"Akun sementara dikunci karena terlalu banyak percobaan login gagal. Coba lagi dalam {remainingMinutes} menit.",
                    429);
            }
        }

        var user = await unitOfWork.Users.GetWithRolesAndPermissionsByUsernameOrEmailAsync(
            normalizedIdentity,
            cancellationToken);

        if (user is null || !passwordHasher.VerifyPassword(request.Password, user.PasswordHash))
        {
            var isNowLocked = await RecordFailedLoginAttemptAsync(normalizedIdentity, user, cancellationToken);
            if (isNowLocked)
            {
                return Result<AuthResponse>.Failure(
                    $"Terlalu banyak percobaan login gagal ({MaxFailedLoginAttempts}x). Akun dikunci selama {LockoutDurationMinutes} menit.",
                    429);
            }

            return Result<AuthResponse>.Failure("Kredensial login tidak valid (username/email atau password salah).", 401);
        }

        if (user.Status != UserStatus.Active)
        {
            await unitOfWork.Repository<AuditLog>().AddAsync(new AuditLog
            {
                UserId = user.Id,
                UserName = user.Username,
                Action = "LOGIN_DENIED_INACTIVE",
                Module = "Auth",
                EntityId = user.Id.ToString(),
                Details = $"[Identity.Api] Percobaan login ditolak karena akun '{user.Username}' berstatus {user.Status}.",
                IpAddress = currentUserService.IpAddress
            }, cancellationToken);
            await unitOfWork.SaveChangesAsync(cancellationToken);

            return Result<AuthResponse>.Failure("Kredensial tidak dapat digunakan atau akun tidak aktif. Hubungi Administrator.", 403);
        }

        // Bersihkan counter failed login begitu login sukses
        if (cacheService is not null)
        {
            await cacheService.RemoveAsync(CacheKeys.AuthFailedLogin(normalizedIdentity), cancellationToken);
            await cacheService.RemoveAsync(CacheKeys.AuthLockedUntil(normalizedIdentity), cancellationToken);
        }

        var (roles, permissions) = ExtractRolesAndPermissions(user);
        var (accessToken, expiresAt) = jwtTokenService.GenerateAccessToken(user, roles, permissions);
        var rawRefreshToken = jwtTokenService.GenerateRefreshToken();
        var hashedRefreshToken = HashRefreshToken(rawRefreshToken);

        var refreshToken = new RefreshToken
        {
            UserId = user.Id,
            Token = hashedRefreshToken,
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
            rawRefreshToken,
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

        var hashedToken = HashRefreshToken(request.RefreshToken);
        var user = await unitOfWork.Users.GetByRefreshTokenAsync(hashedToken, cancellationToken);
        var lookupTokenValue = hashedToken;

        // Fallback kompatibilitas sementara untuk token legacy yang mungkin tersimpan sebelum hashing diterapkan
        if (user is null)
        {
            user = await unitOfWork.Users.GetByRefreshTokenAsync(request.RefreshToken, cancellationToken);
            lookupTokenValue = request.RefreshToken;
        }

        if (user is null)
        {
            return Result<AuthResponse>.Failure("Refresh token tidak ditemukan atau tidak valid.", 401);
        }

        var existingToken = user.RefreshTokens.FirstOrDefault(rt => rt.Token == lookupTokenValue);
        if (existingToken is null)
        {
            return Result<AuthResponse>.Failure("Refresh token tidak ditemukan atau tidak valid.", 401);
        }

        // Reuse Detection: jika token yang sudah dicabut/dirotasi dipakai ulang -> indikasi pencurian token -> cabut SEMUA sesi user
        if (existingToken.RevokedAt is not null)
        {
            var activeTokens = user.RefreshTokens.Where(rt => rt.RevokedAt is null).ToList();
            foreach (var activeToken in activeTokens)
            {
                activeToken.RevokedAt = DateTime.UtcNow;
                unitOfWork.Repository<RefreshToken>().Update(activeToken);
            }

            await unitOfWork.Repository<AuditLog>().AddAsync(new AuditLog
            {
                UserId = user.Id,
                UserName = user.Username,
                Action = "REFRESH_TOKEN_REUSE_DETECTED",
                Module = "Auth",
                EntityId = user.Id.ToString(),
                Details = $"[SECURITY ALERT] Terdeteksi pemakaian ulang refresh token yang sudah dicabut untuk '{user.Username}'. Seluruh sesi aktif ({activeTokens.Count}) otomatis dicabut.",
                IpAddress = currentUserService.IpAddress
            }, cancellationToken);

            await unitOfWork.SaveChangesAsync(cancellationToken);
            return Result<AuthResponse>.Failure("Refresh token sudah tidak berlaku. Seluruh sesi telah dicabut demi keamanan, silakan login ulang.", 401);
        }

        if (existingToken.IsExpired)
        {
            return Result<AuthResponse>.Failure("Refresh token sudah kadaluarsa. Silakan login kembali.", 401);
        }

        // Pastikan status user masih Active sebelum menerbitkan token baru
        if (user.Status != UserStatus.Active)
        {
            await RevokeAllUserTokensAsync(user.Id, cancellationToken);
            await unitOfWork.SaveChangesAsync(cancellationToken);
            return Result<AuthResponse>.Failure($"Akun Anda saat ini berstatus {user.Status}. Sesi tidak dapat diperpanjang.", 403);
        }

        var newRawRefreshToken = jwtTokenService.GenerateRefreshToken();
        var newHashedRefreshToken = HashRefreshToken(newRawRefreshToken);

        existingToken.RevokedAt = DateTime.UtcNow;
        existingToken.ReplacedByToken = newHashedRefreshToken;
        unitOfWork.Repository<RefreshToken>().Update(existingToken);

        var newRefreshToken = new RefreshToken
        {
            UserId = user.Id,
            Token = newHashedRefreshToken,
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
            newRawRefreshToken,
            expiresAt,
            MapToCurrentUserDto(user, roles, permissions)), "Token berhasil diperbarui.");
    }

    public async Task<Result> LogoutAsync(string? refreshToken, CancellationToken cancellationToken = default)
    {
        if (!string.IsNullOrWhiteSpace(refreshToken) && currentUserService.UserId is not null)
        {
            var hashedToken = HashRefreshToken(refreshToken);
            var tokenEntity = await unitOfWork.Repository<RefreshToken>()
                .FirstOrDefaultAsync(rt => rt.Token == hashedToken || rt.Token == refreshToken, cancellationToken);

            // Ownership Guard (anti-IDOR): hanya cabut token milik user yang sedang login
            if (tokenEntity is not null &&
                tokenEntity.IsActive &&
                tokenEntity.UserId == currentUserService.UserId.Value)
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
        var revokedCount = await RevokeAllUserTokensAsync(userId, cancellationToken);

        await unitOfWork.Repository<AuditLog>().AddAsync(new AuditLog
        {
            UserId = userId,
            UserName = currentUserService.Username ?? "User",
            Action = "LOGOUT_ALL_DEVICES",
            Module = "Auth",
            EntityId = userId.ToString(),
            Details = $"[Identity.Api] User '{currentUserService.Username}' mencabut seluruh sesi login aktif ({revokedCount} perangkat).",
            IpAddress = currentUserService.IpAddress
        }, cancellationToken);

        await unitOfWork.SaveChangesAsync(cancellationToken);
        if (cacheService is not null)
        {
            await cacheService.RemoveByPrefixAsync(CacheKeys.DashboardPrefix, cancellationToken);
        }
        return Result.Success($"Berhasil keluar dari semua perangkat ({revokedCount} sesi dicabut).");
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

        if (string.IsNullOrWhiteSpace(request.FullName) || string.IsNullOrWhiteSpace(request.Email))
        {
            return Result<CurrentUserDto>.Failure("Nama lengkap dan Email wajib diisi.", 400);
        }

        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        if (!normalizedEmail.Contains('@') || normalizedEmail.StartsWith('@') || normalizedEmail.EndsWith('@'))
        {
            return Result<CurrentUserDto>.Failure("Format alamat email tidak valid.", 400);
        }

        var user = await unitOfWork.Users.GetWithRolesAndPermissionsByIdAsync(currentUserService.UserId.Value, cancellationToken);
        if (user is null)
        {
            return Result<CurrentUserDto>.Failure("Pengguna tidak ditemukan.", 404);
        }

        // Cek keunikan email supaya tidak bentrok / menimpa email pengguna lain
        if (await unitOfWork.Users.AnyAsync(u => u.Id != user.Id && u.Email.ToLower() == normalizedEmail, cancellationToken))
        {
            return Result<CurrentUserDto>.Failure("Alamat email sudah digunakan oleh pengguna lain.", 409);
        }

        user.FullName = request.FullName.Trim();
        user.Email = normalizedEmail;
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

        var passwordError = ValidatePasswordStrength(request.NewPassword);
        if (passwordError is not null)
        {
            return Result.Failure(passwordError, 400);
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

        // Cabut semua refresh token aktif agar sesi lama di perangkat lain otomatis berakhir setelah ganti password
        var revokedSessions = await RevokeAllUserTokensAsync(user.Id, cancellationToken);

        await unitOfWork.Repository<AuditLog>().AddAsync(new AuditLog
        {
            UserId = user.Id,
            UserName = user.Username,
            Action = "CHANGE_PASSWORD",
            Module = "Auth",
            EntityId = user.Id.ToString(),
            Details = $"[Identity.Api] User '{user.Username}' mengganti password ({revokedSessions} sesi refresh token dicabut).",
            IpAddress = currentUserService.IpAddress
        }, cancellationToken);

        await unitOfWork.SaveChangesAsync(cancellationToken);
        return Result.Success("Password berhasil diperbarui. Semua sesi lain telah dicabut.");
    }

    private async Task<bool> RecordFailedLoginAttemptAsync(
        string normalizedIdentity,
        User? existingUser,
        CancellationToken cancellationToken)
    {
        var locked = false;
        var attempts = 1;

        if (cacheService is not null)
        {
            var failedKey = CacheKeys.AuthFailedLogin(normalizedIdentity);
            var currentAttempts = await cacheService.GetAsync<int>(failedKey, cancellationToken);
            attempts = currentAttempts + 1;
            var window = TimeSpan.FromMinutes(LockoutDurationMinutes);

            await cacheService.SetAsync(failedKey, attempts, window, cancellationToken);

            if (attempts >= MaxFailedLoginAttempts)
            {
                locked = true;
                await cacheService.SetAsync(
                    CacheKeys.AuthLockedUntil(normalizedIdentity),
                    DateTime.UtcNow.Add(window),
                    window,
                    cancellationToken);
            }
        }

        await unitOfWork.Repository<AuditLog>().AddAsync(new AuditLog
        {
            UserId = existingUser?.Id,
            UserName = existingUser?.Username ?? normalizedIdentity,
            Action = locked ? "ACCOUNT_LOCKED" : "LOGIN_FAILED",
            Module = "Auth",
            EntityId = existingUser?.Id.ToString() ?? normalizedIdentity,
            Details = locked
                ? $"[SECURITY] Akun '{normalizedIdentity}' dikunci selama {LockoutDurationMinutes} menit setelah {attempts}x percobaan login gagal."
                : $"[SECURITY] Percobaan login gagal ke-{attempts} untuk '{normalizedIdentity}'.",
            IpAddress = currentUserService.IpAddress
        }, cancellationToken);

        await unitOfWork.SaveChangesAsync(cancellationToken);
        return locked;
    }

    private async Task<int> RevokeAllUserTokensAsync(Guid userId, CancellationToken cancellationToken)
    {
        var activeTokens = await unitOfWork.Repository<RefreshToken>()
            .GetListAsync(rt => rt.UserId == userId && rt.RevokedAt == null, cancellationToken);

        foreach (var token in activeTokens)
        {
            token.RevokedAt = DateTime.UtcNow;
            unitOfWork.Repository<RefreshToken>().Update(token);
        }

        return activeTokens.Count;
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

    public static CurrentUserDto BuildCurrentUserDto(User user)
    {
        var (roles, permissions) = ExtractRolesAndPermissions(user);
        return MapToCurrentUserDto(user, roles, permissions);
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
