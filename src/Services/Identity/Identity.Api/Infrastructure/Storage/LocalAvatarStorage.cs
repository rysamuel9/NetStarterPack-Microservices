using Identity.Api.Application.Interfaces;

namespace Identity.Api.Infrastructure.Storage;

/// <summary>Simpan foto profil di folder <c>uploads/avatars</c> (satu file per user: {userId}.jpg / .png).</summary>
public class LocalAvatarStorage(IWebHostEnvironment environment) : IAvatarStorage
{
    private static readonly string[] Extensions = [".jpg", ".png"];

    private string Folder => Path.Combine(environment.ContentRootPath, "uploads", "avatars");

    public async Task SaveAsync(Guid userId, string extension, Stream content, CancellationToken cancellationToken = default)
    {
        Directory.CreateDirectory(Folder);
        Delete(userId);

        var path = Path.Combine(Folder, $"{userId:N}{extension}");
        await using var file = File.Create(path);
        await content.CopyToAsync(file, cancellationToken);
    }

    public void Delete(Guid userId)
    {
        foreach (var ext in Extensions)
        {
            var path = Path.Combine(Folder, $"{userId:N}{ext}");
            if (File.Exists(path)) File.Delete(path);
        }
    }

    public AvatarFile? Find(Guid userId)
    {
        foreach (var ext in Extensions)
        {
            var path = Path.Combine(Folder, $"{userId:N}{ext}");
            if (File.Exists(path))
            {
                return new AvatarFile(path, ext == ".png" ? "image/png" : "image/jpeg");
            }
        }

        return null;
    }
}
