using System.Collections.Concurrent;
using BuildingBlocks.Core.Common;
using BuildingBlocks.Core.Interfaces;

namespace NetStarterPack.Microservices.UnitTests.Common.TestDoubles;

/// <summary>
/// Test double in-memory untuk <see cref="IFileStorageService"/> agar unit test upload/download/delete
/// berjalan cepat di RAM tanpa menyentuh disk lokal maupun server MinIO/S3.
/// </summary>
public sealed class InMemoryFileStorageService : IFileStorageService
{
    private readonly ConcurrentDictionary<string, (byte[] Bytes, string ContentType)> _files = new(StringComparer.OrdinalIgnoreCase);

    public string ProviderName => "InMemoryTest";
    public int Count => _files.Count;

    public async Task<StoredFileResult> UploadAsync(
        string folder,
        string fileName,
        Stream content,
        string contentType,
        CancellationToken cancellationToken = default)
    {
        var objectKey = FileSignatureValidator.NormalizeObjectKey(folder, fileName);
        if (content.CanSeek) content.Position = 0;

        using var ms = new MemoryStream();
        await content.CopyToAsync(ms, cancellationToken);
        var bytes = ms.ToArray();

        _files[objectKey] = (bytes, contentType);
        return new StoredFileResult(objectKey, Path.GetFileName(objectKey), contentType, bytes.LongLength, ProviderName);
    }

    public Task<StoredFileStream?> OpenReadAsync(string objectKey, CancellationToken cancellationToken = default)
    {
        if (!_files.TryGetValue(objectKey, out var entry))
        {
            return Task.FromResult<StoredFileStream?>(null);
        }

        var stream = new MemoryStream(entry.Bytes, writable: false);
        return Task.FromResult<StoredFileStream?>(
            new StoredFileStream(stream, entry.ContentType, Path.GetFileName(objectKey), entry.Bytes.LongLength));
    }

    public Task<bool> DeleteAsync(string objectKey, CancellationToken cancellationToken = default) =>
        Task.FromResult(_files.TryRemove(objectKey, out _));

    public Task<bool> ExistsAsync(string objectKey, CancellationToken cancellationToken = default) =>
        Task.FromResult(_files.ContainsKey(objectKey));
}
