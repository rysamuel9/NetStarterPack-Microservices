using BuildingBlocks.Core.Common;
using Identity.Api.Application.DTOs;

namespace Identity.Api.Application.Interfaces;

public record AvatarFile(string FullPath, string ContentType);

/// <summary>Abstraksi penyimpanan file foto profil (default: disk lokal).</summary>
public interface IAvatarStorage
{
    Task SaveAsync(Guid userId, string extension, Stream content, CancellationToken cancellationToken = default);
    void Delete(Guid userId);
    AvatarFile? Find(Guid userId);
}

public interface IAvatarService
{
    Task<Result<CurrentUserDto>> UploadAsync(Stream content, long length, CancellationToken cancellationToken = default);
    Task<Result<CurrentUserDto>> RemoveAsync(CancellationToken cancellationToken = default);
    AvatarFile? GetAvatar(Guid userId);
}
