using System.Net;
using Amazon;
using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;
using Amazon.S3.Util;
using BuildingBlocks.Core.Common;
using BuildingBlocks.Core.Interfaces;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace BuildingBlocks.Infrastructure.Storage;

public class FileStorageSettings
{
    public const string SectionName = "FileStorageSettings";

    /// <summary>
    /// Provider penyimpanan file: <c>LocalDisk</c> (default lokal F5) atau <c>S3</c> (MinIO / AWS S3 / Cloudflare R2 / Spaces).
    /// </summary>
    public string Provider { get; set; } = "LocalDisk";

    /// <summary>Direktori root penyimpanan saat mode <c>LocalDisk</c> (relatif terhadap ContentRootPath atau path absolut).</summary>
    public string LocalRootPath { get; set; } = Path.Combine("App_Data", "uploads");

    /// <summary>Endpoint S3/MinIO (contoh: http://localhost:9000 untuk MinIO; kosongkan untuk AWS S3 standar).</summary>
    public string ServiceUrl { get; set; } = "http://localhost:9000";

    public string BucketName { get; set; } = "netstarterpack-files";
    public string Region { get; set; } = "ap-southeast-1";
    public string AccessKey { get; set; } = "minioadmin";
    public string SecretKey { get; set; } = "minioadmin";
    public bool ForcePathStyle { get; set; } = true;
    public bool AutoCreateBucket { get; set; } = true;
}

/// <summary>
/// Implementasi <see cref="IFileStorageService"/> berbasis disk lokal (default development / single server).
/// Dilengkapi proteksi path-traversal agar tidak pernah menulis atau membaca di luar direktori root yang diizinkan.
/// </summary>
public class LocalDiskFileStorageService : IFileStorageService
{
    private readonly string _rootDirectory;
    private readonly FileExtensionContentTypeProvider _contentTypeProvider = new();

    public string ProviderName => "LocalDisk";

    public LocalDiskFileStorageService(
        IHostEnvironment hostEnvironment,
        IOptions<FileStorageSettings> options)
    {
        var configuredPath = options.Value.LocalRootPath;
        var resolved = Path.IsPathRooted(configuredPath)
            ? configuredPath
            : Path.Combine(hostEnvironment.ContentRootPath, configuredPath);

        _rootDirectory = Path.GetFullPath(resolved);
    }

    public async Task<StoredFileResult> UploadAsync(
        string folder,
        string fileName,
        Stream content,
        string contentType,
        CancellationToken cancellationToken = default)
    {
        var objectKey = FileSignatureValidator.NormalizeObjectKey(folder, fileName);
        var targetPath = ResolveSafePath(objectKey);

        var parentDir = Path.GetDirectoryName(targetPath);
        if (!string.IsNullOrEmpty(parentDir))
        {
            Directory.CreateDirectory(parentDir);
        }

        if (content.CanSeek)
        {
            content.Position = 0;
        }

        await using (var fs = new FileStream(targetPath, FileMode.Create, FileAccess.Write, FileShare.None, 81920, useAsync: true))
        {
            await content.CopyToAsync(fs, cancellationToken);
        }

        var size = new FileInfo(targetPath).Length;
        return new StoredFileResult(
            ObjectKey: objectKey,
            StoredFileName: Path.GetFileName(targetPath),
            ContentType: string.IsNullOrWhiteSpace(contentType) ? ResolveContentType(targetPath) : contentType,
            SizeBytes: size,
            Provider: ProviderName);
    }

    public Task<StoredFileStream?> OpenReadAsync(string objectKey, CancellationToken cancellationToken = default)
    {
        var targetPath = TryResolveSafePath(objectKey);
        if (targetPath is null || !File.Exists(targetPath))
        {
            return Task.FromResult<StoredFileStream?>(null);
        }

        var info = new FileInfo(targetPath);
        var stream = new FileStream(targetPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete, 81920, useAsync: true);
        var result = new StoredFileStream(
            content: stream,
            contentType: ResolveContentType(targetPath),
            fileName: info.Name,
            sizeBytes: info.Length);

        return Task.FromResult<StoredFileStream?>(result);
    }

    public Task<bool> DeleteAsync(string objectKey, CancellationToken cancellationToken = default)
    {
        var targetPath = TryResolveSafePath(objectKey);
        if (targetPath is null || !File.Exists(targetPath))
        {
            return Task.FromResult(false);
        }

        File.Delete(targetPath);
        return Task.FromResult(true);
    }

    public Task<bool> ExistsAsync(string objectKey, CancellationToken cancellationToken = default)
    {
        var targetPath = TryResolveSafePath(objectKey);
        return Task.FromResult(targetPath is not null && File.Exists(targetPath));
    }

    private string ResolveSafePath(string objectKey)
    {
        var resolved = TryResolveSafePath(objectKey);
        if (resolved is null)
        {
            throw new InvalidOperationException($"ObjectKey '{objectKey}' berada di luar direktori storage yang diizinkan.");
        }

        return resolved;
    }

    private string? TryResolveSafePath(string objectKey)
    {
        if (string.IsNullOrWhiteSpace(objectKey) || objectKey.Contains("..", StringComparison.Ordinal))
        {
            return null;
        }

        var segments = objectKey.Replace('\\', '/').Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (segments.Length == 0 || segments.Any(s => s is "." or ".."))
        {
            return null;
        }

        var combined = Path.GetFullPath(Path.Combine([_rootDirectory, .. segments]));
        var rootWithSep = _rootDirectory.EndsWith(Path.DirectorySeparatorChar)
            ? _rootDirectory
            : _rootDirectory + Path.DirectorySeparatorChar;

        return combined.StartsWith(rootWithSep, StringComparison.OrdinalIgnoreCase) ? combined : null;
    }

