using System.Text;

namespace BuildingBlocks.Core.Common;

/// <summary>
/// Kebijakan validasi upload file berbasis ekstensi, ukuran maksimum, dan pemeriksaan isi biner (Magic Bytes).
/// </summary>
public sealed class FileValidationPolicy
{
    public long MaxSizeBytes { get; init; } = 10 * 1024 * 1024;
    public IReadOnlySet<string> AllowedExtensions { get; init; } = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

    /// <summary>Avatar profil user: hanya JPG, PNG, atau WebP (maks 5 MB).</summary>
    public static FileValidationPolicy AvatarImage { get; } = new()
    {
        MaxSizeBytes = 5 * 1024 * 1024,
        AllowedExtensions = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            ".jpg", ".jpeg", ".png", ".webp"
        }
    };

    /// <summary>Banner &amp; lampiran gambar pengumuman: JPG, PNG, WebP, GIF, atau SVG bersih tanpa script (maks 10 MB).</summary>
    public static FileValidationPolicy BannerOrImage { get; } = new()
    {
        MaxSizeBytes = 10 * 1024 * 1024,
        AllowedExtensions = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"
        }
    };

    /// <summary>Lampiran dokumen &amp; gambar umum (maks 10 MB).</summary>
    public static FileValidationPolicy DocumentOrImage { get; } = new()
    {
        MaxSizeBytes = 10 * 1024 * 1024,
        AllowedExtensions = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg",
            ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".csv", ".zip"
        }
    };
}

public sealed record ValidatedFileInfo(
    string SafeFileName,
    string Extension,
    string ContentType,
    bool IsImage);

