using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;

namespace NetStarterPack.Microservices.UnitTests.Common.TestDoubles;

/// <summary>
/// IHostEnvironment terisolasi per test dengan folder temp unik yang otomatis dibersihkan saat Dispose,
/// sehingga aman saat xUnit menjalankan banyak test Announcement secara paralel.
/// </summary>
public sealed class FakeHostEnvironment : IHostEnvironment, IDisposable
{
    public string EnvironmentName { get; set; } = "Development";
    public string ApplicationName { get; set; } = "Announcement.Api.Tests";
    public string ContentRootPath { get; set; } = Path.Combine(Path.GetTempPath(), $"nsp-ann-tests-{Guid.NewGuid():N}");
    public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();

    public void Dispose()
    {
        try
        {
            if (Directory.Exists(ContentRootPath))
            {
                Directory.Delete(ContentRootPath, recursive: true);
            }
        }
        catch
        {
            // Abaikan error cleanup temp folder di Windows jika file handle masih tertutup bertahap
        }
    }
}
