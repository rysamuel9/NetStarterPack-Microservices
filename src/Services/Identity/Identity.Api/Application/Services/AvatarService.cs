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
    IFileStorageService fileStorage,
    ICurrentUserService currentUserService,
    ICacheService? cacheService = null) : IAvatarService
{
    public const long MaxFileSizeBytes = 5 * 1024 * 1024; // 5 MB
    private const string AvatarFolder = "avatars";
    private static readonly string[] AvatarExtensions = [".jpg", ".png", ".webp"];

    public async Task<Result<CurrentUserDto>> UploadAsync(
        Stream content,
        long length,
        string? fileName = null,
        CancellationToken cancellationToken = default)
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

        using var buffer = new MemoryStream();
        await content.CopyToAsync(buffer, cancellationToken);

        var bytes = buffer.GetBuffer().AsSpan(0, (int)buffer.Length);
        var validation = FileSignatureValidator.Validate(bytes, fileName, FileValidationPolicy.AvatarImage);
        if (!validation.Succeeded || validation.Data is null)
        {
            return Result<CurrentUserDto>.Failure(validation.Message, 400);
        }

        var user = await unitOfWork.Users.GetWithRolesAndPermissionsByIdAsync(currentUserService.UserId.Value, cancellationToken);
        if (user is null)
        {
            return Result<CurrentUserDto>.Failure("Pengguna tidak ditemukan.", 404);
        }

        // Hapus file avatar lama (ekstensi lain) agar tidak menyisakan orphan file di disk maupun S3/MinIO
        await DeleteExistingAvatarFilesAsync(user.Id, cancellationToken);

        buffer.Position = 0;
        var storedName = $"{user.Id:N}{validation.Data.Extension}";
        await fileStorage.UploadAsync(
            AvatarFolder,
            storedName,
            buffer,
            validation.Data.ContentType,
            cancellationToken);

        user.AvatarUrl = $"/api/v1/auth/avatar/{user.Id}?v={DateTime.UtcNow.Ticks}";
        return await SaveAsync(user, "UPLOAD_AVATAR", $"mengunggah foto profil ({fileStorage.ProviderName})", "Foto profil berhasil diperbarui.", cancellationToken);
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

        await DeleteExistingAvatarFilesAsync(user.Id, cancellationToken);
        user.AvatarUrl = null;
        return await SaveAsync(user, "REMOVE_AVATAR", "menghapus foto profil", "Foto profil berhasil dihapus.", cancellationToken);
    }

    public async Task<StoredFileStream?> GetAvatarAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        foreach (var ext in AvatarExtensions)
        {
            var objectKey = FileSignatureValidator.NormalizeObjectKey(AvatarFolder, $"{userId:N}{ext}");
            var stored = await fileStorage.OpenReadAsync(objectKey, cancellationToken);
            if (stored is not null)
            {
                return stored;
            }
        }

        return null;
    }

    private async Task DeleteExistingAvatarFilesAsync(Guid userId, CancellationToken cancellationToken)
    {
        foreach (var ext in AvatarExtensions)
        {
            var objectKey = FileSignatureValidator.NormalizeObjectKey(AvatarFolder, $"{userId:N}{ext}");
            await fileStorage.DeleteAsync(objectKey, cancellationToken);
        }
    }

    private async Task<Result<CurrentUserDto>> SaveAsync(
        User user,
        string action,
        string detail,
        string message,
        CancellationToken cancellationToken)
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
}