/// <summary>
/// Validator terpusat untuk memeriksa signature asli isi file (Magic Bytes) dan mencegah file berbahaya yang hanya di-rename ekstensinya
/// (misal .exe atau script HTML yang diganti menjadi .png / .pdf) serta mencegah SVG XSS &amp; path traversal.
/// </summary>
public static class FileSignatureValidator
{
    private static readonly HashSet<string> ImageExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"
    };

    private static readonly string[] ForbiddenSvgPatterns =
    [
        "<script", "javascript:", "onload=", "onerror=", "onclick=", "onmouseover=",
        "onfocus=", "onmouseenter=", "<iframe", "<object", "<embed", "<foreignobject"
    ];

    public static Result<ValidatedFileInfo> Validate(
        ReadOnlySpan<byte> content,
        string? originalFileName,
        FileValidationPolicy policy)
    {
        if (content.IsEmpty)
        {
            return Result<ValidatedFileInfo>.Failure("File yang diunggah tidak boleh kosong.", 400);
        }

        if (content.Length > policy.MaxSizeBytes)
        {
            var maxMb = Math.Max(1, policy.MaxSizeBytes / (1024 * 1024));
            return Result<ValidatedFileInfo>.Failure($"Ukuran file melebihi batas maksimal {maxMb} MB.", 400);
        }

        var safeName = SanitizeFileName(originalFileName);
        var ext = Path.GetExtension(safeName).ToLowerInvariant();

        // Fallback deteksi otomatis dari magic bytes jika nama file tidak punya ekstensi (misal upload stream avatar)
        if (string.IsNullOrWhiteSpace(ext))
        {
            ext = DetectImageExtensionFromMagicBytes(content) ?? string.Empty;
            if (!string.IsNullOrEmpty(ext))
            {
                safeName = $"file{ext}";
            }
        }

        if (string.IsNullOrWhiteSpace(ext) || !policy.AllowedExtensions.Contains(ext))
        {
            var allowedList = string.Join(", ", policy.AllowedExtensions.OrderBy(e => e));
            return Result<ValidatedFileInfo>.Failure(
                $"Tipe file tidak diizinkan. Format yang diterima: {allowedList}.",
                400);
        }

        // Cek apakah file sebenarnya adalah executable (Windows PE "MZ" atau Linux ELF "\x7FELF")
        if (LooksLikeExecutable(content))
        {
            return Result<ValidatedFileInfo>.Failure(
                "File terdeteksi sebagai berkas executable/program dan ditolak demi keamanan.",
                400);
        }

        if (!MatchesExpectedSignature(content, ext, out var canonicalContentType, out var failureDetail))
        {
            return Result<ValidatedFileInfo>.Failure(
                failureDetail ?? $"Isi file tidak cocok dengan format '{ext}' (validasi magic-bytes gagal).",
                400);
        }

        return Result<ValidatedFileInfo>.Success(new ValidatedFileInfo(
            SafeFileName: safeName,
            Extension: ext == ".jpeg" ? ".jpg" : ext,
            ContentType: canonicalContentType,
            IsImage: ImageExtensions.Contains(ext)));
    }

    public static string SanitizeFileName(string? fileName)
    {
        var baseName = Path.GetFileName(fileName ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(baseName))
        {
            return "file";
        }

        var invalid = Path.GetInvalidFileNameChars();
        var cleaned = new string(baseName.Where(c => !invalid.Contains(c) && c != '\0').ToArray());
        return string.IsNullOrWhiteSpace(cleaned) ? "file" : cleaned;
    }

    public static string NormalizeObjectKey(string folder, string fileName)
    {
        var safeFolder = string.Join(
            "/",
            (folder ?? string.Empty)
                .Replace('\\', '/')
                .Split('/', StringSplitOptions.RemoveEmptyEntries)
                .Where(seg => seg is not "." and not "..")
                .Select(seg => seg.Trim()));

        var safeFile = SanitizeFileName(fileName);
        if (safeFile.Contains("..", StringComparison.Ordinal))
        {
            throw new ArgumentException("Nama file tidak valid (path traversal terdeteksi).", nameof(fileName));
        }

        return string.IsNullOrWhiteSpace(safeFolder) ? safeFile : $"{safeFolder}/{safeFile}";
    }

    public static string? DetectImageExtensionFromMagicBytes(ReadOnlySpan<byte> data)
    {
        if (IsPng(data)) return ".png";
        if (IsJpeg(data)) return ".jpg";
        if (IsGif(data)) return ".gif";
        if (IsWebP(data)) return ".webp";
        return null;
    }

    private static bool MatchesExpectedSignature(
        ReadOnlySpan<byte> data,
        string ext,
        out string contentType,
        out string? failureDetail)
    {
        failureDetail = null;

        switch (ext)
        {
            case ".png":
                contentType = "image/png";
                return IsPng(data);

            case ".jpg":
            case ".jpeg":
                contentType = "image/jpeg";
                return IsJpeg(data);

            case ".gif":
                contentType = "image/gif";
                return IsGif(data);

            case ".webp":
                contentType = "image/webp";
                return IsWebP(data);

            case ".svg":
                contentType = "image/svg+xml";
                return IsSafeSvg(data, out failureDetail);

            case ".pdf":
                contentType = "application/pdf";
                return data.Length >= 5 && data[..5].SequenceEqual("%PDF-"u8);

            case ".zip":
                contentType = "application/zip";
                return IsZipArchive(data);

            case ".docx":
                contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
                return IsZipArchive(data);

            case ".xlsx":
                contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
                return IsZipArchive(data);

            case ".pptx":
                contentType = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
                return IsZipArchive(data);

            case ".doc":
                contentType = "application/msword";
                return IsOle2Compound(data);

            case ".xls":
                contentType = "application/vnd.ms-excel";
                return IsOle2Compound(data);

            case ".ppt":
                contentType = "application/vnd.ms-powerpoint";
                return IsOle2Compound(data);

            case ".txt":
                contentType = "text/plain; charset=utf-8";
                return IsPlainUtf8Text(data, out failureDetail);

            case ".csv":
                contentType = "text/csv; charset=utf-8";
                return IsPlainUtf8Text(data, out failureDetail);

            default:
                contentType = "application/octet-stream";
                return false;
        }
    }

    private static ReadOnlySpan<byte> PngSignature => [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    private static ReadOnlySpan<byte> Ole2Signature => [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];

    private static bool IsPng(ReadOnlySpan<byte> data) =>
        data.Length >= 8 && data[..8].SequenceEqual(PngSignature);

    private static bool IsJpeg(ReadOnlySpan<byte> data) =>
        data.Length >= 3 && data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF;

    private static bool IsGif(ReadOnlySpan<byte> data) =>
        data.Length >= 6 && (data[..6].SequenceEqual("GIF87a"u8) || data[..6].SequenceEqual("GIF89a"u8));

    private static bool IsWebP(ReadOnlySpan<byte> data) =>
        data.Length >= 12 && data[..4].SequenceEqual("RIFF"u8) && data.Slice(8, 4).SequenceEqual("WEBP"u8);

    private static bool IsZipArchive(ReadOnlySpan<byte> data) =>
        data.Length >= 4 &&
        ((data[0] == 0x50 && data[1] == 0x4B && data[2] == 0x03 && data[3] == 0x04) ||
         (data[0] == 0x50 && data[1] == 0x4B && data[2] == 0x05 && data[3] == 0x06));

    private static bool IsOle2Compound(ReadOnlySpan<byte> data) =>
        data.Length >= 8 && data[..8].SequenceEqual(Ole2Signature);

    private static bool LooksLikeExecutable(ReadOnlySpan<byte> data) =>
        (data.Length >= 2 && data[0] == 0x4D && data[1] == 0x5A) || // Windows PE / EXE / DLL ("MZ")
        (data.Length >= 4 && data[0] == 0x7F && data[1] == 0x45 && data[2] == 0x4C && data[3] == 0x46); // Linux ELF

    private static bool IsSafeSvg(ReadOnlySpan<byte> data, out string? failureDetail)
    {
        failureDetail = null;
        if (data.IndexOf((byte)0) >= 0)
        {
            failureDetail = "File SVG mengandung byte biner tidak valid.";
            return false;
        }

        string text;
        try
        {
            text = Encoding.UTF8.GetString(data);
        }
        catch
        {
            failureDetail = "File SVG bukan teks UTF-8 yang valid.";
            return false;
        }

        var lower = text.ToLowerInvariant();
        if (!lower.Contains("<svg", StringComparison.Ordinal))
        {
            failureDetail = "File .svg tidak memiliki elemen root <svg> yang valid.";
            return false;
        }

        foreach (var forbidden in ForbiddenSvgPatterns)
        {
            if (lower.Contains(forbidden, StringComparison.Ordinal))
            {
                failureDetail = "File SVG ditolak karena mengandung elemen/atribut skrip berbahaya (anti-XSS).";
                return false;
            }
        }

        return true;
    }

    private static bool IsPlainUtf8Text(ReadOnlySpan<byte> data, out string? failureDetail)
    {
        failureDetail = null;
        if (data.IndexOf((byte)0) >= 0)
        {
            failureDetail = "File teks (.txt/.csv) tidak boleh berisi data biner.";
            return false;
        }

        return true;
    }
}