    private string ResolveContentType(string filePath) =>
        _contentTypeProvider.TryGetContentType(filePath, out var ct) ? ct : "application/octet-stream";
}

/// <summary>
/// Implementasi <see cref="IFileStorageService"/> berbasis protokol S3 (kompatibel dengan MinIO, AWS S3, Cloudflare R2, &amp; Spaces).
/// Cocok untuk scale-out multi-server / Docker / Kubernetes tanpa kehilangan file saat redeploy.
/// </summary>
public sealed class S3FileStorageService : IFileStorageService, IDisposable
{
    private readonly FileStorageSettings _settings;
    private readonly IAmazonS3 _s3Client;
    private readonly ILogger<S3FileStorageService> _logger;
    private readonly SemaphoreSlim _bucketLock = new(1, 1);
    private bool _bucketEnsured;

    public string ProviderName => "S3";

    public S3FileStorageService(
        IOptions<FileStorageSettings> options,
        ILogger<S3FileStorageService> logger)
    {
        _settings = options.Value;
        _logger = logger;

        var config = new AmazonS3Config
        {
            ForcePathStyle = _settings.ForcePathStyle
        };

        if (!string.IsNullOrWhiteSpace(_settings.ServiceUrl))
        {
            config.ServiceURL = _settings.ServiceUrl;
            config.AuthenticationRegion = _settings.Region;
        }
        else
        {
            config.RegionEndpoint = RegionEndpoint.GetBySystemName(_settings.Region);
        }

        var credentials = new BasicAWSCredentials(_settings.AccessKey, _settings.SecretKey);
        _s3Client = new AmazonS3Client(credentials, config);
    }

    public async Task<StoredFileResult> UploadAsync(
        string folder,
        string fileName,
        Stream content,
        string contentType,
        CancellationToken cancellationToken = default)
    {
        await EnsureBucketExistsAsync(cancellationToken);

        var objectKey = FileSignatureValidator.NormalizeObjectKey(folder, fileName);
        if (content.CanSeek)
        {
            content.Position = 0;
        }

        var size = content.CanSeek ? content.Length : 0;

        var putRequest = new PutObjectRequest
        {
            BucketName = _settings.BucketName,
            Key = objectKey,
            InputStream = content,
            ContentType = string.IsNullOrWhiteSpace(contentType) ? "application/octet-stream" : contentType,
            AutoCloseStream = false
        };

        await _s3Client.PutObjectAsync(putRequest, cancellationToken);

        return new StoredFileResult(
            ObjectKey: objectKey,
            StoredFileName: Path.GetFileName(objectKey),
            ContentType: putRequest.ContentType,
            SizeBytes: size,
            Provider: ProviderName);
    }

    public async Task<StoredFileStream?> OpenReadAsync(string objectKey, CancellationToken cancellationToken = default)
    {
        try
        {
            var response = await _s3Client.GetObjectAsync(new GetObjectRequest
            {
                BucketName = _settings.BucketName,
                Key = objectKey
            }, cancellationToken);

            var contentType = string.IsNullOrWhiteSpace(response.Headers.ContentType)
                ? "application/octet-stream"
                : response.Headers.ContentType;

            return new StoredFileStream(
                content: response.ResponseStream,
                contentType: contentType,
                fileName: Path.GetFileName(objectKey),
                sizeBytes: response.ContentLength,
                ownerResource: response);
        }
        catch (AmazonS3Exception ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }
    }

    public async Task<bool> DeleteAsync(string objectKey, CancellationToken cancellationToken = default)
    {
        try
        {
            await _s3Client.DeleteObjectAsync(new DeleteObjectRequest
            {
                BucketName = _settings.BucketName,
                Key = objectKey
            }, cancellationToken);
            return true;
        }
        catch (AmazonS3Exception ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            return false;
        }
    }

    public async Task<bool> ExistsAsync(string objectKey, CancellationToken cancellationToken = default)
    {
        try
        {
            await _s3Client.GetObjectMetadataAsync(new GetObjectMetadataRequest
            {
                BucketName = _settings.BucketName,
                Key = objectKey
            }, cancellationToken);
            return true;
        }
        catch (AmazonS3Exception ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            return false;
        }
    }

    private async Task EnsureBucketExistsAsync(CancellationToken cancellationToken)
    {
        if (!_settings.AutoCreateBucket || _bucketEnsured)
        {
            return;
        }

        await _bucketLock.WaitAsync(cancellationToken);
        try
        {
            if (_bucketEnsured) return;

            var exists = await AmazonS3Util.DoesS3BucketExistV2Async(_s3Client, _settings.BucketName);
            if (!exists)
            {
                await _s3Client.PutBucketAsync(new PutBucketRequest
                {
                    BucketName = _settings.BucketName,
                    UseClientRegion = true
                }, cancellationToken);
                _logger.LogInformation("[S3 STORAGE] Bucket '{BucketName}' berhasil dibuat otomatis.", _settings.BucketName);
            }

            _bucketEnsured = true;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[S3 STORAGE] Gagal mengecek/membuat bucket '{BucketName}'.", _settings.BucketName);
        }
        finally
        {
            _bucketLock.Release();
        }
    }

    public void Dispose()
    {
        _bucketLock.Dispose();
        _s3Client.Dispose();
    }
}
