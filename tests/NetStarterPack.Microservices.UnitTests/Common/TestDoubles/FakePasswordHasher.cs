using Identity.Api.Application.Interfaces;

namespace NetStarterPack.Microservices.UnitTests.Common.TestDoubles;

/// <summary>
/// Pengganti ringan PasswordHasher (PBKDF2 100k iterasi) saat seeding puluhan user di unit test
/// non-kriptografi agar eksekusi test jauh lebih cepat.
/// Pengujian PBKDF2 asli tetap dilakukan di PasswordHasherTests.
/// </summary>
public sealed class FakePasswordHasher : IPasswordHasher
{
    private const string Prefix = "FAKEHASH::";

    public string HashPassword(string password) => $"{Prefix}{password}";

    public bool VerifyPassword(string password, string passwordHash) =>
        string.Equals(passwordHash, $"{Prefix}{password}", StringComparison.Ordinal);
}
