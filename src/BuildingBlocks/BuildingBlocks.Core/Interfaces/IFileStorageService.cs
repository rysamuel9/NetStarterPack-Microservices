namespace BuildingBlocks.Core.Interfaces;

/// <summary>
/// Metadata hasil upload file dari <see cref="IFileStorageService"/> (baik LocalDisk maupun MinIO/S3).
/// </summary>
public sealed record StoredFileResult(
    string ObjectKey,
    string StoredFileName,
    string ContentType,
    long SizeBytes,
    string Provider);

/// <summary>
/// Stream hasil baca file dari storage beserta metadata ContentType dan nama file.
/// Selalu buang menggunakan <c>await using</c> atau serahkan langsung ke <c>ControllerBase.File(...)</c>.
/// </summary>
public sealed class StoredFileStream(
    Stream content,
    string contentType,
    string fileName,
    long? sizeBytes = null,
    IDisposable? ownerResource = null) : IAsyncDisposable, IDisposable
{
    public Stream Content { get; } = content;
    public string ContentType { get; } = contentType;
    public string FileName { get; } = fileName;
    public long? SizeBytes { get; } = sizeBytes;

    public void Dispose()
    {
        Content.Dispose();
        ownerResource?.Dispose();
    }

    public async ValueTask DisposeAsync()
    {
        await Content.DisposeAsync();
        if (ownerResource is IAsyncDisposable asyncOwner)
        {
            await asyncOwner.DisposeAsync();
        }
        else
        {
            ownerResource?.Dispose();
        }
    }
}

/// <summary>
/// Kontrak penyimpanan file bersama lintas microservice (Avatar, Banner, Image, Attachment).
/// Provider dapat diganti lewat konfigurasi <c>FileStorageSettings:Provider</c> antara <c>LocalDisk</c> dan <c>S3</c> (MinIO / AWS S3 / Cloudflare R2).
/// </summary>
public interface IFileStorageService
{
    string ProviderName { get; }

    Task<StoredFileResult> UploadAsync(
        string folder,
        string fileName,
        Stream content,
        string contentType,
        CancellationToken cancellationToken = default);

    Task<StoredFileStream?> OpenReadAsync(
        string objectKey,
        CancellationToken cancellationToken = default);

    Task<bool> DeleteAsync(
        string objectKey,
        CancellationToken cancellationToken = default);

    Task<bool> ExistsAsync(
        string objectKey,
        CancellationToken cancellationToken = default);
}
