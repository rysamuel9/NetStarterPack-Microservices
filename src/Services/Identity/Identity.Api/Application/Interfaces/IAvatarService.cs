using BuildingBlocks.Core.Common;
using BuildingBlocks.Core.Interfaces;
using Identity.Api.Application.DTOs;

namespace Identity.Api.Application.Interfaces;

public interface IAvatarService
{
    Task<Result<CurrentUserDto>> UploadAsync(
        Stream content,
        long length,
        string? fileName = null,
        CancellationToken cancellationToken = default);

    Task<Result<CurrentUserDto>> RemoveAsync(CancellationToken cancellationToken = default);

    Task<StoredFileStream?> GetAvatarAsync(Guid userId, CancellationToken cancellationToken = default);
}
