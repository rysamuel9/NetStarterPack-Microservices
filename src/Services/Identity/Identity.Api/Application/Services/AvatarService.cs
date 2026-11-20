using BuildingBlocks.Core.Common;
using BuildingBlocks.Core.Constants;
using BuildingBlocks.Core.Interfaces;
using Identity.Api.Application.DTOs;
using Identity.Api.Application.Interfaces;
using Identity.Api.Domain.Entities;
using Identity.Api.Domain.Interfaces;

namespace Identity.Api.Application.Services;

public class AvatarService(
    IIdentityUnitOfWork unitOfWork,
    IAvatarStorage storage,
    ICurrentUserService currentUserService,
    ICacheService? cacheService = null) : IAvatarService
{
    public const long MaxFileSizeBytes = 5 * 1024 * 1024; // 5 MB

    public async Task<Result<CurrentUserDto>> UploadAsync(Stream content, long length, CancellationToken cancellationToken = default)
    {
        if (currentUserService.UserId is null)
        {
            return Result<CurrentUserDto>.Failure("Tidak terautentikasi.", 401);
        }

        if (length <= 0)
        {
            return Result<CurrentUserDto>.Failure("File foto kosong.", 400);
        }

        if (length > MaxFileSizeBytes)
        {
            return Result<CurrentUserDto>.Failure("Ukuran foto maksimal 5 MB.", 400);
        }

        // Baca isi file (sudah dibatasi 5 MB) lalu cek signature aslinya, jangan percaya ekstensi / content-type dari client.
        using var buffer = new MemoryStream();
        await content.CopyToAsync(buffer, cancellationToken);
        if (buffer.Length > MaxFileSizeBytes)
        {
            return Result<CurrentUserDto>.Failure("Ukuran foto maksimal 5 MB.", 400);
        }

        var extension = DetectExtension(buffer.GetBuffer().AsSpan(0, (int)buffer.Length));
        if (extension is null)
        {
            return Result<CurrentUserDto>.Failure("Format foto harus JPG atau PNG.", 400);
        }

        var user = await unitOfWork.Users.GetWithRolesAndPermissionsByIdAsync(currentUserService.UserId.Value, cancellationToken);
        if (user is null)
        {
            return Result<CurrentUserDto>.Failure("Pengguna tidak ditemukan.", 404);
        }

        buffer.Position = 0;
        await storage.SaveAsync(user.Id, extension, buffer, cancellationToken);

        user.AvatarUrl = $"/api/auth/avatar/{user.Id}?v={DateTime.UtcNow.Ticks}";
        return await SaveAsync(user, "UPLOAD_AVATAR", "mengunggah foto profil", "Foto profil berhasil diperbarui.", cancellationToken);
    }

    public async Task<Result<CurrentUserDto>> RemoveAsync(CancellationToken cancellationToken = default)
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

        storage.Delete(user.Id);
        user.AvatarUrl = null;
        return await SaveAsync(user, "REMOVE_AVATAR", "menghapus foto profil", "Foto profil berhasil dihapus.", cancellationToken);
    }

    public AvatarFile? GetAvatar(Guid userId) => storage.Find(userId);

    private async Task<Result<CurrentUserDto>> SaveAsync(User user, string action, string detail, string message, CancellationToken cancellationToken)
    {
        user.UpdatedAt = DateTime.UtcNow;
        user.UpdatedBy = user.Username;
        unitOfWork.Users.Update(user);

        await unitOfWork.Repository<AuditLog>().AddAsync(new AuditLog
        {
            UserId = user.Id,
            UserName = user.Username,
            Action = action,
            Module = "Auth",
            EntityId = user.Id.ToString(),
            Details = $"[Identity.Api] User '{user.Username}' {detail}.",
            IpAddress = currentUserService.IpAddress
        }, cancellationToken);

        await unitOfWork.SaveChangesAsync(cancellationToken);
        if (cacheService is not null)
        {
            await cacheService.RemoveByPrefixAsync(CacheKeys.UsersPrefix, cancellationToken);
            await cacheService.RemoveByPrefixAsync(CacheKeys.DashboardPrefix, cancellationToken);
        }

        return Result<CurrentUserDto>.Success(AuthService.BuildCurrentUserDto(user), message);
    }

    private static string? DetectExtension(ReadOnlySpan<byte> data)
    {
        ReadOnlySpan<byte> png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        if (data.Length >= png.Length && data[..png.Length].SequenceEqual(png)) return ".png";
        if (data.Length >= 3 && data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF) return ".jpg";
        return null;
    }
}
