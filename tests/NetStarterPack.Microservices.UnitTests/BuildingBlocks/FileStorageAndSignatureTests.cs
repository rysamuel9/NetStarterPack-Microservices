using System.Text;
using BuildingBlocks.Core.Common;
using BuildingBlocks.Infrastructure.Storage;
using Identity.Api.Application.Services;
using Identity.Api.Domain.Entities;
using Identity.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using NetStarterPack.Microservices.UnitTests.Common.Factories;
using NetStarterPack.Microservices.UnitTests.Common.TestDoubles;

namespace NetStarterPack.Microservices.UnitTests.BuildingBlocks;

public class FileStorageAndSignatureTests
{
    private static readonly byte[] ValidPngBytes = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x01];
    private static readonly byte[] ValidJpgBytes = [0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10];
    private static readonly byte[] ValidWebPBytes = [0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50];
    private static readonly byte[] ValidPdfBytes = Encoding.ASCII.GetBytes("%PDF-1.7\n1 0 obj\n");
    private static readonly byte[] ValidZipBytes = [0x50, 0x4B, 0x03, 0x04, 0x14, 0x00];
    private static readonly byte[] FakeWindowsExeBytes = [0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00];

    [Fact]
    public void Validate_WithGenuineSignatures_ShouldSucceedWithCanonicalContentTypes()
    {
        var png = FileSignatureValidator.Validate(ValidPngBytes, "photo.png", FileValidationPolicy.AvatarImage);
        Assert.True(png.Succeeded);
        Assert.Equal("image/png", png.Data!.ContentType);
        Assert.Equal(".png", png.Data.Extension);

        var webp = FileSignatureValidator.Validate(ValidWebPBytes, "avatar.webp", FileValidationPolicy.AvatarImage);
        Assert.True(webp.Succeeded);
        Assert.Equal("image/webp", webp.Data!.ContentType);

        var pdf = FileSignatureValidator.Validate(ValidPdfBytes, "policy.pdf", FileValidationPolicy.DocumentOrImage);
        Assert.True(pdf.Succeeded);
        Assert.Equal("application/pdf", pdf.Data!.ContentType);
        Assert.False(pdf.Data.IsImage);

        var docx = FileSignatureValidator.Validate(ValidZipBytes, "memo.docx", FileValidationPolicy.DocumentOrImage);
        Assert.True(docx.Succeeded);
        Assert.Equal("application/vnd.openxmlformats-officedocument.wordprocessingml.document", docx.Data!.ContentType);

        var cleanSvg = Encoding.UTF8.GetBytes("<svg xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"10\" height=\"10\"/></svg>");
        var svg = FileSignatureValidator.Validate(cleanSvg, "banner.svg", FileValidationPolicy.BannerOrImage);
        Assert.True(svg.Succeeded);
        Assert.Equal("image/svg+xml", svg.Data!.ContentType);
    }

    [Fact]
    public void Validate_WithDisguisedExecutableOrXssSvgOrBinaryTxt_ShouldRejectWith400()
    {
        // .exe yang di-rename jadi .png
        var exeAsPng = FileSignatureValidator.Validate(FakeWindowsExeBytes, "virus.png", FileValidationPolicy.AvatarImage);
        Assert.False(exeAsPng.Succeeded);
        Assert.Equal(400, exeAsPng.StatusCode);

        // .exe yang di-rename jadi .pdf
        var exeAsPdf = FileSignatureValidator.Validate(FakeWindowsExeBytes, "invoice.pdf", FileValidationPolicy.DocumentOrImage);
        Assert.False(exeAsPdf.Succeeded);
        Assert.Equal(400, exeAsPdf.StatusCode);

        // PNG bytes tapi ekstensinya .pdf -> mismatch magic bytes
        var pngAsPdf = FileSignatureValidator.Validate(ValidPngBytes, "fake.pdf", FileValidationPolicy.DocumentOrImage);
        Assert.False(pngAsPdf.Succeeded);
        Assert.Equal(400, pngAsPdf.StatusCode);

        // SVG dengan payload XSS <script>
        var xssSvg = Encoding.UTF8.GetBytes("<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>");
        var xssRes = FileSignatureValidator.Validate(xssSvg, "evil.svg", FileValidationPolicy.BannerOrImage);
        Assert.False(xssRes.Succeeded);
        Assert.Contains("XSS", xssRes.Message, StringComparison.OrdinalIgnoreCase);

        // Data biner dengan null byte yang di-rename jadi .txt
        var binAsTxt = FileSignatureValidator.Validate([0x01, 0x00, 0x02, 0x03], "notes.txt", FileValidationPolicy.DocumentOrImage);
        Assert.False(binAsTxt.Succeeded);
    }

    [Fact]
    public async Task LocalDiskFileStorageService_ShouldUploadReadDeleteAndBlockPathTraversal()
    {
        var tempRoot = Path.Combine(Path.GetTempPath(), $"nsp-storage-test-{Guid.NewGuid():N}");
        Directory.CreateDirectory(tempRoot);

        try
        {
            var hostEnv = new FakeHostEnvironment { ContentRootPath = tempRoot };
            var storage = new LocalDiskFileStorageService(
                hostEnv,
                Options.Create(new FileStorageSettings { Provider = "LocalDisk", LocalRootPath = "uploads" }));

            await using var uploadStream = new MemoryStream(ValidPngBytes);
            var stored = await storage.UploadAsync("announcements", "banner.png", uploadStream, "image/png");

            Assert.Equal("LocalDisk", stored.Provider);
            Assert.Equal("announcements/banner.png", stored.ObjectKey);
            Assert.True(await storage.ExistsAsync(stored.ObjectKey));

            await using (var opened = await storage.OpenReadAsync(stored.ObjectKey))
            {
                Assert.NotNull(opened);
                Assert.Equal("image/png", opened!.ContentType);

                using var readBack = new MemoryStream();
                await opened.Content.CopyToAsync(readBack);
                Assert.Equal(ValidPngBytes, readBack.ToArray());
            }

            // Path traversal harus aman (tidak bisa membaca file di luar root)
            Assert.Null(await storage.OpenReadAsync("../../windows/win.ini"));
            Assert.False(await storage.DeleteAsync("../../evil.txt"));

            Assert.True(await storage.DeleteAsync(stored.ObjectKey));
            Assert.False(await storage.ExistsAsync(stored.ObjectKey));
        }
        finally
        {
            if (Directory.Exists(tempRoot))
            {
                Directory.Delete(tempRoot, recursive: true);
            }
        }
    }

    [Fact]
    public async Task AvatarService_UsingUnifiedFileStorage_ShouldReplaceOldFormatAndRejectFakeExecutable()
    {
        var dbOptions = new DbContextOptionsBuilder<IdentityDbContext>()
            .UseInMemoryDatabase($"AvatarTestDb_{Guid.NewGuid():N}")
            .Options;

        await using var db = new IdentityDbContext(dbOptions);
        var user = new User
        {
            Username = "avataruser",
            Email = "avataruser@starterpack.local",
            FullName = "Avatar Tester",
            PasswordHash = "hash",
            Status = UserStatus.Active
        };
        await db.Users.AddAsync(user);
        await db.SaveChangesAsync();

        var storage = new InMemoryFileStorageService();
        var currentUser = new FakeCurrentUserService { UserId = user.Id, Username = user.Username };
        var avatarService = new AvatarService(
            new IdentityUnitOfWork(db),
            storage,
            currentUser,
            TestCacheFactory.CreateInMemory());

        // 1. Fake executable renamed to avatar.jpg -> ditolak
        using var exeStream = new MemoryStream(FakeWindowsExeBytes);
        var badRes = await avatarService.UploadAsync(exeStream, FakeWindowsExeBytes.Length, "avatar.jpg");
        Assert.False(badRes.Succeeded);
        Assert.Equal(400, badRes.StatusCode);
        Assert.Equal(0, storage.Count);

        // 2. Upload valid PNG -> tersimpan di unified storage
        using var pngStream = new MemoryStream(ValidPngBytes);
        var pngRes = await avatarService.UploadAsync(pngStream, ValidPngBytes.Length, "me.png");
        Assert.True(pngRes.Succeeded);
        Assert.Equal(1, storage.Count);

        // 3. Ganti dengan WebP -> file PNG lama terhapus, tinggal 1 file WebP
        using var webpStream = new MemoryStream(ValidWebPBytes);
        var webpRes = await avatarService.UploadAsync(webpStream, ValidWebPBytes.Length, "me.webp");
        Assert.True(webpRes.Succeeded);
        Assert.Equal(1, storage.Count);

        await using var fetched = await avatarService.GetAvatarAsync(user.Id);
        Assert.NotNull(fetched);
        Assert.Equal("image/webp", fetched!.ContentType);

        // 4. Remove avatar -> storage bersih
        var removeRes = await avatarService.RemoveAsync();
        Assert.True(removeRes.Succeeded);
        Assert.Equal(0, storage.Count);
    }
}
